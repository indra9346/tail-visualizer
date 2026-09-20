import { aiConfig } from "./config.js";
import { classifyGeminiError, getGeminiClient } from "./geminiClient.js";
import { GeminiEmptyResponseError, GeminiRateLimitError, GeminiUpstreamError, VisualizationGenerationError } from "./errors.js";
import { aiLogger } from "./logger.js";
import { buildVisualizationPrompt } from "./prompts/visualizationPrompt.js";
import { withTimeout } from "./timeout.js";
import { validateRoomImage, validateTileImage } from "./imageValidation.js";
import { prepareImageForModel } from "./prepareImageForModel.js";
import type { GenerateVisualizationInput, GeneratedVisualizationResult } from "./types.js";

interface InlineImagePart {
  inlineData?: { mimeType?: string; data?: string };
}

function extractGeneratedImage(response: {
  candidates?: Array<{ content?: { parts?: InlineImagePart[] }; finishReason?: string }>;
}): { buffer: Buffer; mimeType: string; finishReason: string | null } | null {
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData.mimeType) {
      return {
        buffer: Buffer.from(part.inlineData.data, "base64"),
        mimeType: part.inlineData.mimeType,
        finishReason: candidate?.finishReason ?? null,
      };
    }
  }
  return null;
}

async function attemptGeneration(input: GenerateVisualizationInput): Promise<GeneratedVisualizationResult> {
  const client = getGeminiClient();
  const model = aiConfig.models.visualization;
  const promptText = buildVisualizationPrompt(input.roomAnalysis, input.tile, input.surfaces);
  const start = Date.now();

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
              { inlineData: { mimeType: input.roomImage.mimeType, data: input.roomImage.buffer.toString("base64") } },
              { inlineData: { mimeType: input.tileImage.mimeType, data: input.tileImage.buffer.toString("base64") } },
            ],
          },
        ],
        config: {
          responseModalities: ["IMAGE"],
        },
      }),
      aiConfig.timeoutsMs.visualization,
      "generateVisualization",
    );
  } catch (err) {
    if (err instanceof Error && err.name === "GeminiTimeoutError") throw err;
    const category = classifyGeminiError(err);
    throw category === "rate_limited"
      ? new GeminiRateLimitError("generateVisualization", err)
      : new GeminiUpstreamError("generateVisualization", err);
  }

  const extracted = extractGeneratedImage(response as Parameters<typeof extractGeneratedImage>[0]);
  if (!extracted) {
    throw new GeminiEmptyResponseError("generateVisualization");
  }

  return {
    imageBuffer: extracted.buffer,
    mimeType: extracted.mimeType,
    model,
    finishReason: extracted.finishReason,
    durationMs: Date.now() - start,
  };
}

/**
 * Generates a finished-room visualization from an existing room upload +
 * its already-computed RoomAnalysis + a real selected tile's image.
 *
 * Does NOT re-run room analysis. Does NOT touch Supabase — the caller
 * (API route / DB service, next phase) is responsible for uploading
 * `imageBuffer` to Storage and updating the visualization/generation_job
 * rows. `context` identifiers are for logging/correlation only and are
 * never used here to make authorization decisions — the caller must have
 * already verified ownership before invoking this function.
 */
export async function generateVisualization(rawInput: GenerateVisualizationInput): Promise<GeneratedVisualizationResult> {
  validateRoomImage(rawInput.roomImage);
  validateTileImage(rawInput.tileImage);

  // Model-input copies only (resized, metadata stripped). The stored room and
  // tile files are never modified; `rawInput` buffers stay untouched.
  const maxDimension = aiConfig.image.generationMaxDimension;
  const [roomImage, tileImage] = await Promise.all([
    prepareImageForModel(rawInput.roomImage, { maxDimension, label: "room image" }),
    prepareImageForModel(rawInput.tileImage, { maxDimension, label: "tile image" }),
  ]);
  const input: GenerateVisualizationInput = { ...rawInput, roomImage, tileImage };

  const { roomUploadId, visualizationId, generationJobId } = input.context;

  try {
    const result = await attemptGeneration(input);
    aiLogger.info("visualization generation succeeded", {
      operation: "generateVisualization",
      model: result.model,
      roomUploadId,
      visualizationId,
      generationJobId,
      durationMs: result.durationMs,
      success: true,
      attempt: 1,
    });
    return result;
  } catch (err) {
    const retryable = err instanceof Error && "retryable" in err ? Boolean((err as { retryable?: boolean }).retryable) : false;

    aiLogger.warn("visualization generation attempt failed", {
      operation: "generateVisualization",
      model: aiConfig.models.visualization,
      roomUploadId,
      visualizationId,
      generationJobId,
      errorCategory: err instanceof Error ? err.name : "unknown",
      attempt: 1,
      success: false,
    });

    if (!retryable) {
      throw err;
    }

    // Single retry, only for transient failures (timeout/rate-limit/upstream).
    // Never retried for empty-response (likely safety block) or validation-shaped errors.
    try {
      const retryResult = await attemptGeneration(input);
      aiLogger.info("visualization generation succeeded on retry", {
        operation: "generateVisualization",
        model: retryResult.model,
        roomUploadId,
        visualizationId,
        generationJobId,
        durationMs: retryResult.durationMs,
        success: true,
        attempt: 2,
      });
      return retryResult;
    } catch (retryErr) {
      aiLogger.error("visualization generation failed after retry", {
        operation: "generateVisualization",
        model: aiConfig.models.visualization,
        roomUploadId,
        visualizationId,
        generationJobId,
        errorCategory: retryErr instanceof Error ? retryErr.name : "unknown",
        attempt: 2,
        success: false,
      });
      if (retryErr instanceof VisualizationGenerationError || retryErr instanceof GeminiEmptyResponseError) {
        throw retryErr;
      }
      throw new VisualizationGenerationError(
        "Visualization generation failed after one retry",
        false,
        retryErr,
      );
    }
  }
}
