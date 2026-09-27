import { randomUUID } from "node:crypto";
import { createFakeTablesClient } from "./helpers/fakeTable";
import { makeReq, makeRes } from "./helpers/fakeHttp";

/**
 * Route-level regression suite for POST /api/_routes/vizGenerate.
 *
 * Deliberately mocks only the OUTER boundaries (auth, room/analysis/tile
 * lookups, storage, the Gemini-calling function) and leaves the REAL
 * server/db/visualizations.ts and server/db/generationJobs.ts running
 * against an in-memory fake table (see helpers/fakeTable.ts) — the fix
 * for the retry-limit-bypass bug lives in visualizations.ts, so this is
 * what actually re-exercises it instead of re-implementing the same
 * logic inside a mock.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const ROOM_ID = randomUUID();
const PROJECT_ID = randomUUID();

const fakeRoom = {
  id: ROOM_ID,
  projectId: PROJECT_ID,
  userId: USER_ID,
  storagePath: `${USER_ID}/${PROJECT_ID}/${ROOM_ID}.jpg`,
  mimeType: "image/jpeg",
  fileSizeBytes: 1000,
  status: "analyzed" as const,
  errorMessage: null,
  createdAt: "2026-01-01",
};

const fakeAnalysis = {
  id: "analysis-1",
  roomUploadId: ROOM_ID,
  roomType: "bathroom" as const,
  confidence: 0.9,
  constructionState: "unfinished" as const,
  floorVisible: true,
  floorCurrentMaterial: null,
  floorConditionNotes: null,
  wallVisible: true,
  wallCurrentMaterial: null,
  wallConditionNotes: null,
  recommendedSurfaces: ["floor" as const],
  doorCount: 1,
  windowCount: 1,
  fixtures: [],
  lighting: "natural" as const,
  perspective: "straight_on" as const,
  warnings: [],
  rawAiResponse: {},
  analysisModel: "gemini-2.5-flash",
  createdAt: "2026-01-01",
};

function makeFloorTile(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    sku: "SKU-1",
    name: "Real Tile",
    brand: "Acme",
    category: "floor" as const,
    material: "porcelain",
    finish: "matte",
    colorFamily: "grey",
    sizeMm: "600x600",
    pricePerSqft: 40,
    currency: "INR",
    suitableRooms: ["bathroom" as const],
    storagePath: "catalog/real-tile.jpg",
    isActive: true,
    ownerId: USER_ID,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

const attackerRoom = {
  ...fakeRoom,
  id: randomUUID(),
  projectId: randomUUID(),
  userId: OTHER_USER_ID,
  storagePath: `${OTHER_USER_ID}/attacker-project/attacker-room.jpg`,
};

// --- mutable behavior hooks, see auth.test.ts for why this pattern is used ---
let currentUserId: string = USER_ID;
let roomOwnershipImpl: (roomId: string, userId: string) => Promise<typeof fakeRoom> = async (roomId, userId) => {
  const { Errors } = require("../server/lib/apiError");
  if (roomId === ROOM_ID && userId === USER_ID) return fakeRoom;
  if (roomId === attackerRoom.id && userId === OTHER_USER_ID) return attackerRoom;
  throw Errors.roomNotFound();
};
let analysisImpl: () => Promise<typeof fakeAnalysis | null> = async () => fakeAnalysis;
let tileImpl: (tileId: string) => Promise<ReturnType<typeof makeFloorTile> | null> = async () => null;
let generateVisualizationImpl: () => Promise<{ imageBuffer: Buffer; mimeType: string; model: string; finishReason: null; durationMs: number }> =
  async () => {
    throw new Error("generateVisualizationImpl not configured for this test");
  };

const fakeClient = createFakeTablesClient();

jest.mock("../server/lib/supabaseServerClient", () => ({
  getSupabaseServerClient: () => fakeClient,
}));
jest.mock("../server/lib/auth", () => ({
  authenticateRequest: async () => ({ id: currentUserId, email: null }),
}));
jest.mock("../server/lib/rateLimit", () => ({
  checkRateLimit: jest.fn(),
  RateLimits: {
    roomAnalyze: { limit: 999, windowMs: 1000 },
    tileRecommend: { limit: 999, windowMs: 1000 },
    visualizationGenerate: { limit: 999, windowMs: 1000 },
    roomUpload: { limit: 999, windowMs: 1000 },
  },
}));
jest.mock("../server/db/rooms", () => ({
  verifyRoomOwnership: (roomId: string, userId: string) => roomOwnershipImpl(roomId, userId),
}));
jest.mock("../server/db/analyses", () => ({
  getAnalysisByRoomUploadId: () => analysisImpl(),
}));
jest.mock("../server/db/tiles", () => ({
  getTileById: (tileId: string) => tileImpl(tileId),
}));
let uploadImageImpl: () => Promise<void> = async () => undefined;
jest.mock("../server/storage/imageStorage", () => ({
  downloadRoomImage: async () => ({ buffer: Buffer.from("room"), mimeType: "image/jpeg" }),
  downloadTileImage: async () => ({ buffer: Buffer.from("tile"), mimeType: "image/jpeg" }),
  uploadImage: () => uploadImageImpl(),
  deleteImageQuietly: async () => undefined,
  createSignedUrl: async () => "https://example.test/signed",
}));
let lastGenerateInput: any = null;
jest.mock("../server/ai/generateVisualization", () => ({
  generateVisualization: (input: unknown) => {
    lastGenerateInput = input;
    return generateVisualizationImpl();
  },
}));

let holdShouldFail = false;
const heldTransactions = new Set<string>();
const committedTransactions = new Set<string>();
const releasedTransactions = new Set<string>();
jest.mock("../server/db/billing", () => ({
  holdCreditsForGeneration: async (_userId: string, jobId: string) => {
    if (holdShouldFail) {
      const { Errors } = require("../server/lib/apiError");
      throw Errors.insufficientCredits();
    }
    const txId = `hold-${jobId}`;
    heldTransactions.add(txId);
    return { transactionId: txId, balance: 90, duplicate: false };
  },
  commitCreditHold: async (txId: string) => {
    committedTransactions.add(txId);
  },
  releaseCreditHold: async (txId: string) => {
    releasedTransactions.add(txId);
  },
  releaseStaleHoldsQuietly: async () => undefined,
}));

import handler from "../api/_routes/vizGenerate";

function buildReq(body: Record<string, unknown>) {
  return makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body });
}

describe("POST /api/_routes/vizGenerate", () => {
  beforeEach(() => {
    fakeClient._reset();
    currentUserId = USER_ID;
    roomOwnershipImpl = async (roomId, userId) => {
      const { Errors } = require("../server/lib/apiError");
      if (roomId === ROOM_ID && userId === USER_ID) return fakeRoom;
      if (roomId === attackerRoom.id && userId === OTHER_USER_ID) return attackerRoom;
      throw Errors.roomNotFound();
    };
    analysisImpl = async () => fakeAnalysis;
    holdShouldFail = false;
    heldTransactions.clear();
    committedTransactions.clear();
    releasedTransactions.clear();
    uploadImageImpl = async () => undefined;
  });

  test("rejects when no room analysis exists yet (never silently analyzes)", async () => {
    analysisImpl = async () => null;
    tileImpl = async () => makeFloorTile();

    const req = buildReq({ roomUploadId: ROOM_ID, tileId: randomUUID(), surfaces: ["floor"] });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect((res._json as any).error.code).toBe("ANALYSIS_REQUIRED");
  });

  test("rejects a nonexistent tile id", async () => {
    tileImpl = async () => null;

    const req = buildReq({ roomUploadId: ROOM_ID, tileId: randomUUID(), surfaces: ["floor"] });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect((res._json as any).error.code).toBe("TILE_NOT_FOUND");
  });

  test("rejects an inactive tile with TILE_INACTIVE, distinct from TILE_NOT_FOUND", async () => {
    tileImpl = async () => makeFloorTile({ isActive: false });

    const req = buildReq({ roomUploadId: ROOM_ID, tileId: randomUUID(), surfaces: ["floor"] });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect((res._json as any).error.code).toBe("TILE_INACTIVE");
  });

  test("rejects a tile that belongs to another showroom (reported as not found)", async () => {
    tileImpl = async () => makeFloorTile({ ownerId: OTHER_USER_ID });

    const req = buildReq({ roomUploadId: ROOM_ID, tileId: randomUUID(), surfaces: ["floor"] });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect((res._json as any).error.code).toBe("TILE_NOT_FOUND");
  });

  test("rejects a wall tile applied to a floor surface (category incompatibility)", async () => {
    tileImpl = async () => makeFloorTile({ category: "wall" });

    const req = buildReq({ roomUploadId: ROOM_ID, tileId: randomUUID(), surfaces: ["floor"] });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect((res._json as any).error.code).toBe("TILE_SURFACE_INCOMPATIBLE");
  });

  test("rejects access to another user's room", async () => {
    roomOwnershipImpl = async () => {
      const { Errors } = require("../server/lib/apiError");
      throw Errors.roomNotFound();
    };
    tileImpl = async () => makeFloorTile();

    const req = buildReq({ roomUploadId: ROOM_ID, tileId: randomUUID(), surfaces: ["floor"] });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect((res._json as any).error.code).toBe("ROOM_NOT_FOUND");
  });

  test("rejects a request that forges product metadata as authoritative (strict schema)", async () => {
    tileImpl = async () => makeFloorTile();

    const req = buildReq({
      roomUploadId: ROOM_ID,
      tileId: randomUUID(),
      surfaces: ["floor"],
      tileName: "Forged Tile",
      tilePrice: 1,
      userId: OTHER_USER_ID,
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res._json as any).error.code).toBe("VALIDATION_ERROR");
  });

  test("REGRESSION: repeated failed retries reuse the same visualization and enforce MAX_GENERATION_ATTEMPTS", async () => {
    const tile = makeFloorTile();
    tileImpl = async () => tile;
    generateVisualizationImpl = async () => {
      throw new Error("simulated persistent Gemini failure");
    };

    const body = { roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] };

    // Attempts 1-3: each fails, but must all operate on the SAME visualization row.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const req = buildReq(body);
      const res = makeRes();
      await handler(req, res);
      expect(res.statusCode).toBe(500); // generic Error, not an AiServiceError -> INTERNAL_ERROR mapping
    }

    const visualizations = fakeClient._dump("visualizations");
    const jobs = fakeClient._dump("generation_jobs");

    expect(visualizations).toHaveLength(1); // NOT 3 — this is the exact bug that was fixed
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.visualization_id === visualizations[0]!.id)).toBe(true);
    expect(jobs.map((j) => j.attempt_number).sort()).toEqual([1, 2, 3]);
    expect(visualizations[0]!.status).toBe("failed");

    // Attempt 4 must be rejected WITHOUT calling Gemini again.
    let generateCallCountBeforeFourth = 0;
    const originalImpl = generateVisualizationImpl;
    generateVisualizationImpl = async () => {
      generateCallCountBeforeFourth++;
      return originalImpl();
    };

    const req4 = buildReq(body);
    const res4 = makeRes();
    await handler(req4, res4);

    expect(res4.statusCode).toBe(429);
    expect((res4._json as any).error.code).toBe("RETRY_LIMIT_EXCEEDED");
    expect(generateCallCountBeforeFourth).toBe(0);
    expect(fakeClient._dump("generation_jobs")).toHaveLength(3); // still 3, no 4th job created
  });

  test("a new identical request after a COMPLETED visualization creates a fresh visualization, not a reuse", async () => {
    const tile = makeFloorTile();
    tileImpl = async () => tile;
    generateVisualizationImpl = async () => ({
      imageBuffer: Buffer.from("generated"),
      mimeType: "image/png",
      model: "gemini-2.5-flash-image",
      finishReason: null,
      durationMs: 10,
    });

    const body = { roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] };

    const req1 = buildReq(body);
    const res1 = makeRes();
    await handler(req1, res1);
    expect(res1.statusCode).toBe(200);

    const afterFirst = fakeClient._dump("visualizations");
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.status).toBe("completed");

    const req2 = buildReq(body);
    const res2 = makeRes();
    await handler(req2, res2);
    expect(res2.statusCode).toBe(200);

    const afterSecond = fakeClient._dump("visualizations");
    expect(afterSecond).toHaveLength(2); // a genuinely new request after success gets its own visualization
  });

  describe("credit charging", () => {
    test("a successful generation holds then COMMITS the credit hold exactly once; response reports the cost", async () => {
      const tile = makeFloorTile();
      tileImpl = async () => tile;
      generateVisualizationImpl = async () => ({ imageBuffer: Buffer.from("generated"), mimeType: "image/png", model: "m", finishReason: null, durationMs: 1 });

      const res = makeRes();
      await handler(buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] }), res);

      expect(res.statusCode).toBe(200);
      expect((res._json as any).visualization.creditsCharged).toBe(10);
      expect(heldTransactions.size).toBe(1);
      expect(committedTransactions.size).toBe(1);
      expect(releasedTransactions.size).toBe(0);
      const [heldId] = [...heldTransactions];
      expect(committedTransactions.has(heldId!)).toBe(true);
      expect(fakeClient._dump("visualizations")[0]!.credits_charged).toBe(10);
    });

    test("insufficient credits: no Gemini call, no visualization/job left running, no charge — 402", async () => {
      const tile = makeFloorTile();
      tileImpl = async () => tile;
      holdShouldFail = true;
      let generateCalls = 0;
      generateVisualizationImpl = async () => {
        generateCalls++;
        throw new Error("must not be called");
      };

      const res = makeRes();
      await handler(buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] }), res);

      expect(res.statusCode).toBe(402);
      expect((res._json as any).error.code).toBe("INSUFFICIENT_CREDITS");
      expect(generateCalls).toBe(0);
      expect(heldTransactions.size).toBe(0);
      expect(committedTransactions.size).toBe(0);
      expect(fakeClient._dump("visualizations")[0]!.status).toBe("failed");
      expect(fakeClient._dump("generation_jobs")[0]!.status).toBe("failed");
    });

    test("a failed Gemini call RELEASES the hold (never permanently loses credits) and never commits it", async () => {
      const tile = makeFloorTile();
      tileImpl = async () => tile;
      generateVisualizationImpl = async () => {
        throw new Error("Gemini upstream failure");
      };

      const res = makeRes();
      await handler(buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] }), res);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(heldTransactions.size).toBe(1);
      const [heldId] = [...heldTransactions];
      expect(releasedTransactions.has(heldId!)).toBe(true);
      expect(committedTransactions.has(heldId!)).toBe(false);
      expect(fakeClient._dump("visualizations")[0]!.status).toBe("failed");
      // credits_charged is never set on this row (DB default 0 — the fake table doesn't model column defaults).
      expect(fakeClient._dump("visualizations")[0]!.credits_charged ?? 0).toBe(0);
    });

    test("a storage upload failure after Gemini succeeds still releases the hold", async () => {
      const tile = makeFloorTile();
      tileImpl = async () => tile;
      generateVisualizationImpl = async () => ({ imageBuffer: Buffer.from("generated"), mimeType: "image/png", model: "m", finishReason: null, durationMs: 1 });
      uploadImageImpl = async () => {
        throw new Error("storage unavailable");
      };

      const res = makeRes();
      await handler(buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] }), res);

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      const [heldId] = [...heldTransactions];
      expect(releasedTransactions.has(heldId!)).toBe(true);
      expect(committedTransactions.size).toBe(0);
    });
  });

  test("requirements flow through: stored on the visualization row AND passed to Gemini (sanitized)", async () => {
    const tile = makeFloorTile();
    tileImpl = async () => tile;
    lastGenerateInput = null;
    generateVisualizationImpl = async () => ({ imageBuffer: Buffer.from("generated"), mimeType: "image/png", model: "m", finishReason: null, durationMs: 1 });

    const text = "Use the selected tile on the floor.  Keep the existing toilet, sink and shower unchanged.";
    const dirty = `  ${text.replace("  ", "   ")}${String.fromCharCode(0, 0x200b)}  `;
    const res = makeRes();
    await handler(buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"], requirements: dirty }), res);

    expect(res.statusCode).toBe(200);
    const expected = "Use the selected tile on the floor. Keep the existing toilet, sink and shower unchanged.";
    expect(fakeClient._dump("visualizations")[0]!.requirements).toBe(expected);
    expect(lastGenerateInput.requirements).toBe(expected);
  });

  test("no requirements -> stored as null and Gemini gets null (defaults)", async () => {
    const tile = makeFloorTile();
    tileImpl = async () => tile;
    lastGenerateInput = null;
    generateVisualizationImpl = async () => ({ imageBuffer: Buffer.from("generated"), mimeType: "image/png", model: "m", finishReason: null, durationMs: 1 });

    const res = makeRes();
    await handler(buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] }), res);
    expect(res.statusCode).toBe(200);
    expect(fakeClient._dump("visualizations")[0]!.requirements).toBeNull();
    expect(lastGenerateInput.requirements).toBeNull();
  });

  test("over-long requirements are rejected with 400 before any work or Gemini call", async () => {
    const tile = makeFloorTile();
    tileImpl = async () => tile;
    lastGenerateInput = null;
    const res = makeRes();
    await handler(buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"], requirements: "x".repeat(1600) }), res);
    expect(res.statusCode).toBe(400);
    expect(lastGenerateInput).toBeNull();
    expect(fakeClient._dump("visualizations")).toHaveLength(0);
  });

  test("an explicit retry visualizationId that doesn't match the room/tile/surfaces is rejected", async () => {
    const tile = makeFloorTile();
    tileImpl = async () => tile;
    generateVisualizationImpl = async () => ({
      imageBuffer: Buffer.from("x"),
      mimeType: "image/png",
      model: "m",
      finishReason: null,
      durationMs: 1,
    });

    // Create one visualization for tile A.
    const req1 = buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] });
    const res1 = makeRes();
    await handler(req1, res1);
    const createdId = (res1._json as any).visualization.id;

    // Attempt to "retry" it while claiming a different tile.
    const otherTile = makeFloorTile();
    tileImpl = async () => otherTile;
    const req2 = buildReq({ roomUploadId: ROOM_ID, tileId: otherTile.id, surfaces: ["floor"], visualizationId: createdId });
    const res2 = makeRes();
    await handler(req2, res2);

    expect(res2.statusCode).toBe(400);
    expect((res2._json as any).error.code).toBe("VALIDATION_ERROR");
  });

  test("cannot retry another user's visualization via a guessed visualizationId, even with their own valid room", async () => {
    const tile = makeFloorTile();
    tileImpl = async () => tile;
    generateVisualizationImpl = async () => ({
      imageBuffer: Buffer.from("x"),
      mimeType: "image/png",
      model: "m",
      finishReason: null,
      durationMs: 1,
    });

    // Victim (USER_ID) creates a real visualization.
    currentUserId = USER_ID;
    const req1 = buildReq({ roomUploadId: ROOM_ID, tileId: tile.id, surfaces: ["floor"] });
    const res1 = makeRes();
    await handler(req1, res1);
    const victimVisualizationId = (res1._json as any).visualization.id;
    expect(res1.statusCode).toBe(200);

    // Attacker (OTHER_USER_ID), authenticated with their OWN valid room, tries
    // to pass the victim's visualizationId as a "retry" target.
    currentUserId = OTHER_USER_ID;
    tileImpl = async () => ({ ...tile, ownerId: OTHER_USER_ID }); // attacker uses their OWN tile
    const req2 = buildReq({
      roomUploadId: attackerRoom.id,
      tileId: tile.id,
      surfaces: ["floor"],
      visualizationId: victimVisualizationId,
    });
    const res2 = makeRes();
    await handler(req2, res2);

    // The REAL (unmocked) verifyVisualizationOwnership rejects it — the
    // attacker's own room ownership is valid, but the visualization belongs
    // to someone else.
    expect(res2.statusCode).toBe(404);
    expect((res2._json as any).error.code).toBe("VISUALIZATION_NOT_FOUND");

    currentUserId = USER_ID;
  });
});
