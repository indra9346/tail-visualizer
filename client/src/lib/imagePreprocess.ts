import {
  RESIZE_ATTEMPTS,
  canUploadOriginal,
  computeTargetSize,
  fitsRequestBudget,
  jpegFileName,
} from "./imageSizing";

/**
 * Browser-side downscale of a room photo before it is base64-encoded and
 * POSTed (see imageSizing.ts for the Vercel 4.5 MB request-body rationale).
 *
 * PRODUCT NOTE — stored image: when resizing is needed, the copy uploaded
 * (and therefore STORED in the private room-images bucket) is this
 * resized JPEG, not the full-resolution original. Photos that already fit
 * (JPEG, <= 2048 px, small enough) are sent unchanged.
 *
 * This is a convenience/size optimisation, NOT a security boundary. The
 * server still independently validates the received bytes (file signature,
 * size, decodability) and never trusts anything the browser claims.
 *
 * Orientation: `createImageBitmap(..., { imageOrientation: "from-image" })`
 * (and <img> decoding in the fallback path) applies the EXIF orientation,
 * so the re-encoded pixels are upright. Re-encoding through a canvas also
 * drops EXIF metadata (including GPS location) from the uploaded copy.
 */

export type ImagePreprocessFailure = "decode_failed" | "too_large" | "encode_failed";

export class ImagePreprocessError extends Error {
  readonly reason: ImagePreprocessFailure;

  constructor(reason: ImagePreprocessFailure, message: string) {
    super(message);
    this.name = "ImagePreprocessError";
    this.reason = reason;
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to the <img> path (older browsers / unsupported option)
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImagePreprocessError("decode_failed", "We couldn't read this image. Please try a different JPEG, PNG or WebP photo.");
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new ImagePreprocessError("encode_failed", "We couldn't prepare this image for upload. Please try another photo.")),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Returns a File that is safe to base64-upload under Vercel's body limit.
 * Throws ImagePreprocessError (with a user-facing message) on failure; it
 * never silently returns something that would still be rejected.
 */
export async function preprocessRoomImage(file: File): Promise<File> {
  const decoded = await decode(file);
  try {
    if (canUploadOriginal({ mimeType: file.type, width: decoded.width, height: decoded.height, bytes: file.size })) {
      return file; // already small enough: upload byte-for-byte unchanged
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImagePreprocessError("encode_failed", "Your browser can't prepare this image for upload.");

    for (const attempt of RESIZE_ATTEMPTS) {
      const size = computeTargetSize(decoded.width, decoded.height, attempt.maxDimension);
      canvas.width = size.width;
      canvas.height = size.height;
      // JPEG has no alpha: paint white first so transparent PNG/WebP areas don't turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(decoded.source, 0, 0, size.width, size.height);

      const blob = await canvasToJpeg(canvas, attempt.quality);
      if (fitsRequestBudget(blob.size)) {
        return new File([blob], jpegFileName(file.name), { type: "image/jpeg", lastModified: Date.now() });
      }
    }

    throw new ImagePreprocessError(
      "too_large",
      "This photo is too detailed to upload even after shrinking it. Please try a smaller or simpler photo.",
    );
  } finally {
    decoded.release();
  }
}
