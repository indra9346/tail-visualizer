import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { listVisualizationsForUser } from "../../server/db/visualizations.js";
import { getTileById } from "../../server/db/tiles.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

/** "My Visualizations": every visualization owned by the caller, newest first, with its tile and a signed result URL. */
export default createHandler({ methods: ["GET"], operation: "listMyVisualizations" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const rows = await listVisualizationsForUser(user.id);

  const withDetails = await Promise.all(
    rows.map(async (v) => ({
      id: v.id,
      roomUploadId: v.roomUploadId,
      status: v.status,
      appliedSurfaces: v.appliedSurfaces,
      design: v.design ?? null,
      errorMessage: v.errorMessage,
      requirements: v.requirements,
      roomType: v.roomType,
      creditsCharged: v.creditsCharged,
      isPublic: v.isPublic,
      createdAt: v.createdAt,
      completedAt: v.completedAt,
      resultImageUrl: v.resultStoragePath ? await createSignedUrl(BUCKETS.generatedVisualizations, v.resultStoragePath, user.id) : null,
      tile: await getTileById(v.tileId),
    })),
  );

  res.status(200).json({ visualizations: withDetails });
});
