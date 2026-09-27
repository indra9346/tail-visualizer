const ROOM_ID = "33333333-3333-3333-3333-333333333333";
const USER_ID = "11111111-1111-1111-1111-111111111111";

const fakeRoom = {
  id: ROOM_ID,
  projectId: "p1",
  userId: USER_ID,
  storagePath: `${USER_ID}/p1/${ROOM_ID}.jpg`,
  mimeType: "image/jpeg",
  fileSizeBytes: 1000,
  status: "uploaded" as const,
  errorMessage: null,
  createdAt: "2026-01-01",
};

const existingAnalysis = {
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

let getAnalysisImpl: () => Promise<unknown> = async () => null;
const analyzeRoomMock = jest.fn(async () => ({ ...existingAnalysis, id: undefined }));
const insertAnalysisMock = jest.fn(async (a: unknown) => ({ ...(a as object), id: "analysis-2", createdAt: "2026-01-02" }));
const updateRoomStatusMock = jest.fn(async () => undefined);
const downloadRoomImageMock = jest.fn(async () => ({ buffer: Buffer.from("fake"), mimeType: "image/jpeg" }));

jest.mock("../server/lib/auth", () => ({
  authenticateRequest: async () => ({ id: USER_ID, email: null }),
}));
jest.mock("../server/db/rooms", () => ({
  verifyRoomOwnership: async () => fakeRoom,
  updateRoomStatus: updateRoomStatusMock,
}));
jest.mock("../server/lib/rateLimit", () => ({
  checkRateLimit: jest.fn(),
  RateLimits: {
    roomAnalyze: { limit: 5, windowMs: 1000 },
    tileRecommend: { limit: 5, windowMs: 1000 },
    visualizationGenerate: { limit: 5, windowMs: 1000 },
    roomUpload: { limit: 5, windowMs: 1000 },
  },
}));
jest.mock("../server/db/analyses", () => ({
  getAnalysisByRoomUploadId: () => getAnalysisImpl(),
  insertAnalysis: insertAnalysisMock,
}));
jest.mock("../server/ai/analyzeRoom", () => ({ analyzeRoom: analyzeRoomMock }));
jest.mock("../server/storage/imageStorage", () => ({ downloadRoomImage: downloadRoomImageMock }));

import handler from "../api/_routes/roomAnalyze";
import { makeReq, makeRes } from "./helpers/fakeHttp";

describe("room analysis reuse (idempotency)", () => {
  test("when an analysis already exists, it is returned and Gemini is NEVER called", async () => {
    getAnalysisImpl = async () => existingAnalysis;

    const req = makeReq({ method: "POST", headers: { authorization: "Bearer x" }, query: { id: ROOM_ID } });
    const res = makeRes();
    await handler(req, res);

    expect(analyzeRoomMock).not.toHaveBeenCalled();
    expect(insertAnalysisMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect((res._json as any).reused).toBe(true);
    expect((res._json as any).analysis.id).toBe("analysis-1");
  });

  test("when no analysis exists yet, analyzeRoom is called exactly once and the result is persisted", async () => {
    getAnalysisImpl = async () => null;
    analyzeRoomMock.mockClear();
    insertAnalysisMock.mockClear();

    const req = makeReq({ method: "POST", headers: { authorization: "Bearer x" }, query: { id: ROOM_ID } });
    const res = makeRes();
    await handler(req, res);

    expect(analyzeRoomMock).toHaveBeenCalledTimes(1);
    expect(insertAnalysisMock).toHaveBeenCalledTimes(1);
    expect(downloadRoomImageMock).toHaveBeenCalledWith(fakeRoom.storagePath, USER_ID);
    expect(res.statusCode).toBe(201);
    expect((res._json as any).reused).toBe(false);
  });
});
