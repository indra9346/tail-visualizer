/**
 * Phase 4 anon-key security probe — LOCAL ONLY. Uses only the public anon
 * key (what any browser visitor has). Never prints keys.
 */
import "../server/lib/loadLocalEnv.js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const short = (s: string) => s.replace(/[A-Za-z0-9_-]{25,}/g, "<redacted>").slice(0, 160);

function jwtRole(k: string): string {
  try { return JSON.parse(Buffer.from((k.split(".")[1] ?? ""), "base64url").toString()).role ?? "unknown"; } catch { return "not-a-jwt(publishable-format?)"; }
}

async function main() {
  console.log(`url set: ${!!url} host-ok: ${/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)} | anon key set: ${!!anon} | anon key role: ${anon.startsWith("sb_publishable_") ? "publishable" : jwtRole(anon)}`);
  console.log(`SERVICE_ROLE key present in env: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);
  const sb = createClient(url, anon, { auth: { persistSession: false } });

  const h = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } });
  console.log(`auth health: HTTP ${h.status}`);

  for (const t of ["profiles","projects","room_uploads","room_analyses","tiles","tile_recommendations","visualizations","generation_jobs"]) {
    const r = await sb.from(t).select("*", { count: "exact" }).limit(5);
    console.log(`anon SELECT ${t}: rows=${r.data?.length ?? "n/a"} err=${r.error ? short(`${r.error.code}: ${r.error.message}`) : "none"}`);
  }
  const ins = await sb.from("projects").insert({ name: "x", user_id: "00000000-0000-0000-0000-000000000000" });
  console.log(`anon INSERT projects: err=${ins.error ? short(`${ins.error.code}: ${ins.error.message}`) : "NONE (BAD)"}`);

  const b = await sb.storage.listBuckets();
  console.log(`anon listBuckets: ${b.error ? short(b.error.message) : (b.data ?? []).map(x => x.name).join(",") || "(none visible)"}`);
  for (const bucket of ["room-images","tile-images","generated-visualizations"]) {
    const l = await sb.storage.from(bucket).list("", { limit: 5 });
    console.log(`anon list ${bucket}: files=${l.data?.length ?? "n/a"} err=${l.error ? short(l.error.message) : "none"}`);
    const up = await sb.storage.from(bucket).upload(`probe/${Date.now()}.jpg`, new Blob([new Uint8Array([0xff,0xd8,0xff])], { type: "image/jpeg" }));
    console.log(`anon upload ${bucket}: ${up.error ? "rejected: " + short(up.error.message) : "ACCEPTED (BAD)"}`);
    const pub = await fetch(`${url}/storage/v1/object/public/${bucket}/nonexistent.jpg`);
    console.log(`public URL ${bucket}: HTTP ${pub.status}`);
  }
  const sess = await sb.auth.getSession();
  console.log(`anon session present: ${!!sess.data.session}`);
}
main().catch(e => { console.log("probe crashed:", short(String(e?.message ?? e))); process.exit(1); });
