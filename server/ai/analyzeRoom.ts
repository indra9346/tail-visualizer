import { aiConfig } from "./config.js";
import { classifyGeminiError, getGeminiClient } from "./geminiClient.js";
import { GeminiEmptyResponseError, GeminiRateLimitError, GeminiUpstreamError, RoomAnalysisValidationError } from "./errors.js";
import { aiLogger } from "./logger.js";
import { buildRoomAnalysisPrompt, buildRoomAnalysisRetryPrompt } from "./prompts/roomAnalysisPrompt.js";
import { geminiRoomAnalysisJsonSchema, geminiRoomAnalysisResponseSchema, type GeminiRoomAnalysisResponse } from "./schemas/roomAnalysisSchema.js";
import { withTimeout } from "./timeout.js";
import { validateRoomImage } from "./imageValidation.js";
import { prepareImageForModel } from "./prepareImageForModel.js";
import type { ImageInput, RoomAnalysis } from "./types.js";

interface AnalyzeRoomInput {
  roomUploadId: string;
  image: ImageInput;
}

/**
 * Calls Gemini once, parses + validates the JSON response.
 * Returns `{ ok: true, data }` or `{ ok: false, issues }` — never throws
 * for a malformed response, so the caller can decide whether to retry.
 */
async function callAndValidate(
  image: ImageInput,
  promptText: string,
): Promise<{ ok: true; data: GeminiRoomAnalysisResponse; rawText: string } | { ok: false; issues: string }> {
  const client = getGeminiClient();
  const model = aiConfig.models.roomAnalysis;

  let response;
  try {
    response = await withTimeout(
      client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              { inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: geminiRoomAnalysisJsonSchema,
        },
      }),
      aiConfig.timeoutsMs.roomAnalysis,
      "analyzeRoom",
    );
  } catch (err) {
    if (err instanceof Error && err.name === "GeminiTimeoutError") throw err;
    const category = classifyGeminiError(err);
    throw category === "rate_limited"
      ? new GeminiRateLimitError("analyzeRoom", err)
      : new GeminiUpstreamError("analyzeRoom", err);
  }

  const rawText = response.text;
  if (!rawText || rawText.trim().length === 0) {
    throw new GeminiEmptyResponseError("analyzeRoom");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, issues: "response was not valid JSON" };
  }

  const result = geminiRoomAnalysisResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, issues: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }

  return { ok: true, data: result.data, rawText };
}

function toRoomAnalysisRecord(
  roomUploadId: string,
  parsed: GeminiRoomAnalysisResponse,
  rawResponse: unknown,
): RoomAnalysis {
  return {
    roomUploadId,
    roomType: parsed.roomType,
    confidence: parsed.confidence,
    constructionState: parsed.constructionState,
    floorVisible: parsed.surfaces.floor.visible,
    floorCurrentMaterial: parsed.surfaces.floor.currentMaterial,
    floorConditionNotes: parsed.surfaces.floor.conditionNotes,
    wallVisible: parsed.surfaces.walls.visible,
    wallCurrentMaterial: parsed.surfaces.walls.currentMaterial,
    wallConditionNotes: parsed.surfaces.walls.conditionNotes,
    recommendedSurfaces: parsed.recommendedApplication,
    doorCount: parsed.architecturalElements.doors,
    windowCount: parsed.architecturalElements.windows,
    fixtures: parsed.architecturalElements.fixtures,
    lighting: parsed.lighting,
    perspective: parsed.perspective,
    warnings: parsed.warnings,
    rawAiResponse: rawResponse,
    analysisModel: aiConfig.models.roomAnalysis,
  };
}

/**
 * Analyzes a room photo and returns a validated, DB-shaped RoomAnalysis.
 *
 * This result is meant to be persisted once per room_upload and reused
 * for every subsequent tile recommendation/visualization — callers must
 * NOT call this again just because the user wants to try a different tile.
 */
export async function analyzeRoom(input: AnalyzeRoomInput): Promise<RoomAnalysis> {
  const start = Date.now();
  validateRoomImage(input.image);
  // Resized in-memory copy for the model only; the caller's buffer (and the stored upload) is untouched.
  const modelImage = await prepareImageForModel(input.image, {
    maxDimension: aiConfig.image.analysisMaxDimension,
    label: "room image",
  });

  const firstAttempt = await callAndValidate(modelImage, buildRoomAnalysisPrompt());

  if (firstAttempt.ok) {
    aiLogger.info("room analysis succeeded", {
      operation: "analyzeRoom",
      model: aiConfig.models.roomAnalysis,
      roomUploadId: input.roomUploadId,
      durationMs: Date.now() - start,
      success: true,
      attempt: 1,
    });
    return toRoomAnalysisRecord(input.roomUploadId, firstAttempt.data, JSON.parse(firstAttempt.rawText));
  }

  aiLogger.warn("room analysis structured output invalid, retrying", {
    operation: "analyzeRoom",
    model: aiConfig.models.roomAnalysis,
    roomUploadId: input.roomUploadId,
    attempt: 1,
    errorCategory: "validation",
  });

  const retryPrompt = `${buildRoomAnalysisPrompt()}\n\n${buildRoomAnalysisRetryPrompt(firstAttempt.issues)}`;
  const secondAttempt = await callAndValidate(modelImage, retryPrompt);

  if (secondAttempt.ok) {
    aiLogger.info("room analysis succeeded on retry", {
      operation: "analyzeRoom",
      model: aiConfig.models.roomAnalysis,
      roomUploadId: input.roomUploadId,
      durationMs: Date.now() - start,
      success: true,
      attempt: 2,
    });
    return toRoomAnalysisRecord(input.roomUploadId, secondAttempt.data, JSON.parse(secondAttempt.rawText));
  }

  aiLogger.error("room analysis failed validation after retry", {
    operation: "analyzeRoom",
    model: aiConfig.models.roomAnalysis,
    roomUploadId: input.roomUploadId,
    durationMs: Date.now() - start,
    success: false,
    attempt: 2,
    errorCategory: "validation",
  });

  throw new RoomAnalysisValidationError(secondAttempt.issues);
}
