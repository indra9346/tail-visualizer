import { aiConfig } from "./config.js";
import { classifyGeminiError, getGeminiClient } from "./geminiClient.js";
import { GeminiRateLimitError, GeminiUpstreamError } from "./errors.js";
import { aiLogger } from "./logger.js";
import { buildTileRecommendationPrompt, buildTileRecommendationRetryPrompt } from "./prompts/tileRecommendationPrompt.js";
import {
  geminiTileRecommendationJsonSchema,
  geminiTileRecommendationResponseSchema,
  type GeminiTileRecommendationResponse,
} from "./schemas/tileRecommendationSchema.js";
import { withTimeout } from "./timeout.js";
import type { RoomAnalysis, SurfaceType, TileCandidate, TileRecommendation } from "./types.js";

/**
 * Step 1 (deterministic): narrow the full candidate list down to tiles
 * that are even eligible, BEFORE any AI call. This keeps the prompt small
 * and means the AI ranking step can never surface an inactive tile, a
 * tile of the wrong category, or a tile irrelevant to this room type
 * (unless the tile declares no room restriction).
 */
function deterministicFilter(roomAnalysis: RoomAnalysis, candidates: TileCandidate[]): Map<SurfaceType, TileCandidate[]> {
  const bySurface = new Map<SurfaceType, TileCandidate[]>();

  for (const surface of roomAnalysis.recommendedSurfaces) {
    const eligible = candidates.filter((tile) => {
      if (!tile.isActive) return false;
      const categoryOk = tile.category === surface || tile.category === "both";
      if (!categoryOk) return false;
      const roomOk = tile.suitableRooms.length === 0 || tile.suitableRooms.includes(roomAnalysis.roomType);
      return roomOk;
    });
    bySurface.set(surface, eligible);
  }

  return bySurface;
}

/**
 * Step 3 (deterministic, mandatory): the AI-recommended list is only ever
 * a ranking suggestion over a set WE already vetted. Any tileId that is
 * not in the exact candidate list handed to Gemini is dropped and logged
 * as a security-relevant anomaly, never persisted or surfaced.
 */
function validateAgainstCandidates(
  aiRecommendations: GeminiTileRecommendationResponse["recommendations"],
  candidateById: Map<string, TileCandidate>,
  roomUploadId: string,
): TileRecommendation[] {
  const valid: TileRecommendation[] = [];

  for (const rec of aiRecommendations) {
    const candidate = candidateById.get(rec.tileId);
    if (!candidate) {
      aiLogger.warn("AI returned a tileId not present in candidate set — discarded", {
        operation: "recommendTiles",
        roomUploadId,
        errorCategory: "invalid_tile_id",
        tileId: rec.tileId,
      });
      continue;
    }
    if (!candidate.isActive) {
      aiLogger.warn("AI recommended an inactive tile — discarded", {
        operation: "recommendTiles",
        roomUploadId,
        errorCategory: "inactive_tile",
        tileId: rec.tileId,
      });
      continue;
    }
    const categoryOk = candidate.category === rec.surface || candidate.category === "both";
    if (!categoryOk) {
      aiLogger.warn("AI recommended a tile incompatible with requested surface — discarded", {
        operation: "recommendTiles",
        roomUploadId,
        errorCategory: "category_mismatch",
        tileId: rec.tileId,
      });
      continue;
    }

    valid.push({ tileId: candidate.id, surface: rec.surface, rank: rec.rank, reason: rec.reason });
  }

  return valid;
}

/** Fallback used only if the AI ranking is unavailable/invalid after retry — never blocks the flow. */
function deterministicRanking(bySurface: Map<SurfaceType, TileCandidate[]>): TileRecommendation[] {
  const out: TileRecommendation[] = [];
  for (const [surface, tiles] of bySurface.entries()) {
    tiles.slice(0, aiConfig.recommendation.maxPerSurface).forEach((tile, idx) => {
      out.push({
        tileId: tile.id,
        surface,
        rank: idx + 1,
        reason: "Matched by category and room-type compatibility from the catalog.",
      });
    });
  }
  return out;
}

async function callAndValidate(
  roomAnalysis: RoomAnalysis,
  flatCandidates: TileCandidate[],
  promptText: string,
): Promise<{ ok: true; data: GeminiTileRecommendationResponse } | { ok: false; issues: string }> {
  const client = getGeminiClient();
  const model = aiConfig.models.tileRecommendation;

  let response;
  try {
    response = await withTimeout(
      client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: geminiTileRecommendationJsonSchema,
        },
      }),
      aiConfig.timeoutsMs.tileRecommendation,
      "recommendTiles",
    );
  } catch (err) {
    if (err instanceof Error && err.name === "GeminiTimeoutError") throw err;
    const category = classifyGeminiError(err);
    throw category === "rate_limited"
      ? new GeminiRateLimitError("recommendTiles", err)
      : new GeminiUpstreamError("recommendTiles", err);
  }

  const rawText = response.text;
  if (!rawText || rawText.trim().length === 0) {
    return { ok: false, issues: "empty response" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, issues: "response was not valid JSON" };
  }

  const result = geminiTileRecommendationResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }

  return { ok: true, data: result.data };
}

/**
 * Ranks real catalog tiles for the given room analysis. The AI never sees
 * (and therefore can never invent) any tile outside `candidateTiles`, and
 * every returned recommendation is re-validated against that same list
 * before being returned to the caller for persistence.
 */
export async function recommendTiles(roomAnalysis: RoomAnalysis, candidateTiles: TileCandidate[]): Promise<TileRecommendation[]> {
  const start = Date.now();
  const bySurface = deterministicFilter(roomAnalysis, candidateTiles);

  const flatCandidates = Array.from(new Map(Array.from(bySurface.values()).flat().map((t) => [t.id, t])).values());

  if (flatCandidates.length === 0) {
    aiLogger.info("no eligible candidate tiles after deterministic filter — skipping AI call", {
      operation: "recommendTiles",
      roomUploadId: roomAnalysis.roomUploadId,
      success: true,
      durationMs: Date.now() - start,
    });
    return [];
  }

  const candidateById = new Map(flatCandidates.map((t) => [t.id, t]));

  let aiResult: { ok: true; data: GeminiTileRecommendationResponse } | { ok: false; issues: string };
  try {
    aiResult = await callAndValidate(roomAnalysis, flatCandidates, buildTileRecommendationPrompt(roomAnalysis, flatCandidates));
  } catch (err) {
    aiLogger.error("tile recommendation AI call failed, falling back to deterministic ranking", {
      operation: "recommendTiles",
      roomUploadId: roomAnalysis.roomUploadId,
      errorCategory: err instanceof Error ? err.name : "unknown",
      success: false,
      durationMs: Date.now() - start,
    });
    return deterministicRanking(bySurface);
  }

  if (!aiResult.ok) {
    aiLogger.warn("tile recommendation structured output invalid, retrying", {
      operation: "recommendTiles",
      roomUploadId: roomAnalysis.roomUploadId,
      attempt: 1,
      errorCategory: "validation",
    });

    const retryPrompt = `${buildTileRecommendationPrompt(roomAnalysis, flatCandidates)}\n\n${buildTileRecommendationRetryPrompt(aiResult.issues)}`;
    let retryResult: { ok: true; data: GeminiTileRecommendationResponse } | { ok: false; issues: string };
    try {
      retryResult = await callAndValidate(roomAnalysis, flatCandidates, retryPrompt);
    } catch {
      retryResult = { ok: false, issues: "retry call failed" };
    }

    if (!retryResult.ok) {
      aiLogger.error("tile recommendation failed validation after retry, falling back to deterministic ranking", {
        operation: "recommendTiles",
        roomUploadId: roomAnalysis.roomUploadId,
        attempt: 2,
        errorCategory: "validation",
        success: false,
        durationMs: Date.now() - start,
      });
      return deterministicRanking(bySurface);
    }
    aiResult = retryResult;
  }

  const validated = validateAgainstCandidates(aiResult.data.recommendations, candidateById, roomAnalysis.roomUploadId);

  // Cap and re-sort per surface as a final safety/quality bound, in case
  // the model over-returned for one surface.
  const capped: TileRecommendation[] = [];
  for (const surface of roomAnalysis.recommendedSurfaces) {
    const forSurface = validated
      .filter((r) => r.surface === surface)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, aiConfig.recommendation.maxPerSurface)
      .map((r, idx) => ({ ...r, rank: idx + 1 }));
    capped.push(...forSurface);
  }

  aiLogger.info("tile recommendation succeeded", {
    operation: "recommendTiles",
    model: aiConfig.models.tileRecommendation,
    roomUploadId: roomAnalysis.roomUploadId,
    success: true,
    durationMs: Date.now() - start,
    resultCount: capped.length,
  });

  return capped;
}
