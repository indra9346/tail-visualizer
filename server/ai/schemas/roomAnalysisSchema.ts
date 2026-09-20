import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { CONSTRUCTION_STATES, LIGHTING_TYPES, PERSPECTIVE_TYPES, ROOM_TYPES, SURFACE_TYPES } from "../types.js";

/**
 * Schema for the RAW JSON we ask Gemini to return. This intentionally
 * mirrors the nested conceptual shape from the product spec (surfaces.floor,
 * surfaces.walls, architecturalElements) because that is the easiest shape
 * to describe unambiguously to the model. `analyzeRoom.ts` flattens this
 * into the DB-shaped `RoomAnalysis` record.
 */
export const geminiRoomAnalysisResponseSchema = z
  .object({
    roomType: z.enum(ROOM_TYPES),
    confidence: z.number().min(0).max(1),
    constructionState: z.enum(CONSTRUCTION_STATES),
    surfaces: z.object({
      floor: z.object({
        visible: z.boolean(),
        currentMaterial: z.string().nullable(),
        conditionNotes: z.string().nullable(),
      }),
      walls: z.object({
        visible: z.boolean(),
        currentMaterial: z.string().nullable(),
        conditionNotes: z.string().nullable(),
      }),
    }),
    recommendedApplication: z.array(z.enum(SURFACE_TYPES)).max(2),
    architecturalElements: z.object({
      doors: z.number().int().min(0),
      windows: z.number().int().min(0),
      fixtures: z.array(z.string()).max(30),
    }),
    lighting: z.enum(LIGHTING_TYPES),
    perspective: z.enum(PERSPECTIVE_TYPES),
    warnings: z.array(z.string()).max(20),
  })
  .strict();

export type GeminiRoomAnalysisResponse = z.infer<typeof geminiRoomAnalysisResponseSchema>;

/**
 * JSON Schema equivalent handed to Gemini's `responseSchema` config so the
 * model is constrained at generation time, in addition to our own Zod
 * validation of whatever comes back.
 */
export const geminiRoomAnalysisJsonSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    roomType: { type: Type.STRING, enum: ROOM_TYPES as unknown as string[] },
    confidence: { type: Type.NUMBER },
    constructionState: { type: Type.STRING, enum: CONSTRUCTION_STATES as unknown as string[] },
    surfaces: {
      type: Type.OBJECT,
      properties: {
        floor: {
          type: Type.OBJECT,
          properties: {
            visible: { type: Type.BOOLEAN },
            currentMaterial: { type: Type.STRING, nullable: true },
            conditionNotes: { type: Type.STRING, nullable: true },
          },
          required: ["visible", "currentMaterial", "conditionNotes"],
        },
        walls: {
          type: Type.OBJECT,
          properties: {
            visible: { type: Type.BOOLEAN },
            currentMaterial: { type: Type.STRING, nullable: true },
            conditionNotes: { type: Type.STRING, nullable: true },
          },
          required: ["visible", "currentMaterial", "conditionNotes"],
        },
      },
      required: ["floor", "walls"],
    },
    recommendedApplication: {
      type: Type.ARRAY,
      items: { type: Type.STRING, enum: SURFACE_TYPES as unknown as string[] },
    },
    architecturalElements: {
      type: Type.OBJECT,
      properties: {
        doors: { type: Type.INTEGER },
        windows: { type: Type.INTEGER },
        fixtures: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["doors", "windows", "fixtures"],
    },
    lighting: { type: Type.STRING, enum: LIGHTING_TYPES as unknown as string[] },
    perspective: { type: Type.STRING, enum: PERSPECTIVE_TYPES as unknown as string[] },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "roomType",
    "confidence",
    "constructionState",
    "surfaces",
    "recommendedApplication",
    "architecturalElements",
    "lighting",
    "perspective",
    "warnings",
  ],
};
