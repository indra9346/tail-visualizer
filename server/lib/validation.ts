import { z } from "zod";
import { ROOM_TYPES, SURFACE_TYPES, TILE_CATEGORIES, TILE_STOCK_STATUSES } from "../ai/types.js";
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

/** Maximum length of the customer's free-text requirements (characters, after sanitizing). */
export const MAX_REQUIREMENTS_CHARS = 1500;

/**
 * Requirements are free text typed by a user and later placed inside an AI
 * prompt, so they are treated as untrusted DATA: control characters are
 * stripped, whitespace is normalized, and the length is capped. (The prompt
 * builder additionally fences the text and states that it cannot change the
 * system rules.) An empty result means "no requirements".
 */
// Code-point ranges removed from user text: C0/C1 controls (keeping tab, LF, CR), line/paragraph
// separators, zero-width and bidi-override/isolate characters, and the BOM. Built from numbers so
// the source contains no invisible characters.
const STRIPPED_RANGES: Array<[number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const STRIPPED_CHARS = new RegExp(
  `[${STRIPPED_RANGES.map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join("")}]`,
  "g",
);

export function sanitizeRequirements(input: string): string {
  return input
    .replace(STRIPPED_CHARS, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const requirementsSchema = z
  .string()
  .max(MAX_REQUIREMENTS_CHARS * 2, "Requirements are too long.")
  .transform(sanitizeRequirements)
  .refine((v) => v.length <= MAX_REQUIREMENTS_CHARS, `Requirements must be at most ${MAX_REQUIREMENTS_CHARS} characters.`)
  .transform((v) => (v.length > 0 ? v : undefined));

export const generateVisualizationBodySchema = z
  .object({
    roomUploadId: uuidSchema,
    tileId: uuidSchema,
    surfaces: z.array(z.enum(SURFACE_TYPES)).min(1).max(2),
    /** Optional natural-language design instructions (untrusted text; see sanitizeRequirements). */
    requirements: requirementsSchema.optional(),
    /** What the showroom owner says the space is (defaults to the AI analysis). */
    roomType: z.enum(ROOM_TYPES).optional(),
    /** Optional: retry an existing visualization instead of creating a new one. */
    visualizationId: uuidSchema.optional(),
  })
  .strict();

/**
 * Parses and validates, throwing a safe 400 ApiError (not a raw ZodError)
 * on failure so route handlers never need their own try/catch for this.
 */
export function parseOrThrow<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`).join("; ");
    throw Errors.validation(message);
  }
  return result.data;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

export const createTileBodySchema = z
  .object({
    name: z.string().trim().min(1, "Tile name is required.").max(200),
    sku: z.string().trim().max(60).optional(),
    brand: optionalText(100),
    category: z.enum(TILE_CATEGORIES),
    material: optionalText(100),
    finish: optionalText(100),
    colorFamily: optionalText(100),
    sizeMm: optionalText(40),
    pricePerSqft: z
      .number()
      .min(0)
      .max(1_000_000)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    currency: z.string().trim().length(3).default("INR"),
    description: optionalText(1000),
    tileType: optionalText(100),
    pattern: optionalText(100),
    stockStatus: z.enum(TILE_STOCK_STATUSES).default("in_stock"),
    suitableRooms: z.array(z.enum(ROOM_TYPES)).max(ROOM_TYPES.length).default([]),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    base64Data: z
      .string()
      .min(1)
      .max(Math.ceil((aiConfig.image.maxTileImageBytes * 4) / 3) + 10_000, "Image payload is too large."),
  })
  .strict();

/** For PATCH-style edits: absent = unchanged, empty string = clear the field. */
const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length > 0 ? v : null))
    .optional();

const MAX_TILE_BASE64 = Math.ceil((aiConfig.image.maxTileImageBytes * 4) / 3) + 10_000;

/** Edit a tile the caller owns. Every field is optional; a new photo needs both mimeType and base64Data. */
export const updateTileBodySchema = z
  .object({
    tileId: uuidSchema,
    name: z.string().trim().min(1, "Tile name is required.").max(200).optional(),
    sku: z.string().trim().min(1).max(60).optional(),
    brand: patchText(100),
    category: z.enum(TILE_CATEGORIES).optional(),
    material: patchText(100),
    finish: patchText(100),
    colorFamily: patchText(100),
    sizeMm: patchText(40),
    description: patchText(1000),
    tileType: patchText(100),
    pattern: patchText(100),
    stockStatus: z.enum(TILE_STOCK_STATUSES).optional(),
    pricePerSqft: z.number().min(0).max(1_000_000).nullable().optional(),
    currency: z.string().trim().length(3).optional(),
    suitableRooms: z.array(z.enum(ROOM_TYPES)).max(ROOM_TYPES.length).optional(),
    isActive: z.boolean().optional(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
    base64Data: z.string().min(1).max(MAX_TILE_BASE64, "Image payload is too large.").optional(),
  })
  .strict()
  .refine((v) => (v.mimeType === undefined) === (v.base64Data === undefined), { message: "A new image needs both mimeType and base64Data." });

export const deleteTileQuerySchema = z.object({ tileId: uuidSchema });

export const setTileActiveBodySchema = z.object({ tileId: uuidSchema, isActive: z.boolean() }).strict();

// ---------- billing ----------

export const createCheckoutBodySchema = z.object({ packageId: z.string().trim().min(1).max(60) }).strict();

export const verifyCheckoutBodySchema = z
  .object({
    razorpay_order_id: z.string().trim().min(1).max(100),
    razorpay_payment_id: z.string().trim().min(1).max(100),
    razorpay_signature: z.string().trim().min(1).max(200),
  })
  .strict();
