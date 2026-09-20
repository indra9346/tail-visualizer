import { z } from "zod";
import { ROOM_TYPES, SURFACE_TYPES, TILE_CATEGORIES } from "../ai/types.js";
import { aiConfig } from "../ai/config.js";
import { Errors } from "./apiError.js";

// Base64 text is ~4/3 the size of the decoded bytes; add generous margin
// (encoding overhead + headroom) so legitimate uploads at the real limit
// never fail here. This exists so an oversized payload is rejected by
// schema validation BEFORE Buffer.from() decodes the whole thing into
// memory, rather than relying solely on the post-decode byte-length check
// (server/ai/imageValidation.ts) or Vercel's platform-level body limit.
const MAX_BASE64_IMAGE_CHARS = Math.ceil((aiConfig.image.maxRoomImageBytes * 4) / 3) + 10_000;

export const uuidSchema = z.string().uuid();

export const createProjectBodySchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required.").max(200, "Project name is too long."),
  })
  .strict();

export const roomUploadBodySchema = z
  .object({
    projectId: uuidSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    // Base64-encoded image bytes. See api/rooms/upload.ts for the documented
    // MVP rationale (JSON+base64 instead of multipart) and its limits.
    base64Data: z.string().min(1).max(MAX_BASE64_IMAGE_CHARS, "Image payload is too large."),
  })
  .strict();

export const tilesSearchQuerySchema = z.object({
  category: z.enum(TILE_CATEGORIES).optional(),
  roomType: z.enum(ROOM_TYPES).optional(),
  colorFamily: z.string().trim().max(100).optional(),
  material: z.string().trim().max(100).optional(),
  finish: z.string().trim().max(100).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const tilesRecommendQuerySchema = z.object({
  roomUploadId: uuidSchema,
});

export const generateVisualizationBodySchema = z
  .object({
    roomUploadId: uuidSchema,
    tileId: uuidSchema,
    surfaces: z.array(z.enum(SURFACE_TYPES)).min(1).max(2),
    /** Optional: retry an existing visualization instead of creating a new one. */
    visualizationId: uuidSchema.optional(),
  })
  .strict();

/**
 * Parses and validates, throwing a safe 400 ApiError (not a raw ZodError)
 * on failure so route handlers never need their own try/catch for this.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");
    throw Errors.validation(message);
  }
  return result.data;
}
