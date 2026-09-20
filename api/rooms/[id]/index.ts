import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../../server/lib/auth.js";
import { parseOrThrow, uuidSchema } from "../../../server/lib/validation.js";
import { verifyRoomOwnership } from "../../../server/db/rooms.js";
import { createSignedUrl } from "../../../server/storage/imageStorage.js";
import { BUCKETS } from "../../../server/storage/buckets.js";

export default createHandler({ methods: ["GET"], operation: "getRoom" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const roomId = parseOrThrow(uuidSchema, req.query.id);

  const room = await verifyRoomOwnership(roomId, user.id);
  const signedImageUrl = await createSignedUrl(BUCKETS.roomImages, room.storagePath, user.id);

  res.status(200).json({
    room: {
      id: room.id,
      projectId: room.projectId,
      status: room.status,
      errorMessage: room.errorMessage,
      createdAt: room.createdAt,
      imageUrl: signedImageUrl,
    },
  });
});
