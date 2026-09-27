import { makeReq, makeRes } from "./helpers/fakeHttp";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";

const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1020)]);

let projectOwnershipImpl: () => Promise<{ id: string; userId: string; name: string; createdAt: string }> = async () => ({
  id: PROJECT_ID,
  userId: USER_ID,
  name: "Test Project",
  createdAt: "2026-01-01",
});
let createRoomUploadImpl: (input: unknown) => Promise<{ id: string; projectId: string; status: string; createdAt: string }> = async (
  input,
) => ({
  id: (input as { id: string }).id,
  projectId: PROJECT_ID,
  status: "uploaded",
  createdAt: "2026-01-01",
});

const uploadImageMock = jest.fn(async (_bucket: string, _path: string, _buffer: Buffer, _mimeType: string) => undefined);
const deleteImageQuietlyMock = jest.fn(async (_bucket: string, _path: string) => undefined);

jest.mock("../server/lib/auth", () => ({
  authenticateRequest: async () => ({ id: USER_ID, email: null }),
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
jest.mock("../server/db/projects", () => ({
  verifyProjectOwnership: () => projectOwnershipImpl(),
}));
jest.mock("../server/db/rooms", () => ({
  createRoomUpload: (input: unknown) => createRoomUploadImpl(input),
}));
jest.mock("../server/storage/imageStorage", () => ({
  uploadImage: (bucket: string, path: string, buffer: Buffer, mimeType: string) => uploadImageMock(bucket, path, buffer, mimeType),
  deleteImageQuietly: (bucket: string, path: string) => deleteImageQuietlyMock(bucket, path),
}));

import handler from "../api/_routes/roomUpload";

function buildReq(overrides: Partial<{ projectId: string; fileName: string; mimeType: string; base64Data: string }> = {}) {
  return makeReq({
    method: "POST",
    headers: { authorization: "Bearer x" },
    body: {
      projectId: PROJECT_ID,
      fileName: "room.jpg",
      mimeType: "image/jpeg",
      base64Data: JPEG_BYTES.toString("base64"),
      ...overrides,
    },
  });
}

describe("POST /api/_routes/roomUpload", () => {
  beforeEach(() => {
    uploadImageMock.mockClear();
    deleteImageQuietlyMock.mockClear();
    projectOwnershipImpl = async () => ({ id: PROJECT_ID, userId: USER_ID, name: "Test Project", createdAt: "2026-01-01" });
    createRoomUploadImpl = async (input) => ({
      id: (input as { id: string }).id,
      projectId: PROJECT_ID,
      status: "uploaded",
      createdAt: "2026-01-01",
    });
  });

  test("accepts a valid JPEG and stores it under the correct path convention", async () => {
    const req = buildReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
    const [bucket, path] = uploadImageMock.mock.calls[0] as unknown as [string, string, Buffer, string];
    expect(bucket).toBe("room-images");
    expect(path).toMatch(new RegExp(`^${USER_ID}/${PROJECT_ID}/.+\\.jpg$`));
  });

  test("rejects a renamed non-image file even though mimeType claims image/jpeg", async () => {
    const fakeText = Buffer.from("not actually an image", "utf8");
    const req = buildReq({ base64Data: fakeText.toString("base64") });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(uploadImageMock).not.toHaveBeenCalled(); // rejected before ever touching storage
  });

  test("rejects an oversized file before touching storage", async () => {
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(11 * 1024 * 1024)]);
    const req = buildReq({ base64Data: huge.toString("base64") });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  test("rejects a wildly oversized base64 payload at the SCHEMA level, before decoding it into memory", async () => {
    // Simulates an attacker sending an absurdly large body attempting resource
    // exhaustion — this must be rejected by Zod's max-length check before
    // Buffer.from() ever decodes the string.
    const massiveBase64 = "A".repeat(20_000_000);
    const req = buildReq({ base64Data: massiveBase64 });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect((res._json as any).error.code).toBe("VALIDATION_ERROR");
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  test("rejects uploading into a project the caller does not own", async () => {
    projectOwnershipImpl = async () => {
      const { Errors } = require("../server/lib/apiError");
      throw Errors.projectNotFound();
    };

    const req = buildReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  test("STORAGE FAILURE: cleans up the orphaned storage object when the DB insert fails after a successful upload", async () => {
    createRoomUploadImpl = async () => {
      throw new Error("simulated database insert failure");
    };

    const req = buildReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(uploadImageMock).toHaveBeenCalledTimes(1); // storage upload DID succeed
    expect(deleteImageQuietlyMock).toHaveBeenCalledTimes(1); // and was cleaned up
    const [bucket, path] = deleteImageQuietlyMock.mock.calls[0] as unknown as [string, string];
    expect(bucket).toBe("room-images");
    expect(path).toMatch(new RegExp(`^${USER_ID}/${PROJECT_ID}/.+\\.jpg$`));
  });
});
