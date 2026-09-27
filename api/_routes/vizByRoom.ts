import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, uuidSchema } from "../../server/lib/validation.js";
import { verifyRoomOwnership } from "../../server/db/rooms.js";
import { listVisualizationsForRoom } from "../../server/db/visualizations.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

/**
 * Supports "try another tile": the frontend lists prior visualizations
 * for this room (each already tied to the room's single reusable
 * analysis) without ever needing to re-analyze.
 */
export default createHandler({ methods: ["GET"], operation: "listRoomVisualizations" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const roomId = parseOrThrow(uuidSchema, req.query.roomId);

  const room = await verifyRoomOwnership(roomId, user.id);
  const visualizations = await listVisualizationsForRoom(room.id);

  const withUrls = await Promise.all(
    visualizations.map(async (v) => ({
      id: v.id,
      tileId: v.tileId,
      appliedSurfaces: v.appliedSurfaces,
      status: v.status,
      errorMessage: v.errorMessage,
      requirements: v.requirements,
      createdAt: v.createdAt,
      completedAt: v.completedAt,
      resultImageUrl: v.resultStoragePath ? await createSignedUrl(BUCKETS.generatedVisualizations, v.resultStoragePath, user.id) : null,
    })),
  );

  res.status(200).json({ visualizations: withUrls });
});
