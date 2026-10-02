import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, uuidSchema } from "../../server/lib/validation.js";
import { verifyRoomOwnership, deleteOwnedRoom } from "../../server/db/rooms.js";
import { listResultPathsForRooms } from "../../server/db/visualizations.js";
import { removeOwnedImagesQuietly } from "../../server/storage/cleanup.js";
import { Errors } from "../../server/lib/apiError.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

export default createHandler({ methods: ["GET", "DELETE"], operation: "getRoom" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const roomId = parseOrThrow(uuidSchema, req.query.id);

  if (req.method === "DELETE") {
    // Collect the stored files first: the cascade removes the rows that name them.
    const resultPaths = await listResultPathsForRooms([roomId], user.id);
    const removed = await deleteOwnedRoom(roomId, user.id);
    if (!removed) throw Errors.roomNotFound();
    await removeOwnedImagesQuietly(BUCKETS.roomImages, [removed.storagePath], user.id);
    await removeOwnedImagesQuietly(BUCKETS.generatedVisualizations, resultPaths, user.id);
    res.status(200).json({ deleted: true, roomId });
    return;
  }

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
