import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, generateVisualizationBodySchema } from "../../server/lib/validation.js";
import { checkRateLimit, RateLimits } from "../../server/lib/rateLimit.js";
import { verifyRoomOwnership } from "../../server/db/rooms.js";
import { getAnalysisByRoomUploadId } from "../../server/db/analyses.js";
import { getTileById } from "../../server/db/tiles.js";
import {
  createVisualization,
  findInFlightVisualization,
  verifyVisualizationOwnership,
  updateVisualizationStatus,
  type VisualizationRow,
} from "../../server/db/visualizations.js";
import { createNextGenerationJob, markJobProcessing, markJobCompleted, markJobFailed } from "../../server/db/generationJobs.js";
import { downloadRoomImage, downloadTileImage, uploadImage, deleteImageQuietly, createSignedUrl } from "../../server/storage/imageStorage.js";
import { BUCKETS, generatedVisualizationPath } from "../../server/storage/buckets.js";
import { generateVisualization } from "../../server/ai/generateVisualization.js";
import { aiConfig } from "../../server/ai/config.js";
import { AiServiceError } from "../../server/ai/errors.js";
import { Errors } from "../../server/lib/apiError.js";
import { tileSupportsSurface, type SurfaceType } from "../../server/ai/types.js";
import { billingConfig } from "../../server/billing/config.js";
import { holdCreditsForGeneration, commitCreditHold, releaseCreditHold, releaseStaleHoldsQuietly } from "../../server/db/billing.js";

function surfacesMatch(a: SurfaceType[], b: SurfaceType[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/**
 * CRITICAL: uses the EXISTING room_analyses row only. Never calls
 * analyzeRoom(). If no analysis exists, fails explicitly rather than
 * triggering one implicitly.
 */
export default createHandler({ methods: ["POST"], operation: "generateVisualizationEndpoint" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  checkRateLimit(`visualizationGenerate:${user.id}`, RateLimits.visualizationGenerate.limit, RateLimits.visualizationGenerate.windowMs);

  const body = parseOrThrow(generateVisualizationBodySchema, req.body);

  const room = await verifyRoomOwnership(body.roomUploadId, user.id);

  const analysis = await getAnalysisByRoomUploadId(room.id);
  if (!analysis) {
    throw Errors.analysisRequired();
  }

  const tile = await getTileById(body.tileId);
  // A showroom may only visualize its own tiles; another owner's tile is reported as not found.
  if (!tile || tile.ownerId !== user.id) {
    throw Errors.tileNotFound();
  }
  if (!tile.isActive) {
    throw Errors.tileInactive();
  }
  for (const surface of body.surfaces) {
    if (!tileSupportsSurface(tile.category, surface)) {
      throw Errors.tileSurfaceIncompatible(surface);
    }
  }

  // Resolve which visualization row this request targets: an explicit
  // retry, an in-flight duplicate (idempotency), or a brand new one.
  let visualization: VisualizationRow;
  if (body.visualizationId) {
    visualization = await verifyVisualizationOwnership(body.visualizationId, user.id);
    if (
      visualization.roomUploadId !== room.id ||
      visualization.tileId !== tile.id ||
      !surfacesMatch(visualization.appliedSurfaces, body.surfaces)
    ) {
      throw Errors.validation("visualizationId does not match the provided roomUploadId/tileId/surfaces.");
    }
  } else {
    const inFlight = await findInFlightVisualization(room.id, tile.id, body.surfaces);
    visualization =
      inFlight ??
      (await createVisualization({ roomUploadId: room.id, userId: user.id, tileId: tile.id, surfaces: body.surfaces, requirements: body.requirements ?? null, roomType: body.roomType ?? analysis.roomType }));
  }

  // A retry may carry updated instructions; otherwise keep what was stored on the row.
  const requirements = body.requirements ?? visualization.requirements ?? null;
  if (requirements !== visualization.requirements) {
    await updateVisualizationStatus(visualization.id, { status: visualization.status, requirements });
  }

  // Best-effort: return any credits orphaned by a previous crashed/timed-out
  // request for this user before we reason about the current balance.
  await releaseStaleHoldsQuietly(user.id);

  // Left outside the try/catch below: if this throws (including
  // RETRY_LIMIT_EXCEEDED), no job row exists yet, so there is nothing to
  // mark failed.
  const job = await createNextGenerationJob(visualization.id);

  // Atomic, keyed by this job's id: a client retry with the same job can
  // never reserve credits twice (see credit_hold's idempotency key). If the
  // balance is too low, NOTHING is reserved and Gemini is never called.
  let hold;
  try {
    hold = await holdCreditsForGeneration(user.id, job.id, billingConfig.generationCreditCost);
  } catch (err) {
    const safeMessage = err instanceof Error ? err.message : "Insufficient credits.";
    await markJobFailed(job.id, safeMessage);
    await updateVisualizationStatus(visualization.id, { status: "failed", errorMessage: safeMessage });
    throw err;
  }

  try {
    await markJobProcessing(job.id, aiConfig.models.visualization);
    await updateVisualizationStatus(visualization.id, { status: "generating" });

    const [roomImage, tileImage] = await Promise.all([downloadRoomImage(room.storagePath, user.id), downloadTileImage(tile.storagePath)]);

    const result = await generateVisualization({
      roomImage,
      tileImage,
      roomAnalysis: analysis,
      tile,
      surfaces: body.surfaces,
      requirements,
      roomType: body.roomType ?? analysis.roomType,
      context: { roomUploadId: room.id, visualizationId: visualization.id, generationJobId: job.id },
    });

    const resultPath = generatedVisualizationPath(user.id, room.projectId, visualization.id, result.mimeType);
    await uploadImage(BUCKETS.generatedVisualizations, resultPath, result.imageBuffer, result.mimeType);

    try {
      await updateVisualizationStatus(visualization.id, {
        status: "completed",
        resultStoragePath: resultPath,
        completedAt: new Date().toISOString(),
        creditsCharged: billingConfig.generationCreditCost,
      });
    } catch (dbErr) {
      // Generated image is safely stored but the DB row didn't update — clean up the orphan.
      await deleteImageQuietly(BUCKETS.generatedVisualizations, resultPath);
      throw dbErr;
    }

    await markJobCompleted(job.id);

    // The image is generated, stored, and the visualization row is committed —
    // ONLY NOW does the reservation become a real charge, exactly once.
    await commitCreditHold(hold.transactionId);

    const signedUrl = await createSignedUrl(BUCKETS.generatedVisualizations, resultPath, user.id);

    res.status(200).json({
      visualization: {
        id: visualization.id,
        status: "completed",
        tileId: tile.id,
        surfaces: body.surfaces,
        resultImageUrl: signedUrl,
        attemptNumber: job.attemptNumber,
        creditsCharged: billingConfig.generationCreditCost,
      },
    });
  } catch (err) {
    const safeMessage = err instanceof AiServiceError ? err.safeMessage : "Visualization generation failed.";
    await markJobFailed(job.id, safeMessage);
    await updateVisualizationStatus(visualization.id, { status: "failed", errorMessage: safeMessage });
    // The reservation is returned — a failed generation never permanently consumes credits.
    await releaseCreditHold(hold.transactionId, safeMessage);
    throw err;
  }
});
