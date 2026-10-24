import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow } from "../../server/lib/validation.js";
import { listVisualizationsForUser } from "../../server/db/visualizations.js";
import { presentStatus } from "../../server/db/generationJobs.js";
import { getTileById } from "../../server/db/tiles.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

const historyQuerySchema = z.object({
  /** createdAt of the oldest design already shown: returns the page after it. */
  before: z.string().datetime({ offset: true }).optional(),
});

/** "My Visualizations": the caller's visualizations, newest first, one page at a time, with tile and a signed result URL. */
export default createHandler({ methods: ["GET"], operation: "listMyVisualizations" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const { before } = parseOrThrow(historyQuerySchema, { before: typeof req.query.before === "string" ? req.query.before : undefined });
  const { rows, hasMore } = await listVisualizationsForUser(user.id, 50, before);

  const withDetails = await Promise.all(
    rows.map(async (v) => {
      const shown = await presentStatus(v);
      return {
        id: v.id,
        roomUploadId: v.roomUploadId,
        status: shown.status,
        appliedSurfaces: v.appliedSurfaces,
        design: v.design ?? null,
        errorMessage: shown.errorMessage,
        requirements: v.requirements,
        roomType: v.roomType,
        creditsCharged: v.creditsCharged,
        isPublic: v.isPublic,
        createdAt: v.createdAt,
        completedAt: v.completedAt,
        resultImageUrl: v.resultStoragePath ? await createSignedUrl(BUCKETS.generatedVisualizations, v.resultStoragePath, user.id) : null,
        tile: await getTileById(v.tileId),
      };
    }),
  );

  res.status(200).json({ visualizations: withDetails, hasMore });
});
