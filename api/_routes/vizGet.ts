import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest, authenticateRequestOptional } from "../../server/lib/auth.js";
import { Errors } from "../../server/lib/apiError.js";
import { parseOrThrow, uuidSchema } from "../../server/lib/validation.js";
import { getVisualizationById, deleteOwnedVisualization } from "../../server/db/visualizations.js";
import { removeOwnedImagesQuietly } from "../../server/storage/cleanup.js";
import { getLatestJobForVisualization } from "../../server/db/generationJobs.js";
import { getTileById } from "../../server/db/tiles.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

// Accessible to the owner (signed in) OR anonymously when the visualization
// has been explicitly marked public by its owner — see migration 0011 and
// server/db/visualizations.ts:setVisualizationVisibility. A private
// visualization viewed by anyone else (including a signed-in stranger)
// reports the same "not found" as a nonexistent id, never a distinct
// "forbidden", so existence of a private row is never leaked either way.
export default createHandler({ methods: ["GET", "DELETE"], operation: "getVisualization" }, async (req: VercelRequest, res: VercelResponse) => {
  const visualizationId = parseOrThrow(uuidSchema, req.query.id);

  if (req.method === "DELETE") {
    const owner = await authenticateRequest(req);
    const removed = await deleteOwnedVisualization(visualizationId, owner.id);
    if (!removed) throw Errors.visualizationNotFound();
    await removeOwnedImagesQuietly(BUCKETS.generatedVisualizations, [removed.resultStoragePath], owner.id);
    res.status(200).json({ deleted: true, visualizationId });
    return;
  }

  const caller = await authenticateRequestOptional(req);

  const visualization = await getVisualizationById(visualizationId);
  const isOwner = !!caller && caller.id === visualization?.userId;
  if (!visualization || (!visualization.isPublic && !isOwner)) {
    throw Errors.visualizationNotFound();
  }

  // Historical display: show the tile actually used even if it has since
  // been deactivated in the catalog — this is not a purchasing decision.
  const [latestJob, tile] = await Promise.all([
    getLatestJobForVisualization(visualization.id),
    getTileById(visualization.tileId),
  ]);

  // Tiles used by a multi-area design (every id was validated against the owner's catalog at generation time).
  const designTileIds = [...new Set(visualization.design?.areas.flatMap((a) => a.tileIds) ?? [])];
  const designTiles = (await Promise.all(designTileIds.map((id) => getTileById(id)))).filter((t) => t !== null);

  // Always signed with the row's OWN owner id (not the caller's — a public
  // view may have no caller at all), since createSignedUrl requires proof
  // the path belongs to the id it's given.
  const resultImageUrl = visualization.resultStoragePath
    ? await createSignedUrl(BUCKETS.generatedVisualizations, visualization.resultStoragePath, visualization.userId)
    : null;

  res.status(200).json({
    visualization: {
      id: visualization.id,
      roomUploadId: visualization.roomUploadId,
      status: visualization.status,
      appliedSurfaces: visualization.appliedSurfaces,
      errorMessage: visualization.errorMessage,
      requirements: visualization.requirements,
      isPublic: visualization.isPublic,
      isOwner,
      createdAt: visualization.createdAt,
      completedAt: visualization.completedAt,
      resultImageUrl,
      tile,
      design: visualization.design,
      designTiles,
      latestAttempt: latestJob ? { attemptNumber: latestJob.attemptNumber, status: latestJob.status } : null,
    },
  });
});
