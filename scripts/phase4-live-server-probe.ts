/** Phase 4 live server probe — LOCAL ONLY. Read-only; creates nothing. Never prints secrets. */
import "../server/lib/loadLocalEnv.js";
import { getSupabaseServerClient } from "../server/lib/supabaseServerClient.js";
import { makeReq, makeRes } from "../test/helpers/fakeHttp.js";

const routes: [string, string, string, string?][] = [
  ["GET","projects/index","../api/projects/index.js"],
  ["POST","projects/index","../api/projects/index.js"],
  ["GET","projects/[id]/rooms","../api/projects/[id]/rooms.js"],
  ["POST","rooms/upload","../api/rooms/upload.js"],
  ["GET","rooms/[id]","../api/rooms/[id]/index.js"],
  ["POST","rooms/[id]/analyze","../api/rooms/[id]/analyze.js"],
  ["GET","rooms/[id]/analysis","../api/rooms/[id]/analysis.js"],
  ["POST","tiles/recommend","../api/tiles/recommend.js"],
  ["GET","tiles/search","../api/tiles/search.js"],
  ["POST","visualizations/generate","../api/visualizations/generate.js"],
  ["GET","visualizations/[id]","../api/visualizations/[id]/index.js"],
  ["GET","visualizations/room/[roomId]","../api/visualizations/room/[roomId].js"],
];
const fakeId = "00000000-0000-4000-8000-000000000000";
const redact = (s: string) => s.replace(/[A-Za-z0-9_-]{25,}/g, "<r>");

async function main() {
  const sb = getSupabaseServerClient();
  console.log("== service-role: schema & storage (read-only) ==");
  for (const t of ["profiles","projects","room_uploads","room_analyses","tiles","tile_recommendations","visualizations","generation_jobs"]) {
    const r = await sb.from(t).select("*", { count: "exact", head: true });
    console.log(`table ${t}: ${r.error ? "ERR " + redact(r.error.message) : "OK count=" + r.count}`);
  }
  const b = await sb.storage.listBuckets();
  for (const x of b.data ?? []) console.log(`bucket ${x.id}: public=${x.public} limit=${x.file_size_limit} mimes=${(x.allowed_mime_types ?? []).join("|")}`);
  console.log("buckets present:", ["room-images","tile-images","generated-visualizations"].every(n => b.data?.some(x => x.id === n)));
  const u = await sb.auth.admin.listUsers({ page: 1, perPage: 5 });
  console.log(`auth users existing: ${u.error ? "ERR" : u.data.users.length}`);

  const anon = process.env.VITE_SUPABASE_ANON_KEY!;
  const cases: [string, Record<string,string>][] = [
    ["no-token", {}],
    ["garbage-token", { authorization: "Bearer not.a.jwt" }],
    ["anon-key-as-token", { authorization: `Bearer ${anon}` }],
    ["malformed-scheme", { authorization: "Basic abc" }],
  ];
  console.log("\n== live API handlers: unauthenticated rejection (expect 401) ==");
  let bad = 0;
  for (const [method, name, path] of routes) {
    const mod = await import(path);
    const out: string[] = [];
    for (const [label, headers] of cases) {
      const res = makeRes();
      await mod.default(makeReq({ method, headers, body: {}, query: { id: fakeId, roomId: fakeId } }), res);
      if (res.statusCode !== 401) bad++;
      out.push(`${label}=${res.statusCode}`);
    }
    console.log(`${method.padEnd(4)} ${name.padEnd(30)} ${out.join(" ")}`);
  }
  console.log("non-401 responses:", bad);
  const wm = await import("../api/projects/index.js");
  const r2 = makeRes(); await wm.default(makeReq({ method: "DELETE" }), r2);
  console.log("wrong method DELETE /projects:", r2.statusCode);
}
main().catch(e => { console.log("crashed:", redact(String(e?.message ?? e))); process.exit(1); });
