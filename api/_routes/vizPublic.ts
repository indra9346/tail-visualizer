import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { listAllVisualizations } from "../../server/db/visualizations.js";
import { getTileById } from "../../server/db/tiles.js";
import { createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS } from "../../server/storage/buckets.js";

/**
 * Public "My Visualizations" gallery: every visualization ever generated,
 * across every account, newest first — no authentication required. This is
 * an explicit product decision (a public trust-building showcase), not an
 * oversight: never add per-user filtering here without also updating the
 * frontend copy that currently advertises this as a public view.
 */
export default createHandler({ methods: ["GET"], operation: "listPublicVisualizations" }, async (_req: VercelRequest, res: VercelResponse) => {
  const rows = await listAllVisualizations();

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
