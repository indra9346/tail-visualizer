/**
 * Regression test for the Phase 4 cross-user read finding.
 *
 * Migration 0005 stops clients from writing room_uploads / visualizations
 * rows at all. This test covers the second, independent layer: even if a
 * row somehow held a storage path outside the authenticated caller's
 * `${userId}/` prefix (forged row, bug, bad migration), the API must
 * refuse (generic 404) and must NEVER reach Supabase Storage with the
 * service role.
 *
 * Uses the REAL imageStorage module; only the Supabase client is mocked so
 * we can assert Storage was never touched.
 */
const USER = "11111111-1111-4111-8111-111111111111";
const VICTIM = "22222222-2222-4222-8222-222222222222";
const ROOM_ID = "33333333-3333-4333-8333-333333333333";
const VIZ_ID = "44444444-4444-4444-8444-444444444444";

const storageCalls: string[] = [];
const fromMock = jest.fn((bucket: string) => ({
  createSignedUrl: async (path: string) => {
    storageCalls.push(`sign:${bucket}:${path}`);
    return { data: { signedUrl: "https://example.test/signed?token=abc" }, error: null };
  },
  download: async (path: string) => {
    storageCalls.push(`download:${bucket}:${path}`);
    return { data: new Blob(["x"], { type: "image/jpeg" }), error: null };
  },
}));

jest.mock("../server/lib/supabaseServerClient", () => ({
  getSupabaseServerClient: () => ({ storage: { from: fromMock } }),
}));
jest.mock("../server/lib/auth", () => ({
  authenticateRequest: async () => ({ id: USER, email: null }),
}));

let room = { id: ROOM_ID, projectId: "p1", userId: USER, storagePath: `${VICTIM}/p1/secret.jpg`, mimeType: "image/jpeg", fileSizeBytes: 1, status: "uploaded", errorMessage: null, createdAt: "x" };
let viz = { id: VIZ_ID, roomUploadId: ROOM_ID, userId: USER, tileId: "t", appliedSurfaces: ["floor"], status: "completed", resultStoragePath: `${VICTIM}/p1/secret-viz.jpg` as string | null, errorMessage: null, createdAt: "x", completedAt: "x" };

jest.mock("../server/db/rooms", () => ({
  verifyRoomOwnership: async () => room,
  updateRoomStatus: async () => undefined,
  listRoomUploadsForProject: async () => [room],
}));
jest.mock("../server/db/projects", () => ({ verifyProjectOwnership: async () => undefined }));
jest.mock("../server/db/visualizations", () => ({
  verifyVisualizationOwnership: async () => viz,
  listVisualizationsForRoom: async () => [viz],
}));
jest.mock("../server/db/generationJobs", () => ({ getLatestJobForVisualization: async () => null }));
jest.mock("../server/db/tiles", () => ({ getTileById: async () => null }));
jest.mock("../server/db/analyses", () => ({ getAnalysisByRoomUploadId: async () => null, insertAnalysis: jest.fn() }));
jest.mock("../server/ai/analyzeRoom", () => ({ analyzeRoom: jest.fn() }));
jest.mock("../server/lib/rateLimit", () => ({
  checkRateLimit: jest.fn(),
  RateLimits: {
    roomAnalyze: { limit: 5, windowMs: 1000 },
    tileRecommend: { limit: 5, windowMs: 1000 },
    visualizationGenerate: { limit: 5, windowMs: 1000 },
    roomUpload: { limit: 5, windowMs: 1000 },
  },
}));

import getRoom from "../api/_routes/roomGet";
import analyzeRoute from "../api/_routes/roomAnalyze";
import listProjectRooms from "../api/_routes/projectRooms";
import getViz from "../api/_routes/vizGet";
import listVizForRoom from "../api/_routes/vizByRoom";
import { analyzeRoom } from "../server/ai/analyzeRoom";
import { makeReq, makeRes } from "./helpers/fakeHttp";

const auth = { authorization: "Bearer x" };

beforeEach(() => {
  storageCalls.length = 0;
  room = { ...room, storagePath: `${VICTIM}/p1/secret.jpg` };
  viz = { ...viz, resultStoragePath: `${VICTIM}/p1/secret-viz.jpg` };
});

describe("forged storage_path in a DB row can never make the server touch another user's files", () => {
  test("GET /rooms/:id -> 404, Storage never signed", async () => {
    const res = makeRes();
    await getRoom(makeReq({ method: "GET", headers: auth, query: { id: ROOM_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(storageCalls).toEqual([]);
  });

  test("POST /rooms/:id/analyze -> 404, Storage never read, Gemini never called", async () => {
    const res = makeRes();
    await analyzeRoute(makeReq({ method: "POST", headers: auth, query: { id: ROOM_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(storageCalls).toEqual([]);
    expect(analyzeRoom).not.toHaveBeenCalled();
  });

  test("GET /projects/:id/rooms -> 404, Storage never signed", async () => {
    const res = makeRes();
    await listProjectRooms(makeReq({ method: "GET", headers: auth, query: { id: "55555555-5555-4555-8555-555555555555" } }), res);
    expect(res.statusCode).toBe(404);
    expect(storageCalls).toEqual([]);
  });

  test("GET /visualizations/:id with a forged result_storage_path -> 404, Storage never signed", async () => {
    const res = makeRes();
    await getViz(makeReq({ method: "GET", headers: auth, query: { id: VIZ_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(storageCalls).toEqual([]);
  });

  test("GET /visualizations/room/:roomId with a forged result_storage_path -> 404, Storage never signed", async () => {
    const res = makeRes();
    await listVizForRoom(makeReq({ method: "GET", headers: auth, query: { roomId: ROOM_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(storageCalls).toEqual([]);
  });

  test("traversal attempt inside the caller's own prefix is refused too", async () => {
    room = { ...room, storagePath: `${USER}/../${VICTIM}/p1/secret.jpg` };
    const res = makeRes();
    await getRoom(makeReq({ method: "GET", headers: auth, query: { id: ROOM_ID } }), res);
    expect(res.statusCode).toBe(404);
    expect(storageCalls).toEqual([]);
  });

  test("control: a legitimate path under the caller's own prefix is still signed (200)", async () => {
    room = { ...room, storagePath: `${USER}/p1/${ROOM_ID}.jpg` };
    const res = makeRes();
    await getRoom(makeReq({ method: "GET", headers: auth, query: { id: ROOM_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(storageCalls).toEqual([`sign:room-images:${USER}/p1/${ROOM_ID}.jpg`]);
  });

  test("control: an unfinished visualization (null result path) is still fine", async () => {
    viz = { ...viz, resultStoragePath: null };
    const res = makeRes();
    await getViz(makeReq({ method: "GET", headers: auth, query: { id: VIZ_ID } }), res);
    expect(res.statusCode).toBe(200);
    expect(storageCalls).toEqual([]);
  });
});
