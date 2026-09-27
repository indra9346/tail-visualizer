import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { ANALYSIS_SURFACES } from "../types.js";

/**
 * Schema for the RAW ranking JSON Gemini returns. Note `tileId` is only
 * validated as a non-empty string here — the mandatory check that it
 * corresponds to a real supplied candidate happens afterward in
 * recommendTiles.ts, against the exact candidate list sent in the prompt.
 * This schema alone must never be treated as proof of a valid tile.
 */
export const geminiTileRecommendationResponseSchema = z
  .object({
    recommendations: z
      .array(
        z
          .object({
            tileId: z.string().min(1),
            surface: z.enum(ANALYSIS_SURFACES),
            rank: z.number().int().min(1),
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export type GeminiTileRecommendationResponse = z.infer<typeof geminiTileRecommendationResponseSchema>;

export const geminiTileRecommendationJsonSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tileId: { type: Type.STRING },
          surface: { type: Type.STRING, enum: ANALYSIS_SURFACES as unknown as string[] },
          rank: { type: Type.INTEGER },
          reason: { type: Type.STRING },
        },
        required: ["tileId", "surface", "rank", "reason"],
      },
    },
  },
  required: ["recommendations"],
};
