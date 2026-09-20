import sharp, { type Sharp } from "sharp";
import { prepareImageForModel } from "../server/ai/prepareImageForModel";
import { ImageValidationError } from "../server/ai/errors";

const opts = { maxDimension: 1600, label: "room image" };

async function jpeg(width: number, height: number, extra?: (s: Sharp) => Sharp): Promise<Buffer> {
  let s = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 180, b: 150 } } });
  if (extra) s = extra(s);
  return s.jpeg().toBuffer();
}

describe("prepareImageForModel", () => {
  test("downsizes the longest side to maxDimension, keeping aspect ratio, output is JPEG", async () => {
    const original = await jpeg(4080, 1848);
    const out = await prepareImageForModel({ buffer: original, mimeType: "image/jpeg" }, opts);
    const meta = await sharp(out.buffer).metadata();
    expect(out.mimeType).toBe("image/jpeg");
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(Math.round((1848 * 1600) / 4080));
  });

  test("never enlarges a small image", async () => {
    const out = await prepareImageForModel({ buffer: await jpeg(300, 200), mimeType: "image/jpeg" }, opts);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([300, 200]);
  });

  test("generation size (2048) is honoured", async () => {
    const out = await prepareImageForModel({ buffer: await jpeg(3000, 3000), mimeType: "image/jpeg" }, { maxDimension: 2048, label: "x" });
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBe(2048);
  });

  test("the ORIGINAL buffer is never modified (stored upload stays byte-identical)", async () => {
    const original = await jpeg(3000, 2000);
    const snapshot = Buffer.from(original); // independent copy
    const input = { buffer: original, mimeType: "image/jpeg" };
    const out = await prepareImageForModel(input, opts);
    expect(out.buffer).not.toBe(original);
    expect(original.equals(snapshot)).toBe(true);
    expect(input.buffer).toBe(original);
    expect(input.mimeType).toBe("image/jpeg");
  });

  test("applies EXIF orientation to the pixels (sideways-tagged photo comes out upright)", async () => {
    // 400x200 pixels tagged orientation 6 (rotate 90 deg CW) => displays as 200x400
    const sideways = await jpeg(400, 200, (s) => s.withMetadata({ orientation: 6 }));
    expect((await sharp(sideways).metadata()).orientation).toBe(6);
    const out = await prepareImageForModel({ buffer: sideways, mimeType: "image/jpeg" }, opts);
    const meta = await sharp(out.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([200, 400]);
    expect(meta.orientation).toBeUndefined();
  });

  test("strips metadata from the model copy, including GPS location", async () => {
    const withGps = await jpeg(640, 480, (s) =>
      s.withExif({
        IFD0: { Copyright: "secret-owner", Artist: "private-name" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 34/1 56/1", GPSLongitudeRef: "E", GPSLongitude: "77/1 35/1 12/1" },
      }),
    );
    const inMeta = await sharp(withGps).metadata();
    expect(inMeta.exif).toBeDefined(); // the fixture really carries EXIF
    expect(withGps.includes(Buffer.from("secret-owner"))).toBe(true);

    const out = await prepareImageForModel({ buffer: withGps, mimeType: "image/jpeg" }, opts);
    const outMeta = await sharp(out.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(out.buffer.includes(Buffer.from("secret-owner"))).toBe(false);
    expect(out.buffer.includes(Buffer.from("private-name"))).toBe(false);
    expect(out.buffer.includes(Buffer.from("Exif"))).toBe(false);
  });

  test("flattens transparency onto white and converts PNG to JPEG", async () => {
    const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const out = await prepareImageForModel({ buffer: png, mimeType: "image/png" }, opts);
    const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
    expect(out.mimeType).toBe("image/jpeg");
    expect(data[0]).toBeGreaterThan(240); // white, not black
  });

  test("a corrupt file that passes the signature check fails cleanly with AI_INVALID_IMAGE (no fallback to raw bytes)", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1020)]);
    await expect(prepareImageForModel({ buffer: fake, mimeType: "image/jpeg" }, opts)).rejects.toMatchObject({ code: "AI_INVALID_IMAGE" });
    await expect(prepareImageForModel({ buffer: fake, mimeType: "image/jpeg" }, opts)).rejects.toBeInstanceOf(ImageValidationError);
  });

  test("refuses decompression bombs above the pixel limit before decoding", async () => {
    // 12000x12000 = 144 MP of a flat colour (above our 100 MP limit): tiny file, enormous pixel grid
    const bomb = await sharp({ create: { width: 12000, height: 12000, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(10 * 1024 * 1024);
    await expect(prepareImageForModel({ buffer: bomb, mimeType: "image/png" }, opts)).rejects.toMatchObject({ code: "AI_INVALID_IMAGE" });
  }, 60000);

  test("the safe user-facing message leaks no decoder internals", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1020)]);
    try {
      await prepareImageForModel({ buffer: fake, mimeType: "image/jpeg" }, opts);
      throw new Error("expected rejection");
    } catch (err) {
      expect((err as ImageValidationError).safeMessage).not.toMatch(/sharp|vips|decode|Input/i);
    }
  });
});
