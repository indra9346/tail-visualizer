import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, tilesRecommendQuerySchema } from "../../server/lib/validation.js";
import { checkRateLimit, RateLimits } from "../../server/lib/rateLimit.js";
import { verifyRoomOwnership } from "../../server/db/rooms.js";
import { getAnalysisByRoomUploadId } from "../../server/db/analyses.js";
import { getCandidateTilesForSurfaces } from "../../server/db/tiles.js";
import { hasRecommendations, getRecommendationsWithTiles, insertRecommendations } from "../../server/db/recommendations.js";
import { recommendTiles } from "../../server/ai/recommendTiles.js";
import { Errors } from "../../server/lib/apiError.js";

/**
 * Explicit function duration (Vercel, Fluid compute). Sized for the
 * worst case: model call(s) bounded by the timeouts in server/ai/config.ts
 * (a single bounded retry => at most ~2x the per-call timeout) plus
 * storage transfer and image resizing. Must stay >= that worst case.
 */
export const config = { maxDuration: 120 };

/**
 * CRITICAL: does NOT call analyzeRoom(). If no analysis exists yet, this
 * fails explicitly (409 ANALYSIS_REQUIRED) rather than silently
 * triggering one — the workflow stays explicit and analysis stays a
 * reusable, single-computed artifact.
 *
 * Also avoids redundant Gemini calls: if recommendations already exist
 * for this room's analysis, they are returned directly.
 */
export default createHandler({ methods: ["GET"], operation: "recommendTilesEndpoint" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const { roomUploadId } = parseOrThrow(tilesRecommendQuerySchema, req.query);

  const room = await verifyRoomOwnership(roomUploadId, user.id);
  const analysis = await getAnalysisByRoomUploadId(room.id);

  if (!analysis) {
    throw Errors.analysisRequired();
  }

  const alreadyComputed = await hasRecommendations(analysis.id);
  if (alreadyComputed) {
    const existing = await getRecommendationsWithTiles(analysis.id);
    res.status(200).json({ recommendations: existing, reused: true });
    return;
  }

  checkRateLimit(`tileRecommend:${user.id}`, RateLimits.tileRecommend.limit, RateLimits.tileRecommend.windowMs);

  const candidateTiles = await getCandidateTilesForSurfaces(analysis.recommendedSurfaces);
  const recommendations = await recommendTiles(analysis, candidateTiles);

  await insertRecommendations(analysis.id, recommendations);
  const withTiles = await getRecommendationsWithTiles(analysis.id);

  res.status(201).json({ recommendations: withTiles, reused: false });
});
