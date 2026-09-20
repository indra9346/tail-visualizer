import sharp from "sharp";
import type { ImageInput } from "../server/ai/types";

// analyzeRoom now decodes/resizes a model copy with sharp, so the fixture must be a REAL image.
let image: ImageInput;
beforeAll(async () => {
  const buffer = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 120, g: 110, b: 100 } } }).jpeg().toBuffer();
  image = { buffer, mimeType: "image/jpeg" };
});

let generateContentImpl: () => Promise<{ text: string }> = async () => ({ text: "{}" });

jest.mock("../server/ai/geminiClient", () => ({
  getGeminiClient: () => ({
    models: {
      generateContent: () => generateContentImpl(),
    },
  }),
  classifyGeminiError: (err: unknown) => (String(err).includes("429") ? "rate_limited" : "upstream"),
}));

import { analyzeRoom } from "../server/ai/analyzeRoom";
import { RoomAnalysisValidationError, GeminiEmptyResponseError, GeminiUpstreamError } from "../server/ai/errors";

const validResponse = JSON.stringify({
  roomType: "bathroom",
  confidence: 0.9,
  constructionState: "unfinished",
  surfaces: {
    floor: { visible: true, currentMaterial: "concrete", conditionNotes: null },
    walls: { visible: true, currentMaterial: "plaster", conditionNotes: null },
  },
  recommendedApplication: ["floor"],
  architecturalElements: { doors: 1, windows: 1, fixtures: ["sink"] },
  lighting: "natural",
  perspective: "straight_on",
  warnings: [],
});

describe("analyzeRoom — Gemini failure handling", () => {
  test("malformed JSON on both attempts fails safely without exposing internals", async () => {
    generateContentImpl = async () => ({ text: "this is not json at all" });

    await expect(analyzeRoom({ roomUploadId: "room-1", image })).rejects.toBeInstanceOf(RoomAnalysisValidationError);

    try {
      await analyzeRoom({ roomUploadId: "room-1", image });
      throw new Error("expected analyzeRoom to reject");
    } catch (err) {
      const e = err as RoomAnalysisValidationError;
      expect(e.code).toBe("AI_MALFORMED_STRUCTURED_OUTPUT");
      expect(e.safeMessage).not.toMatch(/json|parse|schema/i); // safe message must not leak parsing internals
    }
  });

  test("malformed output on the first attempt but valid on the corrective retry succeeds", async () => {
    let callCount = 0;
    generateContentImpl = async () => {
      callCount++;
      return { text: callCount === 1 ? "not json" : validResponse };
    };

    const result = await analyzeRoom({ roomUploadId: "room-1", image });
    expect(result.roomType).toBe("bathroom");
    expect(callCount).toBe(2);
  });

  test("an empty response is treated as a non-retryable failure (likely a safety block), not retried", async () => {
    let callCount = 0;
    generateContentImpl = async () => {
      callCount++;
      return { text: "" };
    };

    await expect(analyzeRoom({ roomUploadId: "room-1", image })).rejects.toBeInstanceOf(GeminiEmptyResponseError);
    expect(callCount).toBe(1); // by design: analyzeRoom only retries malformed *structured output*, not transient/empty responses
  });

  test("an upstream Gemini failure on the first attempt is not retried (matches the documented Phase 1 policy)", async () => {
    let callCount = 0;
    generateContentImpl = async () => {
      callCount++;
      throw new Error("upstream 500 from Gemini");
    };

    await expect(analyzeRoom({ roomUploadId: "room-1", image })).rejects.toBeInstanceOf(GeminiUpstreamError);
    expect(callCount).toBe(1);
  });

  test("never persists a corrupted/partial analysis when validation ultimately fails", async () => {
    generateContentImpl = async () => ({ text: JSON.stringify({ roomType: "bathroom" /* missing every other required field */ }) });

    await expect(analyzeRoom({ roomUploadId: "room-1", image })).rejects.toBeInstanceOf(RoomAnalysisValidationError);
  });
});
