/**
 * Pure (DOM-free) sizing rules for room-photo preprocessing. Kept separate
 * from imagePreprocess.ts so they can be unit-tested in Node.
 *
 * WHY THIS EXISTS: the upload endpoint takes the photo as base64 inside a
 * JSON body, and Vercel Functions reject any request body over 4.5 MB
 * (HTTP 413 FUNCTION_PAYLOAD_TOO_LARGE). Base64 inflates bytes by ~33%, so
 * a raw file over ~3.3 MB can never arrive. Phone photos are routinely
 * 3-8 MB, so the browser downsizes them before upload.
 *
 * IMPORTANT (product behaviour): the room image that gets STORED is the
 * browser-resized copy whenever resizing was needed — the full-resolution
 * original never leaves the user's device in that case. Photos that
 * already fit are uploaded byte-for-byte unchanged.
 */

/** Vercel Functions request-body limit. */
export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

/** Longest side of the uploaded copy, in pixels. */
export const UPLOAD_MAX_DIMENSION = 2048;

/** JPEG quality for the first resize attempt (0-1). */
export const UPLOAD_JPEG_QUALITY = 0.85;

/** JSON envelope (projectId, fileName, mimeType, keys) + headroom for multi-byte file names. */
export const REQUEST_OVERHEAD_BYTES = 8 * 1024;

/** Base64 length (with padding) for `bytes` raw bytes. */
export function base64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

/** Estimated size of the JSON request body for an image of `imageBytes` raw bytes. */
export function estimateRequestBytes(imageBytes: number): number {
  return base64Length(imageBytes) + REQUEST_OVERHEAD_BYTES;
}

/**
 * Target: stay under 90% of Vercel's limit so proxies/headers/encoding
 * surprises can't push a request over. Works out to ~3.0 MB of raw image.
 */
export const MAX_REQUEST_BYTES = Math.floor(VERCEL_BODY_LIMIT_BYTES * 0.9);

export function fitsRequestBudget(imageBytes: number): boolean {
  return estimateRequestBytes(imageBytes) <= MAX_REQUEST_BYTES;
}

/** Largest raw image size that fits the request budget. */
export const MAX_UPLOAD_IMAGE_BYTES = Math.floor(((MAX_REQUEST_BYTES - REQUEST_OVERHEAD_BYTES) / 4) * 3);

export interface TargetSize {
  width: number;
  height: number;
  /** True when the image had to be scaled down. */
  scaled: boolean;
}

/** Fit (width x height) inside a maxDimension square: keeps aspect ratio, never enlarges. */
export function computeTargetSize(width: number, height: number, maxDimension: number): TargetSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Image dimensions must be positive numbers.");
  }
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width: Math.round(width), height: Math.round(height), scaled: false };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

export interface ResizeAttempt {
  maxDimension: number;
  quality: number;
}

/**
 * Ordered, bounded fallbacks: first the standard 2048 px / 0.85 target, then
 * progressively smaller/lower-quality copies ONLY if the result is still
 * over the request budget (e.g. very detailed, noisy photos).
 */
export const RESIZE_ATTEMPTS: readonly ResizeAttempt[] = [
  { maxDimension: UPLOAD_MAX_DIMENSION, quality: UPLOAD_JPEG_QUALITY },
  { maxDimension: UPLOAD_MAX_DIMENSION, quality: 0.75 },
  { maxDimension: 1600, quality: 0.75 },
  { maxDimension: 1600, quality: 0.65 },
  { maxDimension: 1280, quality: 0.6 },
];

/**
 * True if the original file can be uploaded exactly as-is: a JPEG that is
 * already within the pixel cap and within the request budget.
 */
export function canUploadOriginal(input: { mimeType: string; width: number; height: number; bytes: number }): boolean {
  return (
    input.mimeType === "image/jpeg" &&
    Math.max(input.width, input.height) <= UPLOAD_MAX_DIMENSION &&
    fitsRequestBudget(input.bytes)
  );
}

/** "IMG_1234.HEIC.png" -> "IMG_1234.HEIC.jpg" ; anything without a usable name -> "room.jpg". */
export function jpegFileName(original: string): string {
  const base = original.replace(/\.[^./\\]+$/, "").trim();
  return `${base || "room"}.jpg`;
}
