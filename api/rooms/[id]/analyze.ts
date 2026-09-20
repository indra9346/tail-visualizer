import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../../server/lib/auth.js";
import { parseOrThrow, uuidSchema } from "../../../server/lib/validation.js";
import { checkRateLimit, RateLimits } from "../../../server/lib/rateLimit.js";
import { verifyRoomOwnership, updateRoomStatus } from "../../../server/db/rooms.js";
import { getAnalysisByRoomUploadId, insertAnalysis } from "../../../server/db/analyses.js";
import { downloadRoomImage } from "../../../server/storage/imageStorage.js";
import { analyzeRoom } from "../../../server/ai/analyzeRoom.js";
import { AiServiceError } from "../../../server/ai/errors.js";

/**
 * Explicit function duration (Vercel, Fluid compute). Sized for the
 * worst case: model call(s) bounded by the timeouts in server/ai/config.ts
 * (a single bounded retry => at most ~2x the per-call timeout) plus
 * storage transfer and image resizing. Must stay >= that worst case.
 */
export const config = { maxDuration: 120 };

/**
 * Idempotent by design: if room_analyses already has a row for this
 * room_upload_id, it is returned as-is and Gemini is NEVER called again.
 * This also means duplicate/concurrent clicks on "Analyze" are safe.
 */
export default createHandler({ methods: ["POST"], operation: "analyzeRoomEndpoint" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const roomId = parseOrThrow(uuidSchema, req.query.id);

  const room = await verifyRoomOwnership(roomId, user.id);

  const existing = await getAnalysisByRoomUploadId(room.id);
  if (existing) {
    res.status(200).json({ analysis: existing, reused: true });
    return;
  }

  checkRateLimit(`roomAnalyze:${user.id}`, RateLimits.roomAnalyze.limit, RateLimits.roomAnalyze.windowMs);

  await updateRoomStatus(room.id, "analyzing");

  try {
    const image = await downloadRoomImage(room.storagePath, user.id);
    const analysis = await analyzeRoom({ roomUploadId: room.id, image });
    const saved = await insertAnalysis(analysis);
    await updateRoomStatus(room.id, "analyzed");

    res.status(201).json({ analysis: saved, reused: false });
  } catch (err) {
    const safeMessage = err instanceof AiServiceError ? err.safeMessage : "Room analysis failed.";
    await updateRoomStatus(room.id, "failed", safeMessage);
    throw err;
  }
});
