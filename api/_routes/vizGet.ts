import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, uuidSchema } from "../../server/lib/validation.js";
import { verifyVisualizationOwnership } from "../../server/db/visualizations.js";
import { getLatestJobForVisualization } from "../../server/db/generationJobs.js";
import { getTileById } from "../../server/db/tiles.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

export default createHandler({ methods: ["GET"], operation: "getVisualization" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const visualizationId = parseOrThrow(uuidSchema, req.query.id);

  const visualization = await verifyVisualizationOwnership(visualizationId, user.id);
  // Historical display: show the tile actually used even if it has since
  // been deactivated in the catalog — this is not a purchasing decision.
  const [latestJob, tile] = await Promise.all([
    getLatestJobForVisualization(visualization.id),
    getTileById(visualization.tileId),
  ]);

  const resultImageUrl = visualization.resultStoragePath
    ? await createSignedUrl(BUCKETS.generatedVisualizations, visualization.resultStoragePath, user.id)
    : null;

  res.status(200).json({
    visualization: {
      id: visualization.id,
      roomUploadId: visualization.roomUploadId,
      status: visualization.status,
      appliedSurfaces: visualization.appliedSurfaces,
      errorMessage: visualization.errorMessage,
      requirements: visualization.requirements,
      createdAt: visualization.createdAt,
      completedAt: visualization.completedAt,
      resultImageUrl,
      tile,
      latestAttempt: latestJob ? { attemptNumber: latestJob.attemptNumber, status: latestJob.status } : null,
    },
  });
});
