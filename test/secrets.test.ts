import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const root = process.cwd();
const serverAndApiFiles = [...walk(join(root, "server")), ...walk(join(root, "api"))];

describe("secret handling", () => {
  test("GEMINI_API_KEY is read in exactly one file", () => {
    // Reads of the env var (a mention inside a user-facing message, e.g. "same project as GEMINI_API_KEY", is not a read).
    const readsKey = /process\.env(?:\.GEMINI_API_KEY|\[\s*["']GEMINI_API_KEY["']\s*\])/;
    const hits = serverAndApiFiles.filter((f) => readsKey.test(readFileSync(f, "utf8")));
    expect(hits.map((h) => h.replace(root, ""))).toEqual(
      expect.arrayContaining([expect.stringContaining("geminiClient.ts")]),
    );
    expect(hits).toHaveLength(1);
  });

  // A "read" is the name appearing as a quoted string literal (process.env["NAME"] or a
  // required("NAME")-style helper call) or as a direct property access (process.env.NAME) —
  // never plain prose in a comment/user-facing message, which has no quotes or leading dot.
  function readsOf(name: string): RegExp {
    return new RegExp(`["'\`]${name}["'\`]|\\.${name}\\b`);
  }

  test("SUPABASE_SERVICE_ROLE_KEY is read in exactly one file", () => {
    const hits = serverAndApiFiles.filter((f) => readsOf("SUPABASE_SERVICE_ROLE_KEY").test(readFileSync(f, "utf8")));
    expect(hits.map((h) => h.replace(root, ""))).toEqual(
      expect.arrayContaining([expect.stringContaining("env.ts")]),
    );
    expect(hits).toHaveLength(1);
  });

  test("RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are read in exactly one file (server/billing/razorpay.ts)", () => {
    for (const name of ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
      const hits = serverAndApiFiles.filter((f) => readsOf(name).test(readFileSync(f, "utf8")));
      expect(hits.map((h) => h.replace(root, ""))).toEqual(
        expect.arrayContaining([expect.stringContaining("razorpay.ts")]),
      );
      expect(hits).toHaveLength(1);
    }
  });

  test("RAZORPAY_KEY_ID (publishable) may be read, but never the secret keys, outside server/billing/razorpay.ts", () => {
    for (const file of serverAndApiFiles) {
      if (file.includes("razorpay.ts")) continue;
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET/);
    }
  });

  test("no client (React) file references any Razorpay secret name", () => {
    function walkClient(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walkClient(full));
        else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
      }
      return out;
    }
    const clientFiles = walkClient(join(root, "client", "src"));
    expect(clientFiles.length).toBeGreaterThan(0);
    for (const file of clientFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET/);
    }
  });

  test("no server/api file references a VITE_-prefixed secret name", () => {
    for (const file of serverAndApiFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(/VITE_GEMINI_API_KEY/);
      expect(content).not.toMatch(/VITE_SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  test("no server/api file hard-codes an apparent API key literal", () => {
    // Looks for suspicious long quoted literals assigned to a key-shaped variable name.
    const suspicious = /(apiKey|api_key|serviceRoleKey|service_role_key)\s*[:=]\s*["'`][A-Za-z0-9_\-.]{20,}["'`]/;
    for (const file of serverAndApiFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(suspicious);
    }
  });

  test("AiServiceError.toClientPayload never includes the internal message", () => {
    const content = readFileSync(join(root, "server", "ai", "errors.ts"), "utf8");
    const match = content.match(/toClientPayload\(\)\s*\{([\s\S]*?)\}/);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toMatch(/internalMessage|this\.message|this\.stack/);
  });

  test("ApiError.toPayload never includes a stack trace", () => {
    const content = readFileSync(join(root, "server", "lib", "apiError.ts"), "utf8");
    const match = content.match(/toPayload\(\)\s*\{([\s\S]*?)\}/);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toMatch(/stack/);
  });
});
