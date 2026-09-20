import { aiConfig } from "./config.js";
import { ImageValidationError } from "./errors.js";
import type { ImageInput } from "./types.js";

/**
 * Sniffs the actual file signature instead of trusting a client-supplied
 * MIME type string, which can be spoofed trivially from the browser.
 */
function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  // WebP: "RIFF"....."WEBP"
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateImage(
  image: ImageInput,
  opts: { maxBytes: number; label: string },
): void {
  if (!image.buffer || image.buffer.length === 0) {
    throw new ImageValidationError("AI_INVALID_IMAGE", `${opts.label}: empty image buffer`);
  }

  if (image.buffer.length > opts.maxBytes) {
    throw new ImageValidationError(
      "AI_IMAGE_TOO_LARGE",
      `${opts.label}: image size ${image.buffer.length} bytes exceeds limit of ${opts.maxBytes} bytes`,
    );
  }

  const sniffed = sniffMimeType(image.buffer);
  if (!sniffed) {
    throw new ImageValidationError(
      "AI_UNSUPPORTED_IMAGE_FORMAT",
      `${opts.label}: could not detect a supported image format from file signature`,
    );
  }

  if (!(aiConfig.image.allowedMimeTypes as readonly string[]).includes(sniffed)) {
    throw new ImageValidationError(
      "AI_UNSUPPORTED_IMAGE_FORMAT",
      `${opts.label}: detected format ${sniffed} is not in the allowed list`,
    );
  }

  // The caller's declared mimeType is corrected to the sniffed value so
  // downstream code (Gemini inlineData.mimeType) never relies on a
  // client-provided string.
  image.mimeType = sniffed;
}

export function validateRoomImage(image: ImageInput): void {
  validateImage(image, { maxBytes: aiConfig.image.maxRoomImageBytes, label: "room image" });
}

export function validateTileImage(image: ImageInput): void {
  validateImage(image, { maxBytes: aiConfig.image.maxTileImageBytes, label: "tile image" });
}
