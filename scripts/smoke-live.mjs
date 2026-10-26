#!/usr/bin/env node
/**
 * Read-only smoke check of the LIVE site after a deploy: every main page is served, the new page code is the one
 * deployed, the API is up, and the API still refuses requests without a sign-in. It never signs in, never writes
 * anything and costs nothing.
 *
 *   npm run smoke:live                      (checks https://tile-visualizer-roan.vercel.app)
 *   npm run smoke:live -- https://other.host
 */
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "https://tile-visualizer-roan.vercel.app").replace(/\/+$/, "");
const ROOM = "22222222-2222-4222-8222-222222222222";
let failed = 0;

async function check(name, run) {
  try {
    await run();
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function get(path) {
  const res = await fetch(base + path, { redirect: "follow", headers: { "User-Agent": "sds-smoke-live" } });
  return { res, text: await res.text() };
}

function expectStatus(res, ...allowed) {
  if (!allowed.includes(res.status)) throw new Error(`HTTP ${res.status}, expected ${allowed.join(" or ")}`);
}

console.log(`Smoke check of ${base}`);

// Every page of the app is the same single-page shell; a missing rewrite shows up as a 404 here.
for (const path of ["/", "/upload", `/visualize/${ROOM}`, `/tiles/${ROOM}`, "/projects", "/tiles", "/my-visualizations", "/calculator", "/demos", "/login"]) {
  await check(`page ${path}`, async () => {
    const { res, text } = await get(path);
    expectStatus(res, 200);
    if (!text.includes('id="root"')) throw new Error("the app shell (#root) is missing");
  });
}

await check("the deployed code contains the easy visualizer", async () => {
  const { text } = await get("/");
  const scripts = [...text.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  if (scripts.length === 0) throw new Error("no script files referenced by the page");
  // The page chunks are loaded on demand; the entry script names them.
  const entry = await get(scripts[0]);
  if (!/QuickDesignPage|visualize\//.test(entry.text)) throw new Error("the entry script does not reference the /visualize page");
});

await check("API is up and refuses an unsigned design request", async () => {
  const res = await fetch(`${base}/api/visualizations/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  expectStatus(res, 401);
  const json = await res.json();
  if (!json?.error?.code) throw new Error("the error reply has no code");
});

await check("API refuses to list tiles without a sign-in", async () => {
  const { res } = await get("/api/tiles/search?page=1&pageSize=1");
  expectStatus(res, 401);
});

await check("public designs feed answers", async () => {
  const { res, text } = await get("/api/visualizations/public");
  expectStatus(res, 200);
  if (!Array.isArray(JSON.parse(text).visualizations)) throw new Error("no visualizations list in the reply");
});

console.log(failed === 0 ? "\nAll live smoke checks passed." : `\n${failed} live smoke check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
