import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, roomUploadBodySchema } from "../../server/lib/validation.js";
import { checkRateLimit, RateLimits } from "../../server/lib/rateLimit.js";
import { verifyProjectOwnership } from "../../server/db/projects.js";
import { createRoomUpload } from "../../server/db/rooms.js";
import { validateRoomImage } from "../../server/ai/imageValidation.js";
import { uploadImage, deleteImageQuietly } from "../../server/storage/imageStorage.js";
import { BUCKETS, roomImagePath } from "../../server/storage/buckets.js";
import { Errors } from "../../server/lib/apiError.js";

/**
 * NOTE on transport: this MVP accepts the image as base64 JSON
 * (`{ projectId, fileName, mimeType, base64Data }`) rather than
 * multipart/form-data, to avoid adding a streaming multipart parser in
 * this phase. This is documented as a known limitation in the Phase 2
 * write-up — production hardening should move to multipart or a
 * direct-to-storage signed upload URL to avoid the ~33% base64 overhead
 * on large images.
 */
export default createHandler({ methods: ["POST"], operation: "uploadRoom" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  checkRateLimit(`roomUpload:${user.id}`, RateLimits.roomUpload.limit, RateLimits.roomUpload.windowMs);

  const body = parseOrThrow(roomUploadBodySchema, req.body);

  await verifyProjectOwnership(body.projectId, user.id);

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.base64Data, "base64");
  } catch {
    throw Errors.validation("base64Data could not be decoded.");
  }

  const image = { buffer, mimeType: body.mimeType };
  // Re-validates by actual file signature and size — never trusts the client's declared mimeType.
  validateRoomImage(image);

  const roomUploadId = randomUUID();
  const storagePath = roomImagePath(user.id, body.projectId, roomUploadId, image.mimeType);

  await uploadImage(BUCKETS.roomImages, storagePath, image.buffer, image.mimeType);

  let room;
  try {
    room = await createRoomUpload({
      id: roomUploadId,
      projectId: body.projectId,
      userId: user.id,
      storagePath,
      mimeType: image.mimeType,
      fileSizeBytes: image.buffer.length,
    });
  } catch (err) {
    // DB insert failed after a successful storage upload — clean up the orphan.
    await deleteImageQuietly(BUCKETS.roomImages, storagePath);
    throw Errors.internal("Failed to save room upload.");
  }

  // Deliberately outside the try/catch above: a failure here means the room
  // row already committed successfully, so it must never trigger the
  // storage-orphan cleanup meant only for a failed insert.
  res.status(201).json({
    room: { id: room.id, projectId: room.projectId, status: room.status, createdAt: room.createdAt },
  });
});
