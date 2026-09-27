import {
  MAX_REQUEST_BYTES,
  MAX_UPLOAD_IMAGE_BYTES,
  RESIZE_ATTEMPTS,
  UPLOAD_JPEG_QUALITY,
  UPLOAD_MAX_DIMENSION,
  VERCEL_BODY_LIMIT_BYTES,
  base64Length,
  canUploadOriginal,
  computeTargetSize,
  estimateRequestBytes,
  fitsRequestBudget,
  jpegFileName,
} from "../client/src/lib/imageSizing";

describe("client upload sizing (Vercel 4.5 MB request-body limit)", () => {
  test("constants match the documented targets", () => {
    expect(UPLOAD_MAX_DIMENSION).toBe(2048);
    expect(UPLOAD_JPEG_QUALITY).toBe(0.85);
    expect(VERCEL_BODY_LIMIT_BYTES).toBe(4.5 * 1024 * 1024);
  });

  test("base64Length matches Buffer's real base64 length", () => {
    for (const n of [0, 1, 2, 3, 4, 100, 1000, 3_000_000, 3_000_001]) {
      expect(base64Length(n)).toBe(Buffer.alloc(n).toString("base64").length);
    }
  });

  test("the budget keeps the full request safely UNDER Vercel's 4.5 MB limit", () => {
    expect(MAX_REQUEST_BYTES).toBeLessThan(VERCEL_BODY_LIMIT_BYTES);
    expect(estimateRequestBytes(MAX_UPLOAD_IMAGE_BYTES)).toBeLessThanOrEqual(MAX_REQUEST_BYTES);
    expect(estimateRequestBytes(MAX_UPLOAD_IMAGE_BYTES + 4096)).toBeGreaterThan(MAX_REQUEST_BYTES);
    expect(MAX_UPLOAD_IMAGE_BYTES).toBeGreaterThan(2.9 * 1024 * 1024);
    expect(MAX_UPLOAD_IMAGE_BYTES).toBeLessThan(3.1 * 1024 * 1024);
  });

  test("the real failing case: a 4.74 MB photo would exceed 4.5 MB once base64-encoded", () => {
    const photo = 4_969_148; // test/fixtures/room.jpeg
    expect(estimateRequestBytes(photo)).toBeGreaterThan(VERCEL_BODY_LIMIT_BYTES);
    expect(fitsRequestBudget(photo)).toBe(false);
  });

  test("a typical resized 2048px JPEG (~1 MB) fits with lots of room", () => {
    expect(fitsRequestBudget(1_000_000)).toBe(true);
  });

  test("computeTargetSize: scales the longest side to the cap, keeps aspect ratio", () => {
    expect(computeTargetSize(4080, 1848, 2048)).toEqual({ width: 2048, height: 928, scaled: true });
    expect(computeTargetSize(1848, 4080, 2048)).toEqual({ width: 928, height: 2048, scaled: true });
    expect(computeTargetSize(4000, 4000, 2048)).toEqual({ width: 2048, height: 2048, scaled: true });
  });

  test("computeTargetSize: never enlarges", () => {
    expect(computeTargetSize(800, 600, 2048)).toEqual({ width: 800, height: 600, scaled: false });
    expect(computeTargetSize(2048, 1000, 2048).scaled).toBe(false);
  });

  test("computeTargetSize: extreme panorama never collapses to 0 px; bad input throws", () => {
    expect(computeTargetSize(20000, 10, 2048).height).toBeGreaterThanOrEqual(1);
    expect(() => computeTargetSize(0, 100, 2048)).toThrow(RangeError);
    expect(() => computeTargetSize(NaN, 100, 2048)).toThrow(RangeError);
  });

  test("fallback attempts start at the 2048/0.85 target and only ever get smaller (bounded)", () => {
    expect(RESIZE_ATTEMPTS[0]).toEqual({ maxDimension: 2048, quality: 0.85 });
    for (let i = 1; i < RESIZE_ATTEMPTS.length; i++) {
      const prev = RESIZE_ATTEMPTS[i - 1]!;
      const cur = RESIZE_ATTEMPTS[i]!;
      expect(cur.maxDimension).toBeLessThanOrEqual(prev.maxDimension);
      expect(cur.quality).toBeLessThanOrEqual(prev.quality);
    }
    expect(RESIZE_ATTEMPTS.length).toBeLessThanOrEqual(6);
  });

  test("canUploadOriginal: only small in-cap JPEGs are sent unchanged", () => {
    expect(canUploadOriginal({ mimeType: "image/jpeg", width: 1600, height: 900, bytes: 500_000 })).toBe(true);
    expect(canUploadOriginal({ mimeType: "image/jpeg", width: 4080, height: 1848, bytes: 500_000 })).toBe(false); // too many pixels
    expect(canUploadOriginal({ mimeType: "image/jpeg", width: 1600, height: 900, bytes: 4_000_000 })).toBe(false); // too many bytes
    expect(canUploadOriginal({ mimeType: "image/png", width: 800, height: 600, bytes: 100_000 })).toBe(false); // always re-encode non-JPEG
    expect(canUploadOriginal({ mimeType: "image/webp", width: 800, height: 600, bytes: 100_000 })).toBe(false);
  });

  test("jpegFileName swaps the extension safely", () => {
    expect(jpegFileName("IMG_1.PNG")).toBe("IMG_1.jpg");
    expect(jpegFileName("living room.final.webp")).toBe("living room.final.jpg");
    expect(jpegFileName("")).toBe("room.jpg");
    expect(jpegFileName(".png")).toBe("room.jpg");
    expect(jpegFileName("noext")).toBe("noext.jpg");
  });
});

describe("validateImageFileMeta (regression: browser-reported file.type is unreliable)", () => {
  const { validateImageFileMeta, MAX_SOURCE_IMAGE_BYTES } = require("../client/src/lib/imageSizing");

  test("accepts the three officially supported MIME types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateImageFileMeta({ type, size: 1000 })).toBeNull();
    }
  });

  test("regression: an EMPTY file.type (common on Windows for a real photo, e.g. synced from a phone) is accepted, not rejected", () => {
    // Before this fix, this exact case silently blocked real users from ever submitting a valid
    // photo, because file.type is set by the OS/browser from file associations and is frequently blank.
    expect(validateImageFileMeta({ type: "", size: 1000 })).toBeNull();
  });

  test("accepts any other image/* subtype (e.g. image/heic) — the real decision is the actual decode attempt, not this guess", () => {
    expect(validateImageFileMeta({ type: "image/heic", size: 1000 })).toBeNull();
  });

  test("rejects a file the browser confidently reports as a different, non-image type", () => {
    const err = validateImageFileMeta({ type: "application/pdf", size: 1000 });
    expect(err).not.toBeNull();
    expect(err.message).toMatch(/photo/i);
  });

  test("still enforces the size limit regardless of type/emptiness", () => {
    const err = validateImageFileMeta({ type: "", size: MAX_SOURCE_IMAGE_BYTES + 1 });
    expect(err).not.toBeNull();
    expect(err.message).toMatch(/too large/i);
  });

  test("exactly at the size limit is accepted; a custom limit is honoured", () => {
    expect(validateImageFileMeta({ type: "image/jpeg", size: MAX_SOURCE_IMAGE_BYTES })).toBeNull();
    expect(validateImageFileMeta({ type: "image/jpeg", size: 6 * 1024 * 1024 }, 5 * 1024 * 1024)).not.toBeNull();
  });
});
