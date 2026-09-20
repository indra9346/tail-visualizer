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
    const hits = serverAndApiFiles.filter((f) => readFileSync(f, "utf8").includes("GEMINI_API_KEY"));
    expect(hits.map((h) => h.replace(root, ""))).toEqual(
      expect.arrayContaining([expect.stringContaining("geminiClient.ts")]),
    );
    expect(hits).toHaveLength(1);
  });

  test("SUPABASE_SERVICE_ROLE_KEY is read in exactly one file", () => {
    const hits = serverAndApiFiles.filter((f) => readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"));
    expect(hits.map((h) => h.replace(root, ""))).toEqual(
      expect.arrayContaining([expect.stringContaining("env.ts")]),
    );
    expect(hits).toHaveLength(1);
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
