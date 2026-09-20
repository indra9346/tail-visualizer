import sharp from "sharp";
import { aiConfig } from "./config.js";
import { ImageValidationError } from "./errors.js";
import type { ImageInput } from "./types.js";

// Serverless functions are short-lived and memory-limited; libvips' operation
// cache only helps long-running processes.
sharp.cache(false);

export interface PrepareImageOptions {
  /** Longest side, in pixels, of the copy sent to the model. Never enlarges. */
  maxDimension: number;
  /** Short label for internal error messages only, e.g. "room image". */
  label: string;
}

/**
 * Produces the copy of an image that is actually sent to Gemini.
 *
 * ORIGINAL IS NEVER TOUCHED: this returns a NEW in-memory buffer. The
 * stored upload in Supabase Storage stays byte-identical to what the
 * upload endpoint received; only this transient model copy is resized,
 * so a 5 MB phone photo doesn't turn into a 25+ second Gemini call.
 *
 * Call it AFTER validateRoomImage()/validateTileImage() (signature and
 * size checks) — this function is an optimisation and a second decode
 * check, not a replacement for that validation.
 *
 * - `.rotate()` with no argument applies the EXIF orientation to the
 *   pixels, so the model sees the photo the way the user does.
 * - `fit: "inside"` + `withoutEnlargement` keeps aspect ratio and never
 *   upscales small images.
 * - Output is always sRGB JPEG (alpha flattened onto white).
 * - Metadata (EXIF incl. GPS location, XMP, IPTC, embedded thumbnails) is
 *   dropped: sharp only keeps metadata when `.withMetadata()` is called,
 *   and we never call it. The model doesn't need it and it can be private.
 * - `limitInputPixels` refuses decompression bombs (tiny file, enormous
 *   pixel grid) before any pixel buffer is allocated.
 * - Any decode/resize failure becomes a clean AI_INVALID_IMAGE (HTTP 400);
 *   we deliberately do NOT fall back to sending the raw original.
 */
export async function prepareImageForModel(image: ImageInput, opts: PrepareImageOptions): Promise<ImageInput> {
  try {
    const buffer = await sharp(image.buffer, {
      limitInputPixels: aiConfig.image.maxInputPixels,
      failOn: "error",
    })
      .rotate()
      .resize({ width: opts.maxDimension, height: opts.maxDimension, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .jpeg({ quality: aiConfig.image.modelJpegQuality, mozjpeg: true })
      .toBuffer();

    return { buffer, mimeType: "image/jpeg" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ImageValidationError("AI_INVALID_IMAGE", `${opts.label}: could not decode/resize image for the model (${reason})`);
  }
}
