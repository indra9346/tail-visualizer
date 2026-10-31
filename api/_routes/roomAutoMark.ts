import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { autoMarkBodySchema, parseOrThrow, uuidSchema } from "../../server/lib/validation.js";
import { checkRateLimit, RateLimits } from "../../server/lib/rateLimit.js";
import { verifyRoomOwnership } from "../../server/db/rooms.js";
import { downloadRoomImage } from "../../server/storage/imageStorage.js";
import { autoMarkEnabled, autoMarkSurfaces } from "../../server/ai/autoMark.js";

/**
 * The AI marks the chosen surfaces (floor, walls, ...) on the owner's room photo, so the owner only checks them.
 * Free (no credits) and not stored: the marks live in the design the owner is making. While AUTO_MARK_ENABLED is
 * off it answers { enabled: false } and the app lets the owner mark by hand, exactly as before.
 */
export default createHandler({ methods: ["POST"], operation: "autoMarkRoom" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const roomId = parseOrThrow(uuidSchema, req.query.id);
  const { surfaces } = parseOrThrow(autoMarkBodySchema, req.body);

  if (!autoMarkEnabled()) {
    res.status(200).json({ enabled: false, masks: [] });
    return;
  }

  const room = await verifyRoomOwnership(roomId, user.id);
  checkRateLimit(`roomAutoMark:${user.id}`, RateLimits.roomAutoMark.limit, RateLimits.roomAutoMark.windowMs);
  const image = await downloadRoomImage(room.storagePath, user.id);
  const masks = await autoMarkSurfaces({ roomUploadId: room.id, image, surfaces });
  res.status(200).json({ enabled: true, masks });
});
