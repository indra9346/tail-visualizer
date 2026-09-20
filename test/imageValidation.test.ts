import { validateRoomImage } from "../server/ai/imageValidation";
import { aiConfig } from "../server/ai/config";
import { ImageValidationError } from "../server/ai/errors";
import type { ImageInput } from "../server/ai/types";

function expectRejectedWith(image: ImageInput, code: ImageValidationError["code"]) {
  try {
    validateRoomImage(image);
    throw new Error("expected validateRoomImage to throw, but it did not");
  } catch (err) {
    expect(err).toBeInstanceOf(ImageValidationError);
    expect((err as ImageValidationError).code).toBe(code);
    // The safe, user-facing message must never leak the internal detail string.
    expect((err as ImageValidationError).safeMessage).toMatch(/could not be processed/i);
  }
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_HEADER = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "ascii")]);

function padded(header: Buffer, totalSize = 1024): Buffer {
  return Buffer.concat([header, Buffer.alloc(Math.max(0, totalSize - header.length))]);
}

describe("validateRoomImage — server-side file signature validation", () => {
  test("accepts a valid JPEG and corrects mimeType from the sniffed signature", () => {
    const image: ImageInput = { buffer: padded(JPEG_HEADER), mimeType: "application/octet-stream" };
    expect(() => validateRoomImage(image)).not.toThrow();
    expect(image.mimeType).toBe("image/jpeg"); // never trusts the client-declared type
  });

  test("accepts a valid PNG", () => {
    const image: ImageInput = { buffer: padded(PNG_HEADER), mimeType: "image/jpeg" }; // deliberately wrong declared type
    expect(() => validateRoomImage(image)).not.toThrow();
    expect(image.mimeType).toBe("image/png");
  });

  test("accepts a valid WebP", () => {
    const image: ImageInput = { buffer: padded(WEBP_HEADER), mimeType: "image/png" };
    expect(() => validateRoomImage(image)).not.toThrow();
    expect(image.mimeType).toBe("image/webp");
  });

  test("rejects a plain text file even if declared as image/jpeg (renamed .txt -> .jpg)", () => {
    const image: ImageInput = { buffer: Buffer.from("this is just plain text, not an image", "utf8"), mimeType: "image/jpeg" };
    expectRejectedWith(image, "AI_UNSUPPORTED_IMAGE_FORMAT");
  });

  test("rejects a PDF disguised with an image mimeType", () => {
    const pdfHeader = padded(Buffer.from("%PDF-1.4", "ascii"));
    const image: ImageInput = { buffer: pdfHeader, mimeType: "image/png" };
    expectRejectedWith(image, "AI_UNSUPPORTED_IMAGE_FORMAT");
  });

  test("rejects an SVG (XML text, not a raster signature — also closes an XSS vector)", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");
    const image: ImageInput = { buffer: svg, mimeType: "image/svg+xml" };
    expectRejectedWith(image, "AI_UNSUPPORTED_IMAGE_FORMAT");
  });

  test("rejects an empty file", () => {
    const image: ImageInput = { buffer: Buffer.alloc(0), mimeType: "image/jpeg" };
    expectRejectedWith(image, "AI_INVALID_IMAGE");
  });

  test("rejects a file too small to contain any valid signature", () => {
    const image: ImageInput = { buffer: Buffer.from([0xff, 0xd8]), mimeType: "image/jpeg" };
    expectRejectedWith(image, "AI_UNSUPPORTED_IMAGE_FORMAT");
  });

  test("rejects a file exceeding the configured size limit, independent of the browser", () => {
    const oversized = padded(JPEG_HEADER, aiConfig.image.maxRoomImageBytes + 1);
    const image: ImageInput = { buffer: oversized, mimeType: "image/jpeg" };
    expectRejectedWith(image, "AI_IMAGE_TOO_LARGE");
  });

  test("accepts a file exactly at the size limit", () => {
    const atLimit = padded(JPEG_HEADER, aiConfig.image.maxRoomImageBytes);
    const image: ImageInput = { buffer: atLimit, mimeType: "image/jpeg" };
    expect(() => validateRoomImage(image)).not.toThrow();
  });

  test("DOCUMENTED LIMITATION: a corrupted body after a valid header still passes signature sniffing", () => {
    // Magic-byte sniffing only inspects the first ~12 bytes; it cannot detect
    // a truncated/corrupted body, only a real image decode could. This is
    // intentionally accepted scope for this MVP, not a bug — recorded here
    // so the limitation is explicit rather than silently assumed.
    const corrupted = Buffer.concat([JPEG_HEADER, Buffer.from([0x00, 0x00, 0xff, 0xff, 0x00, 0x11, 0x22])]);
    const image: ImageInput = { buffer: corrupted, mimeType: "image/jpeg" };
    expect(() => validateRoomImage(image)).not.toThrow();
  });
});
