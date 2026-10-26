import { createHash } from "node:crypto";
import { aiConfig } from "./config.js";
import { classifyGeminiError, getGeminiClient } from "./geminiClient.js";
import { GeminiEmptyResponseError, GeminiRateLimitError, GeminiUpstreamError, VisualizationGenerationError } from "./errors.js";
import { aiLogger } from "./logger.js";
import { buildDesignPrompt, distinctTileIds } from "./prompts/visualizationPrompt.js";
import { withTimeout } from "./timeout.js";
import { validateRoomImage, validateTileImage } from "./imageValidation.js";
import { prepareImageForModel } from "./prepareImageForModel.js";
import { buildGuideImage } from "./guideImage.js";
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

/**
 * The same room + design (+ attempt) always gets the same fence and the same seed, so generating it again gives the
 * same picture instead of a very different one. The fence stays safe when predictable: buildDesignPrompt removes it
 * from the customer's text, so that text can never imitate it.
 */
export function generationKey(input: Pick<GenerateVisualizationInput, "areas" | "requirements" | "layout" | "roomType" | "context">): { boundary: string; seed: number } {
  const design = JSON.stringify({
    room: input.context.roomUploadId,
    layout: input.layout ?? "open",
    roomType: input.roomType ?? null,
    requirements: input.requirements ?? null,
    areas: input.areas.map((a) => [a.surface, a.location, a.wall ?? null, a.pattern, a.patternNote ?? null, a.dimensions ?? null, a.tiles.map((t) => t.id), ...(a.mask ? [a.mask] : [])]),
  });
  const digest = createHash("sha256").update(design).digest();
  const seedDigest = createHash("sha256").update(`${design}|attempt:${input.context.attemptNumber ?? 1}`).digest();
  return { boundary: `REQ-${digest.subarray(0, 8).toString("hex")}`, seed: seedDigest.readUInt32BE(0) & 0x7fffffff };
}

async function attemptGeneration(input: GenerateVisualizationInput, guideImage: GenerateVisualizationInput["roomImage"] | null): Promise<GeneratedVisualizationResult> {
  const client = getGeminiClient();
  const model = aiConfig.models.visualization;
  // The prompt letters tiles in first-use order; attach the reference photos in that same order.
  const orderedImages = distinctTileIds(input.areas).map((id) => input.tileImages.find((t) => t.tileId === id)!.image);
  const { boundary, seed } = generationKey(input);
  const promptText = buildDesignPrompt(input.roomAnalysis, input.areas, input.requirements, boundary, input.roomType, input.layout ?? "open", guideImage !== null);
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
              // The painted map of the marked areas comes right after the photo: the prompt calls it image 2.
              ...(guideImage ? [{ inlineData: { mimeType: guideImage.mimeType, data: guideImage.buffer.toString("base64") } }] : []),
              ...orderedImages.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } })),
            ],
          },
        ],
        config: {
          responseModalities: ["IMAGE"],
          temperature: aiConfig.sampling.visualizationTemperature,
          seed,
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
  for (const t of rawInput.tileImages) validateTileImage(t.image);

  // Model-input copies only (resized, metadata stripped). The stored room and
  // tile files are never modified; `rawInput` buffers stay untouched.
  const maxDimension = aiConfig.image.generationMaxDimension;
  const [roomImage, ...preparedTiles] = await Promise.all([
    prepareImageForModel(rawInput.roomImage, { maxDimension, label: "room image" }),
    ...rawInput.tileImages.map((t) => prepareImageForModel(t.image, { maxDimension, label: "tile image" })),
  ]);
  const tileImages = rawInput.tileImages.map((t, i) => ({ tileId: t.tileId, image: preparedTiles[i]! }));
  const input: GenerateVisualizationInput = { ...rawInput, roomImage, tileImages };
  // Drawn on the same prepared copy of the photo, so the painting lines up with the source image pixel for pixel.
  const guideImage = await buildGuideImage(roomImage, input.areas);

  const { roomUploadId, visualizationId, generationJobId } = input.context;

  try {
    const result = await attemptGeneration(input, guideImage);
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
      const retryResult = await attemptGeneration(input, guideImage);
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
      // Preserve the actionable quota/configuration message after the bounded retry.
      if (retryErr instanceof GeminiRateLimitError || retryErr instanceof GeminiUpstreamError) {
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
