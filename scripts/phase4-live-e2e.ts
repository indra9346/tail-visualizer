/**
 * Phase 4 live security/integration test — LOCAL ONLY.
 * Creates 2 temporary users + 1 temporary tile, runs RLS / storage / API /
 * IDOR checks, then ALWAYS cleans up and verifies cleanup.
 * Never prints passwords, tokens or keys.
 */
import "../server/lib/loadLocalEnv.js";
import { randomBytes, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "../server/lib/supabaseServerClient.js";
import { makeReq, makeRes } from "../test/helpers/fakeHttp.js";

const URL_ = process.env.SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const admin = getSupabaseServerClient();
const redact = (s: string) => s.replace(/[A-Za-z0-9_-]{25,}/g, "<r>");

const results: { id: string; name: string; ok: boolean; evidence: string }[] = [];
function check(id: string, name: string, ok: boolean, evidence: string) {
  results.push({ id, name, ok, evidence });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${id} ${name} — ${evidence}`);
}

// ---- tiny PNG generator (real, valid image; used for the temp tile & an ownership-only room placeholder)
function crc32(buf: Buffer): number {
  let c: number;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]!) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const o = y * stride + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- API invoker
async function api(routePath: string, method: string, token: string | null, opts: { query?: any; body?: any } = {}) {
  const mod = await import(routePath);
  const res = makeRes();
  await mod.default(
    makeReq({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body: opts.body, query: opts.query ?? {} }),
    res,
  );
  return { status: res.statusCode as number, json: res._json as any };
}

function userClient(token: string): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function listAll(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  for (const e of data ?? []) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.id === null) out.push(...(await listAll(bucket, p)));
    else out.push(p);
  }
  return out;
}

const users: { id: string; email: string; token: string }[] = [];
let tileId: string | null = null;
const tilePath = "catalog/live-test-phase4.png";

async function main() {
  // ============ SETUP ============
  console.log("== SETUP ==");
  for (const label of ["a", "b"]) {
    const email = `phase4-${label}-${randomBytes(4).toString("hex")}@example.invalid`;
    const password = randomBytes(24).toString("base64url");
    const c = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (c.error || !c.data.user) throw new Error(`createUser failed: ${c.error?.message}`);
    // register immediately so cleanup can remove it even if a later step throws
    const rec = { id: c.data.user.id, email, token: "" };
    users.push(rec);
    const anonClient = createClient(URL_, ANON, { auth: { persistSession: false } });
    const s = await anonClient.auth.signInWithPassword({ email, password });
    if (s.error || !s.data.session) throw new Error(`signIn failed: ${s.error?.message}`);
    rec.token = s.data.session.access_token;
  }
  const A = users[0]!;
  const B = users[1]!;
  check("2.1", "Auth: 2 temp users created (admin API) and both sign in with password, receiving JWTs", !!A.token && !!B.token, "2 sessions issued");
  const wrongPw = await createClient(URL_, ANON, { auth: { persistSession: false } }).auth.signInWithPassword({
    email: A.email,
    password: "definitely-wrong-password",
  });
  check("2.2", "Auth: wrong password rejected", !!wrongPw.error && !wrongPw.data.session, `error=${wrongPw.error?.code ?? wrongPw.error?.message}`);
  const gu = await admin.auth.getUser(A.token);
  check("2.3", "Auth: server-side getUser(token) resolves to the right user id", gu.data.user?.id === A.id, "id matches");

  // temp tile
  const tileImg = png(256, 256, (x, y) => (((x >> 5) + (y >> 5)) & 1 ? [150, 150, 155] : [200, 200, 205]));
  const up = await admin.storage.from("tile-images").upload(tilePath, tileImg, { contentType: "image/png", upsert: true });
  const ti = await admin
    .from("tiles")
    .insert({
      sku: "LIVE-TEST-PHASE4",
      name: "Phase4 Temp Test Tile",
      brand: "TEMP",
      category: "both",
      material: "porcelain",
      finish: "matte",
      color_family: "grey",
      size_mm: "600x600",
      price_per_sqft: 1,
      storage_path: tilePath,
      suitable_rooms: ["bedroom", "bathroom", "living_room", "kitchen", "other"],
      is_active: true,
    })
    .select("id")
    .single();
  if (up.error || ti.error) throw new Error(`tile setup failed: ${up.error?.message ?? ti.error?.message}`);
  tileId = ti.data.id;
  console.log("temp tile + image created");

  const ca = userClient(A.token);
  const cb = userClient(B.token);

  // ============ RLS + SERVER-ONLY WRITES ============
  console.log("\n== RLS / OWNERSHIP ISOLATION + SERVER-ONLY WRITES (user JWT, direct PostgREST) ==");
  // Since migration 0005 clients cannot write projects/profiles/room_uploads/visualizations at all.
  // Legitimate data is created through the API (service-role path) or, where a test needs a
  // specific row, planted with the service role and clearly labelled.
  const apA = await api("../api/projects/index.js", "POST", A.token, { body: { name: "A-project" } });
  const apB = await api("../api/projects/index.js", "POST", B.token, { body: { name: "B-project" } });
  const projA = apA.json?.project?.id as string;
  const projB = apB.json?.project?.id as string;
  check("3.1", "API (server/service-role path) still creates projects for A and B", apA.status === 201 && apB.status === 201 && !!projA && !!projB, `A=${apA.status}, B=${apB.status}`);
  const aDirect = await ca.from("projects").insert({ name: "direct", user_id: A.id });
  check("3.1b", "Direct client INSERT into projects is rejected (server-only writes, 0005)", !!aDirect.error, aDirect.error?.code ?? "NO ERROR");
  const aSelOwn = await ca.from("projects").select("id").eq("id", projA);
  check("3.1c", "Owner can still SELECT their own project (owner-only SELECT kept)", !aSelOwn.error && aSelOwn.data!.length === 1, `rows=${aSelOwn.data?.length}`);

  const bSelA = await cb.from("projects").select("*").eq("id", projA);
  check("3.2", "B cannot SELECT A's project", !bSelA.error && bSelA.data!.length === 0, `rows=${bSelA.data?.length}`);
  const bAll = await cb.from("projects").select("id");
  check("3.3", "B's unfiltered project list contains only B's", bAll.data!.length === 1 && bAll.data![0]!.id === projB, `rows=${bAll.data?.length}`);
  const bUpd = await cb.from("projects").update({ name: "hacked" }).eq("id", projA).select();
  const chk = await admin.from("projects").select("name").eq("id", projA).single();
  check("3.4", "B cannot UPDATE A's project", (bUpd.data?.length ?? 0) === 0 && chk.data?.name === "A-project", `err=${bUpd.error?.code ?? "none"}, affected=${bUpd.data?.length ?? 0}, name intact=${chk.data?.name === "A-project"}`);
  const bDel = await cb.from("projects").delete().eq("id", projA).select();
  const chk2 = await admin.from("projects").select("id").eq("id", projA);
  check("3.5", "B cannot DELETE A's project", (bDel.data?.length ?? 0) === 0 && chk2.data!.length === 1, `err=${bDel.error?.code ?? "none"}, affected=${bDel.data?.length ?? 0}, row still exists`);
  const bSpoof = await cb.from("projects").insert({ name: "spoof", user_id: A.id });
  check("3.6", "B cannot INSERT a project owned by A", !!bSpoof.error, bSpoof.error?.code ?? "NO ERROR");
  const aUpdOwn = await ca.from("projects").update({ name: "renamed" }).eq("id", projA).select();
  const aDelOwn = await ca.from("projects").delete().eq("id", projA).select();
  const chk3 = await admin.from("projects").select("name").eq("id", projA).single();
  check("3.6b", "Even the OWNER cannot UPDATE/DELETE their project directly (server-only)", (aUpdOwn.data?.length ?? 0) === 0 && (aDelOwn.data?.length ?? 0) === 0 && chk3.data?.name === "A-project", `update err=${aUpdOwn.error?.code}, delete err=${aDelOwn.error?.code}`);

  // A's room row is PLANTED by the service role (clients can no longer create it)
  const aRoomIns = await admin.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: `${A.id}/${projA}/seeded.jpg`, mime_type: "image/jpeg", file_size_bytes: 10 }).select("id").single();
  const aRoom = { data: aRoomIns.data as { id: string } };
  const bIntoA = await cb.from("room_uploads").insert({ project_id: projA, user_id: B.id, storage_path: `${B.id}/x.jpg`, mime_type: "image/jpeg", file_size_bytes: 10 });
  check("3.7", "B cannot INSERT a room_upload into A's project", !!bIntoA.error, bIntoA.error?.code ?? "NO ERROR");
  const aAsB = await ca.from("room_uploads").insert({ project_id: projA, user_id: B.id, storage_path: `${B.id}/x.jpg`, mime_type: "image/jpeg", file_size_bytes: 10 });
  check("3.8", "A cannot INSERT a room_upload with user_id=B", !!aAsB.error, aAsB.error?.code ?? "NO ERROR");
  const aRoomDirect = await ca.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: `${A.id}/${projA}/direct.jpg`, mime_type: "image/jpeg", file_size_bytes: 10 });
  check("3.9", "A cannot INSERT even their OWN room_upload directly (server-only, 0005)", !!aRoomDirect.error, aRoomDirect.error?.code ?? "NO ERROR");
  const forgedIns = await ca.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: `${B.id}/${projB}/secret-room.png`, mime_type: "image/png", file_size_bytes: 10 });
  const forgedRows = await admin.from("room_uploads").select("id", { count: "exact", head: true }).eq("storage_path", `${B.id}/${projB}/secret-room.png`);
  check("3.9b", "PROOF (attack 1): forged room_uploads.storage_path pointing at B's file cannot be created", !!forgedIns.error && forgedRows.count === 0, `err=${forgedIns.error?.code ?? "NONE"}, forged rows in DB=${forgedRows.count}`);
  const bSelRoom = await cb.from("room_uploads").select("id").eq("id", aRoom.data.id);
  check("3.10", "B cannot SELECT A's room_upload", bSelRoom.data!.length === 0, `rows=${bSelRoom.data?.length}`);
  const aSelRoom = await ca.from("room_uploads").select("id").eq("id", aRoom.data.id);
  check("3.10b", "A can still SELECT their own room_upload", aSelRoom.data?.length === 1, `rows=${aSelRoom.data?.length}`);
  const aUpdRoom = await ca.from("room_uploads").update({ storage_path: `${B.id}/${projB}/secret-room.png` }).eq("id", aRoom.data.id).select();
  const aDelRoom = await ca.from("room_uploads").delete().eq("id", aRoom.data.id).select();
  const roomStill = await admin.from("room_uploads").select("storage_path").eq("id", aRoom.data.id).single();
  check("3.10c", "A cannot UPDATE storage_path or DELETE their own room_upload directly", (aUpdRoom.data?.length ?? 0) === 0 && (aDelRoom.data?.length ?? 0) === 0 && roomStill.data?.storage_path === `${A.id}/${projA}/seeded.jpg`, `update err=${aUpdRoom.error?.code}, delete err=${aDelRoom.error?.code}, path unchanged=${roomStill.data?.storage_path === `${A.id}/${projA}/seeded.jpg`}`);
  // DB-level constraints still hold (tested with the service role, which bypasses RLS but not CHECK constraints)
  const badMime = await admin.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: `${A.id}/x`, mime_type: "application/pdf", file_size_bytes: 10 });
  check("3.11", "DB CHECK constraint rejects non-image mime_type (even for the service role)", !!badMime.error, badMime.error?.code ?? "NO ERROR");
  const bigSize = await admin.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: `${A.id}/x`, mime_type: "image/png", file_size_bytes: 99999999 });
  check("3.12", "DB CHECK constraint rejects >10MB file_size_bytes (even for the service role)", !!bigSize.error, bigSize.error?.code ?? "NO ERROR");

  // profile row exists because the API's ensureProfile ran during POST /projects
  const aProf = await ca.from("profiles").select("id").eq("id", A.id);
  const prA = await ca.from("profiles").insert({ id: A.id, display_name: "A" });
  const prUpd = await ca.from("profiles").update({ display_name: "hacked" }).eq("id", A.id).select();
  const bProf = await cb.from("profiles").select("id").eq("id", A.id);
  check("3.13", "profiles: API created A's profile; A reads own; A cannot write directly; B cannot read A's", aProf.data?.length === 1 && !!prA.error && (prUpd.data?.length ?? 0) === 0 && bProf.data!.length === 0, `A reads=${aProf.data?.length}, direct insert err=${prA.error?.code}, direct update affected=${prUpd.data?.length ?? 0}, B sees=${bProf.data?.length}`);
  const bProfSpoof = await cb.from("profiles").insert({ id: A.id, display_name: "x" });
  check("3.14", "profiles: B cannot insert a profile for A", !!bProfSpoof.error, bProfSpoof.error?.code ?? "NO ERROR");

  const tilesA = await ca.from("tiles").select("id,sku").eq("id", tileId!);
  check("3.15", "Authenticated user can read tile catalog", tilesA.data?.length === 1, `rows=${tilesA.data?.length}`);
  const tIns = await ca.from("tiles").insert({ sku: "HACK", name: "x", category: "floor", storage_path: "x" });
  const tUpd = await ca.from("tiles").update({ name: "hacked" }).eq("id", tileId!).select();
  const tDel = await ca.from("tiles").delete().eq("id", tileId!).select();
  const tileStill = await admin.from("tiles").select("name").eq("id", tileId!).single();
  check(
    "3.16",
    "Authenticated user cannot insert/update/delete tiles",
    !!tIns.error && (!!tUpd.error || !tUpd.data?.length) && (!!tDel.error || !tDel.data?.length) && tileStill.data?.name === "Phase4 Temp Test Tile",
    `insert=${tIns.error?.code}, update=${tUpd.error?.code ?? "0 rows"}, delete=${tDel.error?.code ?? "0 rows"}`,
  );
  for (const t of ["room_analyses", "tile_recommendations", "generation_jobs"]) {
    const r = await ca.from(t).insert({} as any);
    check(`3.17-${t}`, `Authenticated user cannot INSERT into server-managed ${t}`, !!r.error, r.error?.code ?? "NO ERROR");
  }
  const vInsSeed = await admin.from("visualizations").insert({ room_upload_id: aRoom.data.id, user_id: A.id, tile_id: tileId, applied_surfaces: ["floor"] }).select("id").single();
  const vId = vInsSeed.data?.id as string;
  const vSel = await cb.from("visualizations").select("id").eq("id", vId);
  const vSelA = await ca.from("visualizations").select("id").eq("id", vId);
  check("3.18", "visualizations: A reads own (planted by service role); B cannot read", vSelA.data?.length === 1 && vSel.data!.length === 0, `A sees=${vSelA.data?.length}, B sees=${vSel.data?.length}`);
  const vDirect = await ca.from("visualizations").insert({ room_upload_id: aRoom.data.id, user_id: A.id, tile_id: tileId, applied_surfaces: ["floor"] });
  check("3.18b", "A cannot INSERT a visualization directly (server-only, 0005)", !!vDirect.error, vDirect.error?.code ?? "NO ERROR");
  const vForge = await ca.from("visualizations").update({ status: "completed", result_storage_path: `${B.id}/${projB}/secret-viz.png` }).eq("id", vId).select();
  const vAfter = await admin.from("visualizations").select("status,result_storage_path").eq("id", vId).single();
  check("3.18c", "PROOF (attack 2): forged visualization result_storage_path cannot be written or modified", (vForge.data?.length ?? 0) === 0 && vAfter.data?.result_storage_path === null && vAfter.data?.status === "pending", `update err=${vForge.error?.code ?? "none"}, affected=${vForge.data?.length ?? 0}, result path still null=${vAfter.data?.result_storage_path === null}`);
  const vDel = await ca.from("visualizations").delete().eq("id", vId).select();
  const vStill = await admin.from("visualizations").select("id").eq("id", vId);
  check("3.18d", "A cannot DELETE their visualization directly", (vDel.data?.length ?? 0) === 0 && vStill.data!.length === 1, `err=${vDel.error?.code ?? "none"}`);
  const vSpoof = await cb.from("visualizations").insert({ room_upload_id: aRoom.data.id, user_id: B.id, tile_id: tileId, applied_surfaces: ["floor"] });
  check("3.19", "visualizations: B cannot create one against A's room", !!vSpoof.error, vSpoof.error?.code ?? "NO ERROR");
  const anonC = createClient(URL_, ANON, { auth: { persistSession: false } });
  const anonTiles = await anonC.from("tiles").select("id");
  check("4.1", "Anon (no JWT) cannot read tiles", !!anonTiles.error, anonTiles.error?.code ?? "NO ERROR");

  // ============ STORAGE ============
  console.log("\n== STORAGE POLICIES ==");
  const jpg = png(64, 64, () => [120, 90, 60]);
  const aOwn = await ca.storage.from("room-images").upload(`${A.id}/${projA}/clientdirect.png`, jpg, { contentType: "image/png" });
  const ownListed = await admin.storage.from("room-images").list(`${A.id}/${projA}`);
  check("5.0", "PROOF (attack 3): direct client upload into the user's OWN room-images folder is BLOCKED (server-only, 0005)", !!aOwn.error && !(ownListed.data ?? []).some((f) => f.name === "clientdirect.png"), aOwn.error?.message ? redact(aOwn.error.message) : "NO ERROR - upload accepted");
  let spam = 0;
  for (let i = 0; i < 5; i++) {
    const r = await ca.storage.from("room-images").upload(`${A.id}/spam/${i}.png`, jpg, { contentType: "image/png" });
    if (!r.error) spam++;
  }
  check("5.0b", "Direct-upload spam (bypassing the API rate limit) is impossible: 0 of 5 accepted", spam === 0, `${spam}/5 accepted`);
  const aOther = await ca.storage.from("room-images").upload(`${B.id}/${projB}/evil.png`, jpg, { contentType: "image/png" });
  check("5.1", "A cannot upload into B's room-images folder", !!aOther.error, aOther.error?.message ? redact(aOther.error.message) : "NO ERROR");
  const aRoot = await ca.storage.from("room-images").upload(`loose-${randomUUID()}.png`, jpg, { contentType: "image/png" });
  check("5.2", "A cannot upload outside own user-id folder", !!aRoot.error, aRoot.error?.message ? redact(aRoot.error.message) : "NO ERROR");
  const aBadType = await ca.storage.from("room-images").upload(`${A.id}/${projA}/x.txt`, Buffer.from("hello"), { contentType: "text/plain" });
  check("5.3", "Bucket rejects non-image MIME type", !!aBadType.error, aBadType.error?.message ? redact(aBadType.error.message) : "NO ERROR");
  const aViz = await ca.storage.from("generated-visualizations").upload(`${A.id}/${projA}/fake.png`, jpg, { contentType: "image/png" });
  check("5.4", "Client cannot upload into generated-visualizations (server-only)", !!aViz.error, aViz.error?.message ? redact(aViz.error.message) : "NO ERROR");
  const aTile = await ca.storage.from("tile-images").upload(`catalog/evil-${randomUUID()}.png`, jpg, { contentType: "image/png" });
  check("5.5", "Client cannot upload into tile-images (server-only)", !!aTile.error, aTile.error?.message ? redact(aTile.error.message) : "NO ERROR");

  // Seed one file for each private bucket in A's folder via service role, to test B's access
  await admin.storage.from("room-images").upload(`${A.id}/${projA}/seed.png`, jpg, { contentType: "image/png", upsert: true });
  await admin.storage.from("generated-visualizations").upload(`${A.id}/${projA}/seed.png`, jpg, { contentType: "image/png", upsert: true });
  for (const bucket of ["room-images", "generated-visualizations"]) {
    const bDl = await cb.storage.from(bucket).download(`${A.id}/${projA}/seed.png`);
    const bList = await cb.storage.from(bucket).list(`${A.id}/${projA}`);
    const bSigned = await cb.storage.from(bucket).createSignedUrl(`${A.id}/${projA}/seed.png`, 60);
    const aDl = await ca.storage.from(bucket).download(`${A.id}/${projA}/seed.png`);
    check(
      `5.6-${bucket}`,
      `${bucket}: B cannot download / list / sign A's file; A can download own`,
      !!bDl.error && (bList.data?.length ?? 0) === 0 && !!bSigned.error && !aDl.error,
      `B download=${bDl.error ? "denied" : "ALLOWED"}, B list=${bList.data?.length ?? 0} items, B signed=${bSigned.error ? "denied" : "ALLOWED"}, A download=${aDl.error ? "denied" : "ok"}`,
    );
    const bRm = await cb.storage.from(bucket).remove([`${A.id}/${projA}/seed.png`]);
    const still = await admin.storage.from(bucket).download(`${A.id}/${projA}/seed.png`);
    check(`5.7-${bucket}`, `${bucket}: B cannot delete A's file`, !still.error, `file intact=${!still.error}, removed=${bRm.data?.length ?? 0}`);
    const aRm = await ca.storage.from(bucket).remove([`${A.id}/${projA}/seed.png`]);
    const still2 = await admin.storage.from(bucket).download(`${A.id}/${projA}/seed.png`);
    check(`5.7b-${bucket}`, `${bucket}: even the OWNER cannot delete their file directly (server-only, 0005)`, !still2.error && (aRm.data?.length ?? 0) === 0, `file intact=${!still2.error}, removed=${aRm.data?.length ?? 0}`);
  }
  const pub = await fetch(`${URL_}/storage/v1/object/public/tile-images/${tilePath}`);
  check("5.8", "tile-images is publicly readable (by design) and serves the temp tile", pub.status === 200 && (pub.headers.get("content-type") ?? "").includes("image"), `HTTP ${pub.status}`);
  const pubPriv = await fetch(`${URL_}/storage/v1/object/public/room-images/${A.id}/${projA}/seed.png`);
  check("5.9", "Private room-images file is NOT readable via public URL", pubPriv.status !== 200, `HTTP ${pubPriv.status}`);
  const anonSeed = await fetch(`${URL_}/storage/v1/object/room-images/${A.id}/${projA}/seed.png`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  check("5.10", "Anon key cannot read private room-images object directly", anonSeed.status !== 200, `HTTP ${anonSeed.status}`);

  // ============ API with valid JWT ============
  console.log("\n== API SECURITY (real handlers, valid JWTs) ==");
  const r1 = await api("../api/projects/index.js", "POST", A.token, { body: { name: "A-api-project" } });
  const apiProj = r1.json?.project?.id as string;
  const owner = await admin.from("projects").select("user_id").eq("id", apiProj).single();
  check("6.1", "POST /projects: 201 and owner is the token's user", r1.status === 201 && owner.data?.user_id === A.id, `status=${r1.status}, owner is A=${owner.data?.user_id === A.id}`);
  const r1s = await api("../api/projects/index.js", "POST", A.token, { body: { name: "spoof", user_id: B.id } });
  const spoofRows = await admin.from("projects").select("id").eq("name", "spoof");
  check("6.1b", "POST /projects with client-supplied user_id is rejected (strict schema), nothing created", r1s.status === 400 && (spoofRows.data?.length ?? 0) === 0, `status=${r1s.status}, rows created=${spoofRows.data?.length}`);
  const r2 = await api("../api/projects/index.js", "POST", A.token, { body: { name: "   " } });
  check("6.2", "POST /projects: empty name -> 400", r2.status === 400, `status=${r2.status}`);
  const lA = await api("../api/projects/index.js", "GET", A.token);
  const lB = await api("../api/projects/index.js", "GET", B.token);
  check(
    "6.3",
    "GET /projects returns only the caller's projects",
    lA.status === 200 && lA.json.projects.every((p: any) => [projA, apiProj].includes(p.id)) && !lB.json.projects.some((p: any) => [projA, apiProj].includes(p.id)),
    `A sees ${lA.json?.projects?.length}, B sees ${lB.json?.projects?.length}`,
  );
  const rl = await api("../api/projects/[id]/rooms.js", "GET", B.token, { query: { id: projA } });
  const rlNone = await api("../api/projects/[id]/rooms.js", "GET", B.token, { query: { id: randomUUID() } });
  check(
    "7.1",
    "IDOR: B listing rooms of A's project denied, identical to nonexistent id (no enumeration)",
    rl.status >= 400 && rl.status === rlNone.status && rl.json?.error?.code === rlNone.json?.error?.code,
    `A's project -> ${rl.status}/${rl.json?.error?.code}; random id -> ${rlNone.status}/${rlNone.json?.error?.code}`,
  );
  const badId = await api("../api/rooms/[id]/index.js", "GET", A.token, { query: { id: "not-a-uuid" } });
  check("6.4", "Malformed UUID -> 400 (input validation)", badId.status === 400, `status=${badId.status}`);

  // Ownership-only placeholder room, uploaded through the real upload endpoint (NOT used for any AI call)
  const placeholder = png(64, 64, () => [90, 90, 90]);
  const upA = await api("../api/rooms/upload.js", "POST", A.token, { body: { projectId: projA, fileName: "ownership-placeholder.png", mimeType: "image/png", base64Data: placeholder.toString("base64") } });
  check("6.5", "POST /rooms/upload as A into own project -> 201", upA.status === 201, `status=${upA.status}/${upA.json?.error?.code ?? ""}`);
  const roomA = upA.json?.room?.id as string;
  const upB = await api("../api/rooms/upload.js", "POST", B.token, { body: { projectId: projA, fileName: "x.png", mimeType: "image/png", base64Data: placeholder.toString("base64") } });
  check("7.2", "IDOR: B uploading into A's project denied", upB.status >= 400 && upB.status < 500, `status=${upB.status}/${upB.json?.error?.code}`);
  const spoof = await api("../api/rooms/upload.js", "POST", A.token, { body: { projectId: projA, fileName: "x.jpg", mimeType: "image/jpeg", base64Data: Buffer.from("this is not an image at all").toString("base64") } });
  check("6.6", "Upload with spoofed MIME / non-image bytes rejected (signature check)", spoof.status === 400, `status=${spoof.status}/${spoof.json?.error?.code}`);
  const bad64 = await api("../api/rooms/upload.js", "POST", A.token, { body: { projectId: projA, fileName: "x.png", mimeType: "image/png", base64Data: "" } });
  check("6.7", "Upload with empty payload -> 400", bad64.status === 400, `status=${bad64.status}`);

  const idorCases: [string, string, string, any][] = [
    ["GET room", "../api/rooms/[id]/index.js", "GET", { id: roomA }],
    ["POST analyze", "../api/rooms/[id]/analyze.js", "POST", { id: roomA }],
    ["GET analysis", "../api/rooms/[id]/analysis.js", "GET", { id: roomA }],
    ["GET recommend", "../api/tiles/recommend.js", "GET", { roomUploadId: roomA }],
    ["GET viz-by-room", "../api/visualizations/room/[roomId].js", "GET", { roomId: roomA }],
  ];
  let idorOk = true;
  const ev: string[] = [];
  for (const [name, path, method, query] of idorCases) {
    const asB = await api(path, method, B.token, { query });
    const nonexist = await api(path, method, B.token, { query: Object.fromEntries(Object.keys(query).map((k) => [k, randomUUID()])) });
    const same = asB.status === nonexist.status && asB.json?.error?.code === nonexist.json?.error?.code;
    if (!(asB.status >= 400 && same)) idorOk = false;
    ev.push(`${name}: ${asB.status}${same ? "=" : "!="}${nonexist.status}`);
  }
  check("7.3", "IDOR: B on A's room via 5 endpoints -> denied and indistinguishable from nonexistent", idorOk, ev.join(", "));
  const genB = await api("../api/visualizations/generate.js", "POST", B.token, { body: { roomUploadId: roomA, tileId, surfaces: ["floor"] } });
  check("7.4", "IDOR: B generating a visualization for A's room denied (no Gemini call)", genB.status >= 400, `status=${genB.status}/${genB.json?.error?.code}`);
  const roomAsA = await api("../api/rooms/[id]/index.js", "GET", A.token, { query: { id: roomA } });
  const hasToken = /token=/.test(roomAsA.json?.room?.imageUrl ?? "");
  check("6.8", "A can GET own room; response contains a signed (expiring) image URL", roomAsA.status === 200 && hasToken, `status=${roomAsA.status}, signed url has token param=${hasToken}`);
  const recNoAnalysis = await api("../api/tiles/recommend.js", "GET", A.token, { query: { roomUploadId: roomA } });
  const genNoAnalysis = await api("../api/visualizations/generate.js", "POST", A.token, { body: { roomUploadId: roomA, tileId, surfaces: ["floor"] } });
  check("6.9", "Recommend / generate without analysis -> 409 (no implicit Gemini call)", recNoAnalysis.status === 409 && genNoAnalysis.status === 409, `recommend=${recNoAnalysis.status}, generate=${genNoAnalysis.status}`);
  const s1 = await api("../api/tiles/search.js", "GET", A.token, { query: { q: "Phase4" } });
  const s2 = await api("../api/tiles/search.js", "GET", A.token, { query: { q: "zzz%,is_active.eq.false,id.not.is.null" } });
  const s3 = await api("../api/tiles/search.js", "GET", A.token, { query: { q: "zzz)%,name.ilike.%(" } });
  const stillTiles = await admin.from("tiles").select("id", { count: "exact", head: true });
  check(
    "6.10",
    "GET /tiles/search: finds temp tile; PostgREST filter-injection payloads return no extra rows (tiles table intact)",
    s1.status === 200 && !!s1.json.tiles?.some((t: any) => t.id === tileId) && s2.status === 200 && s2.json.tiles.length === 0 && s3.status === 200 && s3.json.tiles.length === 0 && !stillTiles.error,
    `search=${s1.status}, filter-injection payloads -> ${s2.status}/${s2.json?.tiles?.length} rows, ${s3.status}/${s3.json?.tiles?.length} rows, tiles table ok=${!stillTiles.error}`,
  );
  const bodies = JSON.stringify([r2, badId, rl, upB, spoof, genB, recNoAnalysis, s2]);
  check("6.11", "Error responses leak no stack traces / keys / SQL", !/stack|at .*\.ts|SUPABASE|GEMINI|service_role|postgres|pg_|eyJ[A-Za-z0-9_-]{20,}/i.test(bodies), "scanned 8 error bodies");
  const wrongMethod = await api("../api/rooms/upload.js", "GET", A.token);
  check("6.12", "Wrong HTTP method -> 405", wrongMethod.status === 405, `status=${wrongMethod.status}`);

  // ============ Defense in depth: forged rows PLANTED by the service role ============
  // Clients can no longer create these rows (0005). To prove the SECOND layer (assertOwnedPath) works
  // independently, we plant bad rows directly with the service role, as a bug/bad-migration would.
  console.log("\n== DEFENSE IN DEPTH (service-role-planted bad rows; server must still refuse) ==");
  const junk = Buffer.from("THIS IS NOT AN IMAGE - plain text disguised as png");
  const junkPath = `${A.id}/${projA}/disguised.png`;
  await admin.storage.from("room-images").upload(junkPath, junk, { contentType: "image/png" });
  const jRow = await admin.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: junkPath, mime_type: "image/png", file_size_bytes: junk.length }).select("id").single();
  const jAn = await api("../api/rooms/[id]/analyze.js", "POST", A.token, { query: { id: jRow.data!.id } });
  const jAnalysis = await admin.from("room_analyses").select("id", { count: "exact", head: true });
  check("8.1", "Server re-validates stored bytes: analyze on a planted non-image is rejected before Gemini", jAn.status === 400 && jAnalysis.count === 0, `status=${jAn.status}/${jAn.json?.error?.code}, analyses created=${jAnalysis.count}`);
  const big = Buffer.concat([png(64, 64, () => [1, 2, 3]), Buffer.alloc(11 * 1024 * 1024)]);
  const bigUp = await admin.storage.from("room-images").upload(`${A.id}/${projA}/big.png`, big, { contentType: "image/png" });
  check("8.2", "Bucket enforces the 10 MB object limit (even for the service role)", !!bigUp.error, bigUp.error ? redact(bigUp.error.message) : "NO ERROR");

  const bSecretPath = `${B.id}/${projB}/secret-room.png`;
  await admin.storage.from("room-images").upload(bSecretPath, png(64, 64, () => [9, 9, 9]), { contentType: "image/png", upsert: true });
  const forgedRoom = await admin.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: bSecretPath, mime_type: "image/png", file_size_bytes: 100 }).select("id").single();
  const gForged = await api("../api/rooms/[id]/index.js", "GET", A.token, { query: { id: forgedRoom.data!.id } });
  const aForged = await api("../api/rooms/[id]/analyze.js", "POST", A.token, { query: { id: forgedRoom.data!.id } });
  const listForged = await api("../api/projects/[id]/rooms.js", "GET", A.token, { query: { id: projA } });
  const leaked = JSON.stringify([gForged.json, aForged.json, listForged.json]).includes(bSecretPath) || /token=/.test(JSON.stringify(gForged.json));
  check("8.3", "PATH-PREFIX: forged room row (storage_path = B's file) -> GET room 404, analyze 404, project room list 404, nothing signed/leaked", gForged.status === 404 && aForged.status === 404 && listForged.status === 404 && !leaked, `GET=${gForged.status}, analyze=${aForged.status}, list=${listForged.status}, leaked=${leaked}`);
  const travRoom = await admin.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: `${A.id}/../${B.id}/${projB}/secret-room.png`, mime_type: "image/png", file_size_bytes: 100 }).select("id").single();
  const gTrav = await api("../api/rooms/[id]/index.js", "GET", A.token, { query: { id: travRoom.data!.id } });
  check("8.4", "PATH-PREFIX: '..' traversal path inside own prefix is refused (404)", gTrav.status === 404 && !/token=/.test(JSON.stringify(gTrav.json)), `status=${gTrav.status}`);
  await admin.storage.from("generated-visualizations").upload(`${B.id}/${projB}/secret-viz.png`, png(64, 64, () => [7, 7, 7]), { contentType: "image/png", upsert: true });
  await admin.from("visualizations").update({ status: "completed", result_storage_path: `${B.id}/${projB}/secret-viz.png` }).eq("id", vId);
  const gViz = await api("../api/visualizations/[id]/index.js", "GET", A.token, { query: { id: vId } });
  const lViz = await api("../api/visualizations/room/[roomId].js", "GET", A.token, { query: { roomId: aRoom.data.id } });
  check("8.5", "PATH-PREFIX: forged visualization result path -> GET viz 404 and list-by-room 404, nothing signed", gViz.status === 404 && lViz.status === 404 && !/token=/.test(JSON.stringify([gViz.json, lViz.json])), `GET=${gViz.status}, list=${lViz.status}`);
  await admin.from("visualizations").update({ status: "pending", result_storage_path: null }).eq("id", vId);

  // ============ TEST 10: full AI workflow with the REAL photo ============
  const photo = ["jpg", "jpeg", "png", "webp"].map((e) => `test/fixtures/room.${e}`).find((p) => existsSync(p));
  console.log(`\n== TEST 10 (full AI workflow) ==\nreal room photo present: ${photo ?? "NO"}`);
  if (!photo) {
    console.log("[BLOCKED] 10 — no real room photo at test/fixtures/room.*; not fabricating one.");
    return;
  }
  const bytes = readFileSync(photo);
  const mime = photo.endsWith(".png") ? "image/png" : photo.endsWith(".webp") ? "image/webp" : "image/jpeg";
  console.log(`  photo: ${(bytes.length / 1048576).toFixed(2)} MB, ${mime}`);

  const up10 = await api("../api/rooms/upload.js", "POST", A.token, { body: { projectId: projA, fileName: "room.jpeg", mimeType: mime, base64Data: bytes.toString("base64") } });
  check("10.1", "Upload real photo via API -> 201", up10.status === 201, `status=${up10.status}/${up10.json?.error?.code ?? ""}`);
  if (up10.status !== 201) return;
  const room10 = up10.json.room.id as string;
  const stored = await admin.storage.from("room-images").download(`${A.id}/${projA}/${room10}.jpg`);
  const storedBuf = stored.data ? Buffer.from(await stored.data.arrayBuffer()) : Buffer.alloc(0);
  check("10.2", "Stored object is byte-identical to the uploaded photo", storedBuf.length === bytes.length && storedBuf.equals(bytes), `stored=${storedBuf.length} bytes, original=${bytes.length}`);

  const tAnalyze = Date.now();
  const an1 = await api("../api/rooms/[id]/analyze.js", "POST", A.token, { query: { id: room10 } });
  const analyzeMs = Date.now() - tAnalyze;
  console.log(`  TIMING analyze (download + resize to 1600px + Gemini + DB): ${(analyzeMs / 1000).toFixed(1)} s`);
  const a1 = an1.json?.analysis;
  check("10.3", "Analyze (real Gemini) -> 201 with schema-valid analysis persisted", an1.status === 201 && an1.json?.reused === false && !!a1?.roomType, `status=${an1.status}/${an1.json?.error?.code ?? ""} roomType=${a1?.roomType} confidence=${a1?.confidence} state=${a1?.constructionState} surfaces=[${(a1?.recommendedSurfaces ?? []).join(",")}] floorVisible=${a1?.floorVisible} wallVisible=${a1?.wallVisible} model=${a1?.analysisModel}`);
  if (an1.status !== 201) return;
  const an2 = await api("../api/rooms/[id]/analyze.js", "POST", A.token, { query: { id: room10 } });
  const nAn = await admin.from("room_analyses").select("id", { count: "exact", head: true }).eq("room_upload_id", room10);
  check("10.4", "Re-analyze is idempotent: reused=true, still exactly 1 analysis row (no second Gemini call)", an2.status === 200 && an2.json?.reused === true && nAn.count === 1, `status=${an2.status}, reused=${an2.json?.reused}, rows=${nAn.count}`);
  const roomRow = await admin.from("room_uploads").select("status").eq("id", room10).single();
  check("10.5", "room_uploads.status advanced to 'analyzed'", roomRow.data?.status === "analyzed", `status=${roomRow.data?.status}`);
  const getAn = await api("../api/rooms/[id]/analysis.js", "GET", A.token, { query: { id: room10 } });
  const getAnB = await api("../api/rooms/[id]/analysis.js", "GET", B.token, { query: { id: room10 } });
  check("10.6", "GET analysis: owner 200; other user 404", getAn.status === 200 && getAnB.status === 404, `A=${getAn.status}, B=${getAnB.status}`);

  const rec1 = await api("../api/tiles/recommend.js", "GET", A.token, { query: { roomUploadId: room10 } });
  const recs = rec1.json?.recommendations ?? [];
  const allReal = recs.every((r: any) => (r.tile?.id ?? r.tileId) === tileId);
  console.log(`  recommend -> status=${rec1.status}/${rec1.json?.error?.code ?? ""} count=${recs.length} reused=${rec1.json?.reused}`);
  check("10.7", "Recommend: 2xx, only real catalog tile ids (no hallucinated tiles)", rec1.status >= 200 && rec1.status < 300 && allReal, `status=${rec1.status}, count=${recs.length}, all ids real=${allReal}`);
  if (recs.length) {
    const rec2 = await api("../api/tiles/recommend.js", "GET", A.token, { query: { roomUploadId: room10 } });
    check("10.8", "Recommend is cached: second call reused=true", rec2.status === 200 && rec2.json?.reused === true, `status=${rec2.status}, reused=${rec2.json?.reused}`);
  } else {
    console.log("  (info) 0 recommendations - analysis surfaces gave no eligible surface; not asserting cache test");
  }

  const surfaces = (a1.recommendedSurfaces?.length ? a1.recommendedSurfaces : a1.wallVisible ? ["wall"] : ["floor"]).slice(0, 1);
  console.log(`  generating visualization on surface(s): ${surfaces.join(",")}`);
  const tGen = Date.now();
  const gen = await api("../api/visualizations/generate.js", "POST", A.token, { body: { roomUploadId: room10, tileId, surfaces } });
  const genMs = Date.now() - tGen;
  console.log(`  TIMING generate (download + resize + Gemini image + upload + DB): ${(genMs / 1000).toFixed(1)} s`);
  const vz = gen.json?.visualization;
  check("10.9", "Generate (real Gemini image) -> 200 completed with signed result URL", gen.status === 200 && vz?.status === "completed" && /token=/.test(vz?.resultImageUrl ?? ""), `status=${gen.status}/${gen.json?.error?.code ?? ""} vizStatus=${vz?.status} attempt=${vz?.attemptNumber}`);
  if (gen.status === 200) {
    const img = await fetch(vz.resultImageUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    const isImg = (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50);
    check("10.10", "Signed URL serves a real image (JPEG/PNG signature)", img.status === 200 && isImg && buf.length > 10000, `HTTP ${img.status}, ${buf.length} bytes, ${img.headers.get("content-type")}`);
    const vrow = await admin.from("visualizations").select("status,result_storage_path,completed_at").eq("id", vz.id).single();
    const job = await admin.from("generation_jobs").select("status,attempt_number").eq("visualization_id", vz.id);
    check("10.11", "DB: visualization completed w/ path & completed_at; generation_job completed", vrow.data?.status === "completed" && !!vrow.data?.result_storage_path && !!vrow.data?.completed_at && job.data?.length === 1 && job.data[0]!.status === "completed", `viz=${vrow.data?.status}, jobs=${JSON.stringify(job.data?.map((j) => j.status))}`);
    check("10.12", "Result stored under user's own folder", (vrow.data?.result_storage_path ?? "").startsWith(`${A.id}/`), "path prefix = user id");
    const listB = await api("../api/visualizations/room/[roomId].js", "GET", B.token, { query: { roomId: room10 } });
    const getB = await api("../api/visualizations/[id]/index.js", "GET", B.token, { query: { id: vz.id } });
    const listA = await api("../api/visualizations/room/[roomId].js", "GET", A.token, { query: { roomId: room10 } });
    check("10.13", "Visualization visible to owner, hidden from B (list + get)", listA.status === 200 && listA.json?.visualizations?.length === 1 && listB.status === 404 && getB.status === 404, `A list=${listA.status}/${listA.json?.visualizations?.length}, B list=${listB.status}, B get=${getB.status}`);
    const genB2 = await api("../api/visualizations/generate.js", "POST", B.token, { body: { roomUploadId: room10, tileId, surfaces, visualizationId: vz.id } });
    check("10.14", "B cannot retry/regenerate A's visualization", genB2.status === 404, `status=${genB2.status}/${genB2.json?.error?.code}`);
  }
  const storedAfter = await admin.storage.from("room-images").download(`${A.id}/${projA}/${room10}.jpg`);
  const storedAfterBuf = storedAfter.data ? Buffer.from(await storedAfter.data.arrayBuffer()) : Buffer.alloc(0);
  check("10.16", "ORIGINAL stored photo is STILL byte-identical after analysis + recommendation + generation (only in-memory model copies were resized)", storedAfterBuf.equals(bytes), `stored=${storedAfterBuf.length} bytes, original=${bytes.length}, identical=${storedAfterBuf.equals(bytes)}`);
  console.log(`  (info) JSON body for this photo would be ${((Math.ceil(bytes.length / 3) * 4 + 300) / 1048576).toFixed(2)} MB base64 - over Vercel's 4.5 MB limit unless the browser downsizes first (client preprocessing, verified separately)`);
  const genBadSurface = await api("../api/visualizations/generate.js", "POST", A.token, { body: { roomUploadId: room10, tileId, surfaces: ["ceiling"] } });
  check("10.15", "Invalid surface value rejected (400)", genBadSurface.status === 400, `status=${genBadSurface.status}`);
}

async function cleanup() {
  console.log("\n== CLEANUP ==");
  const report: string[] = [];
  for (const u of users) {
    for (const bucket of ["room-images", "generated-visualizations"]) {
      const files = await listAll(bucket, u.id);
      if (files.length) await admin.storage.from(bucket).remove(files);
    }
  }
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  if (tileId) {
    await admin.from("tiles").delete().eq("id", tileId);
    await admin.storage.from("tile-images").remove([tilePath]);
  }

  let allClean = true;
  const uids = users.map((u) => u.id);
  for (const t of ["profiles", "projects", "room_uploads", "visualizations"]) {
    const col = t === "profiles" ? "id" : "user_id";
    const r = await admin.from(t).select("*", { count: "exact", head: true }).in(col, uids);
    report.push(`${t} rows for temp users: ${r.count}`);
    if (r.count !== 0) allClean = false;
  }
  const ra = await admin.from("room_analyses").select("*", { count: "exact", head: true });
  report.push(`room_analyses total: ${ra.count}`);
  if (ra.count) allClean = false;
  const gj = await admin.from("generation_jobs").select("*", { count: "exact", head: true });
  report.push(`generation_jobs total: ${gj.count}`);
  if (gj.count) allClean = false;
  const tl = await admin.from("tiles").select("*", { count: "exact", head: true }).eq("sku", "LIVE-TEST-PHASE4");
  report.push(`temp tile rows: ${tl.count}`);
  if (tl.count !== 0) allClean = false;
  const tiles = await admin.from("tiles").select("*", { count: "exact", head: true });
  report.push(`tiles total: ${tiles.count}`);
  for (const bucket of ["room-images", "generated-visualizations", "tile-images"]) {
    const files = await listAll(bucket, "");
    report.push(`storage ${bucket} objects remaining: ${files.length}`);
    if (files.length) allClean = false;
  }
  const lu = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  const left = (lu.data?.users ?? []).filter((x) => uids.includes(x.id)).length;
  report.push(`temp auth users remaining: ${left} (total users: ${lu.data?.users.length})`);
  if (left) allClean = false;
  report.forEach((l) => console.log("  " + l));
  console.log(`CLEANUP RESULT: ${allClean ? "CLEAN" : "INCOMPLETE - review above"}`);
}

main()
  .catch((e) => {
    console.log("TEST RUN ABORTED:", redact(String(e?.message ?? e)));
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.log("cleanup error:", redact(String(e?.message ?? e))));
    const failed = results.filter((r) => !r.ok);
    console.log(`\nSUMMARY: ${results.filter((r) => r.ok).length} passed, ${failed.length} failed${failed.length ? " -> " + failed.map((f) => f.id).join(",") : ""}`);
  });
