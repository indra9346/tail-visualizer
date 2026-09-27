/**
 * Phase 4 policy probe (post-0005) — LOCAL ONLY.
 *
 * Re-runs the three attacks that succeeded before migration 0005 and
 * proves each is now BLOCKED, then proves legitimate use still works
 * through the server (service-role) path. Two temp users + one temp tile,
 * always cleaned up. Never prints secrets.
 *
 * Attack 1: forge room_uploads.storage_path -> another user's file
 * Attack 2: rewrite visualizations.result_storage_path -> another user's file
 * Attack 3: direct client upload / delete on room-images (bypasses API validation + rate limit)
 * Plus:     cross-user reads via storage and API remain impossible.
 */
import "../server/lib/loadLocalEnv.js";
import "./_liveGuard.js"; // refuses to run without PHASE4_ALLOW_LIVE_TESTS=1; prints the target project ref
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "../server/lib/supabaseServerClient.js";
import { makeReq, makeRes } from "../test/helpers/fakeHttp.js";

const URL_ = process.env.SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const admin = getSupabaseServerClient();
const users: { id: string; token: string }[] = [];
let tileId: string | null = null;
let failures = 0;

function verdict(label: string, blocked: boolean, evidence: string) {
  if (!blocked) failures++;
  console.log(`${blocked ? "BLOCKED    " : "NOT BLOCKED"} | ${label} | ${evidence}`);
}

async function api(path: string, method: string, token: string, query: any = {}, body?: any) {
  const mod = await import(path);
  const res = makeRes();
  await mod.default(makeReq({ method, headers: { authorization: `Bearer ${token}` }, query, body }), res);
  return { status: res.statusCode as number, json: res._json as any };
}

// smallest valid PNG (1x1)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  for (const l of ["a", "b"]) {
    const email = `phase4-${l}-${randomBytes(4).toString("hex")}@example.invalid`;
    const password = randomBytes(24).toString("base64url");
    const c = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (c.error || !c.data.user) throw new Error("createUser failed");
    const rec = { id: c.data.user.id, token: "" };
    users.push(rec);
    const s = await createClient(URL_, ANON, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
    rec.token = s.data.session!.access_token;
  }
  const [A, B] = users as [(typeof users)[0], (typeof users)[0]];
  const ca = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${A.token}` } } });
  const cb = createClient(URL_, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${B.token}` } } });

  // ---- setup, all through the server/service-role path ----
  const apA = await api("../api/_routes/projects.js", "POST", A.token, {}, { name: "A" });
  const apB = await api("../api/_routes/projects.js", "POST", B.token, {}, { name: "B" });
  const projA = apA.json.project.id as string;
  const projB = apB.json.project.id as string;
  console.log(`setup: projects created via API -> ${apA.status}/${apB.status}`);

  const upB = await api("../api/_routes/roomUpload.js", "POST", B.token, {}, { projectId: projB, fileName: "b.png", mimeType: "image/png", base64Data: PNG.toString("base64") });
  const bRoomId = upB.json.room.id as string;
  const bRoomPath = `${B.id}/${projB}/${bRoomId}.png`;
  await admin.storage.from("generated-visualizations").upload(`${B.id}/${projB}/b-viz.png`, PNG, { contentType: "image/png" });
  const t = await admin.from("tiles").insert({ sku: "LIVE-TEST-PHASE4-P", name: "probe", category: "both", storage_path: "catalog/none.png" }).select("id").single();
  tileId = t.data!.id;
  const upA = await api("../api/_routes/roomUpload.js", "POST", A.token, {}, { projectId: projA, fileName: "a.png", mimeType: "image/png", base64Data: PNG.toString("base64") });
  const aRoomId = upA.json.room.id as string;
  const vRow = await admin.from("visualizations").insert({ room_upload_id: aRoomId, user_id: A.id, tile_id: tileId, applied_surfaces: ["floor"] }).select("id").single();
  const vId = vRow.data!.id as string;

  console.log("\n== ATTACK 1: forge room_uploads.storage_path -> B's file ==");
  const forge = await ca.from("room_uploads").insert({ project_id: projA, user_id: A.id, storage_path: bRoomPath, mime_type: "image/png", file_size_bytes: PNG.length }).select("id");
  const forgedCount = await admin.from("room_uploads").select("id", { count: "exact", head: true }).eq("storage_path", bRoomPath).eq("user_id", A.id);
  verdict("A INSERTs room_uploads row with storage_path = B's file", !!forge.error && forgedCount.count === 0, `error=${forge.error?.code ?? "none"}, forged rows in DB=${forgedCount.count}`);
  const retarget = await ca.from("room_uploads").update({ storage_path: bRoomPath }).eq("id", aRoomId).select("id");
  const aRoomNow = await admin.from("room_uploads").select("storage_path").eq("id", aRoomId).single();
  verdict("A UPDATEs own room_uploads.storage_path -> B's file", (retarget.data?.length ?? 0) === 0 && aRoomNow.data?.storage_path !== bRoomPath, `error=${retarget.error?.code ?? "none"}, affected=${retarget.data?.length ?? 0}`);

  console.log("\n== ATTACK 2: rewrite visualizations.result_storage_path -> B's generated file ==");
  const vForge = await ca.from("visualizations").update({ status: "completed", result_storage_path: `${B.id}/${projB}/b-viz.png` }).eq("id", vId).select("id");
  const vNow = await admin.from("visualizations").select("status,result_storage_path").eq("id", vId).single();
  verdict("A UPDATEs own visualization.result_storage_path -> B's file", (vForge.data?.length ?? 0) === 0 && vNow.data?.result_storage_path === null, `error=${vForge.error?.code ?? "none"}, affected=${vForge.data?.length ?? 0}, result path still null=${vNow.data?.result_storage_path === null}`);
  const vIns = await ca.from("visualizations").insert({ room_upload_id: aRoomId, user_id: A.id, tile_id: tileId, applied_surfaces: ["floor"], status: "completed", result_storage_path: `${B.id}/${projB}/b-viz.png` }).select("id");
  verdict("A INSERTs a completed visualization pointing at B's file", !!vIns.error, `error=${vIns.error?.code ?? "none"}`);

  console.log("\n== ATTACK 3: direct client writes/deletes on room-images ==");
  const up = await ca.storage.from("room-images").upload(`${A.id}/${projA}/direct.png`, PNG, { contentType: "image/png" });
  verdict("A uploads directly into OWN room-images folder", !!up.error, up.error?.message ?? "accepted");
  const disguised = await ca.storage.from("room-images").upload(`${A.id}/${projA}/disguised.png`, Buffer.from("not an image at all"), { contentType: "image/png" });
  verdict("A uploads NON-image bytes labelled image/png directly", !!disguised.error, disguised.error?.message ?? "accepted");
  let spam = 0;
  for (let i = 0; i < 25; i++) if (!(await ca.storage.from("room-images").upload(`${A.id}/spam/${i}.png`, PNG, { contentType: "image/png" })).error) spam++;
  verdict("25 direct uploads bypassing the API's 20/hour rate limit", spam === 0, `${spam}/25 accepted`);
  const own = `${A.id}/${projA}/${aRoomId}.png`;
  const rmOwn = await ca.storage.from("room-images").remove([own]);
  const ownStill = await admin.storage.from("room-images").download(own);
  verdict("A deletes OWN room image directly", !ownStill.error && (rmOwn.data?.length ?? 0) === 0, `removed=${rmOwn.data?.length ?? 0}, file intact=${!ownStill.error}`);
  const rmB = await ca.storage.from("room-images").remove([bRoomPath]);
  const bStill = await admin.storage.from("room-images").download(bRoomPath);
  verdict("A deletes B's room image", !bStill.error && (rmB.data?.length ?? 0) === 0, `removed=${rmB.data?.length ?? 0}, file intact=${!bStill.error}`);
  const rmViz = await ca.storage.from("generated-visualizations").remove([`${B.id}/${projB}/b-viz.png`]);
  verdict("A deletes B's generated visualization", (rmViz.data?.length ?? 0) === 0, `removed=${rmViz.data?.length ?? 0}`);

  console.log("\n== CROSS-USER READS remain impossible ==");
  const dl = await ca.storage.from("room-images").download(bRoomPath);
  verdict("A downloads B's room image via storage API", !!dl.error, dl.error ? "denied" : "READ");
  const sg = await ca.storage.from("room-images").createSignedUrl(bRoomPath, 60);
  verdict("A creates a signed URL for B's room image", !!sg.error, sg.error ? "denied" : "SIGNED");
  const lst = await ca.storage.from("room-images").list(`${B.id}/${projB}`);
  verdict("A lists B's folder", (lst.data?.length ?? 0) === 0, `${lst.data?.length ?? 0} items`);
  const rows = await ca.from("room_uploads").select("id").eq("id", bRoomId);
  verdict("A SELECTs B's room_uploads row", (rows.data?.length ?? 0) === 0, `${rows.data?.length ?? 0} rows`);
  const apiRoom = await api("../api/_routes/roomGet.js", "GET", A.token, { id: bRoomId });
  verdict("A calls GET /api/rooms/{B's room}", apiRoom.status === 404 && !/token=/.test(JSON.stringify(apiRoom.json)), `HTTP ${apiRoom.status}`);
  const bDirect = await cb.from("room_uploads").select("id").eq("id", aRoomId);
  verdict("B SELECTs A's room_uploads row", (bDirect.data?.length ?? 0) === 0, `${bDirect.data?.length ?? 0} rows`);

  console.log("\n== Legitimate use still works through the server (service-role) path ==");
  const okRoom = await api("../api/_routes/roomGet.js", "GET", A.token, { id: aRoomId });
  const signedOk = /token=/.test(okRoom.json?.room?.imageUrl ?? "");
  console.log(`${okRoom.status === 200 && signedOk ? "WORKS      " : "BROKEN     "} | A GET /api/rooms/{own room} -> ${okRoom.status}, signed url=${signedOk}`);
  const okList = await api("../api/_routes/projectRooms.js", "GET", A.token, { id: projA });
  console.log(`${okList.status === 200 && okList.json?.rooms?.length === 1 ? "WORKS      " : "BROKEN     "} | A GET /api/projects/{own}/rooms -> ${okList.status}, rooms=${okList.json?.rooms?.length}`);
  const ownRead = await ca.storage.from("room-images").download(own);
  console.log(`${!ownRead.error ? "WORKS      " : "BROKEN     "} | A reads OWN room image (owner-only SELECT policy) -> ${ownRead.error ? "denied" : "ok"}`);
  const ownProj = await ca.from("projects").select("id").eq("id", projA);
  console.log(`${ownProj.data?.length === 1 ? "WORKS      " : "BROKEN     "} | A SELECTs own project (owner-only SELECT policy)`);
  if (okRoom.status !== 200 || !signedOk || okList.status !== 200 || ownRead.error || ownProj.data?.length !== 1) failures++;
}

async function cleanup() {
  for (const u of users) {
    for (const bucket of ["room-images", "generated-visualizations"]) {
      const walk = async (prefix: string): Promise<string[]> => {
        const out: string[] = [];
        const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
        for (const e of data ?? []) {
          const p = `${prefix}/${e.name}`;
          if (e.id === null) out.push(...(await walk(p)));
          else out.push(p);
        }
        return out;
      };
      const files = await walk(u.id);
      if (files.length) await admin.storage.from(bucket).remove(files);
    }
  }
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
  if (tileId) await admin.from("tiles").delete().eq("id", tileId);
  const lu = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
  const tl = await admin.from("tiles").select("*", { count: "exact", head: true });
  const ro = await admin.storage.from("room-images").list("", { limit: 10 });
  console.log(`\nCLEANUP: auth users left=${lu.data?.users.length}, tiles left=${tl.count}, room-images top-level entries left=${ro.data?.length}`);
}

main()
  .catch((e) => {
    failures++;
    console.log("PROBE ABORTED:", String(e?.message ?? e).replace(/[A-Za-z0-9_-]{25,}/g, "<r>"));
  })
  .finally(async () => {
    await cleanup().catch((e) => console.log("cleanup error", String(e?.message ?? e)));
    console.log(`\nPROBE RESULT: ${failures === 0 ? "ALL ATTACKS BLOCKED, LEGITIMATE USE WORKS" : failures + " PROBLEM(S) - see above"}`);
  });
