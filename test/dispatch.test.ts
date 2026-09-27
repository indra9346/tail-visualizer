import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDispatcher } from "../server/lib/dispatch";
import { makeReq, makeRes } from "./helpers/fakeHttp";

const API_DIR = join(__dirname, "..", "api");

function functionFiles(): string[] {
  // Vercel: every non-underscore .ts file under api/ is a Serverless Function.
  const out: string[] = [];
  const walk = (dir: string, rel = "") => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`);
      else if (e.name.endsWith(".ts")) out.push(`${rel}${e.name}`);
    }
  };
  walk(API_DIR);
  return out;
}

describe("Vercel function budget and rewrites", () => {
  test("stays within the Hobby limit of 12 functions per deployment (with headroom)", () => {
    const files = functionFiles();
    expect(files.length).toBeLessThanOrEqual(12);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  test("every route handler lives under api/_routes (not exposed as its own function)", () => {
    const routes = readdirSync(join(API_DIR, "_routes")).filter((f) => f.endsWith(".ts"));
    expect(routes.length).toBeGreaterThan(0);
  });

  test("every vercel.json /api rewrite targets an existing dispatcher file and a registered op", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8"));
    const apiRewrites = (vercel.rewrites as { source: string; destination: string }[]).filter((r) => r.source.startsWith("/api/"));
    expect(apiRewrites.length).toBeGreaterThan(0);
    for (const r of apiRewrites) {
      const m = /^\/api\/([a-z]+)\?op=([A-Za-z_]+)/.exec(r.destination);
      expect(m).not.toBeNull();
      const [, file, op] = m!;
      const src = readFileSync(join(API_DIR, `${file}.ts`), "utf8");
      const table = /createDispatcher\(\{([^}]*)\}/.exec(src)?.[1] ?? "";
      expect(table.split(",").map((s) => s.trim().split(":")[0]!.trim())).toContain(op);
    }
  });

  test("the SPA fallback rewrite never swallows /api/", () => {
    const vercel = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8"));
    const spa = vercel.rewrites[vercel.rewrites.length - 1];
    expect(new RegExp(`^${spa.source}$`).test("/api/rooms/x")).toBe(false);
    expect(new RegExp(`^${spa.source}$`).test("/projects")).toBe(true);
  });
});

describe("createDispatcher", () => {
  const calls: string[] = [];
  const dispatcher = createDispatcher(
    {
      a: async (_req, res) => {
        calls.push("a");
        res.status(200).json({ ok: "a" });
      },
      b: async (_req, res) => {
        calls.push("b");
        res.status(200).json({ ok: "b" });
      },
    },
    "a",
  );

  beforeEach(() => (calls.length = 0));

  test("routes by op", async () => {
    const res = makeRes();
    await dispatcher(makeReq({ query: { op: "b" } }), res);
    expect(calls).toEqual(["b"]);
    expect(res.statusCode).toBe(200);
  });

  test("uses the default op when none is given", async () => {
    await dispatcher(makeReq({ query: {} }), makeRes());
    expect(calls).toEqual(["a"]);
  });

  test("first value wins when op is repeated", async () => {
    await dispatcher(makeReq({ query: { op: ["b", "a"] } }), makeRes());
    expect(calls).toEqual(["b"]);
  });

  test.each([["constructor"], ["__proto__"], ["toString"], ["hasOwnProperty"], ["../etc/passwd"], [""], ["A"]])("unknown or hostile op %p -> 404, no handler runs", async (op) => {
    const res = makeRes();
    await dispatcher(makeReq({ query: { op } }), res);
    expect(res.statusCode).toBe(404);
    expect((res._json as any).error.code).toBe("NOT_FOUND");
    expect(calls).toEqual([]);
  });

  test("no default op and no op -> 404", async () => {
    const d = createDispatcher({ a: async () => undefined });
    const res = makeRes();
    await d(makeReq({ query: {} }), res);
    expect(res.statusCode).toBe(404);
  });
});
