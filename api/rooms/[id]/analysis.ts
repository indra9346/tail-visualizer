import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../../server/lib/auth.js";
import { parseOrThrow, uuidSchema } from "../../../server/lib/validation.js";
import { verifyRoomOwnership } from "../../../server/db/rooms.js";
import { getAnalysisByRoomUploadId } from "../../../server/db/analyses.js";
import { Errors } from "../../../server/lib/apiError.js";

/** Read-only. NEVER calls Gemini — analysis is a reusable artifact created only by POST /api/rooms/:id/analyze. */
export default createHandler({ methods: ["GET"], operation: "getRoomAnalysis" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const roomId = parseOrThrow(uuidSchema, req.query.id);

  const room = await verifyRoomOwnership(roomId, user.id);
  const analysis = await getAnalysisByRoomUploadId(room.id);

  if (!analysis) {
    throw Errors.analysisNotFound();
  }

  res.status(200).json({ analysis });
});
