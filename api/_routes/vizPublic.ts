import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { listPublicVisualizations } from "../../server/db/visualizations.js";
import { getTileById } from "../../server/db/tiles.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

/**
 * Public "My Visualizations" feed: real, database-backed visualizations
 * that their owner has explicitly marked public (see migration 0011 and
 * server/db/visualizations.ts:setVisualizationVisibility). No authentication
 * required, and NEVER includes a private row — listPublicVisualizations()
 * filters is_public = true at the query itself.
 */
export default createHandler({ methods: ["GET"], operation: "listPublicVisualizations" }, async (_req: VercelRequest, res: VercelResponse) => {
  const rows = await listPublicVisualizations();

  const withDetails = await Promise.all(
    rows.map(async (v) => ({
      id: v.id,
      roomUploadId: v.roomUploadId,
      status: v.status,
      appliedSurfaces: v.appliedSurfaces,
      errorMessage: v.errorMessage,
      requirements: v.requirements,
      roomType: v.roomType,
      creditsCharged: v.creditsCharged,
      isPublic: true,
      createdAt: v.createdAt,
      completedAt: v.completedAt,
      // Signed with the row's OWN owner id (not the caller's — there isn't
      // one), since createSignedUrl requires proof the path belongs to the
      // id it's given.
      resultImageUrl: v.resultStoragePath ? await createSignedUrl(BUCKETS.generatedVisualizations, v.resultStoragePath, v.userId) : null,
      tile: await getTileById(v.tileId),
    })),
  );

  res.status(200).json({ visualizations: withDetails });
});
