import sharp, { type OverlayOptions } from "sharp";
import { aiConfig } from "./config.js";
import { decodeMask } from "./areaMask.js";
import type { ImageInput } from "./types.js";

sharp.cache(false);

/**
 * One flat colour per area, by the area's position in the design (area 1 = red, ...). The colours are strong,
 * far apart and easy to name, so the prompt can say "AREA 2 is the region painted BLUE". The UI paints the owner's
 * marks in exactly these colours (client/src/lib/areaMask.ts), so what the owner sees is what the model is shown.
 */
export const GUIDE_COLOURS = [
  { name: "RED", rgb: [235, 30, 45] },
  { name: "BLUE", rgb: [30, 90, 255] },
  { name: "GREEN", rgb: [0, 200, 70] },
  { name: "YELLOW", rgb: [255, 210, 0] },
  { name: "MAGENTA", rgb: [225, 0, 225] },
  { name: "CYAN", rgb: [0, 215, 235] },
] as const;

/** Paint opacity on the guide: strong enough to read as a flat colour, light enough to keep the surface visible under it. */
const GUIDE_ALPHA = 165;

export function guideColourName(areaIndex: number): string {
  return GUIDE_COLOURS[areaIndex % GUIDE_COLOURS.length]!.name;
}

/**
 * The room photo with each marked area painted over in its colour: the map the model uses to find exactly which
 * pixels to tile. Built from the SAME prepared copy of the photo that is sent as the source image, so the painting
 * lines up with it. Returns null when no area is marked (the design then works from the area names alone).
 */
export async function buildGuideImage(room: ImageInput, areas: ReadonlyArray<{ mask?: string | null }>): Promise<ImageInput | null> {
  if (!areas.some((a) => a.mask)) return null;
  const base = sharp(room.buffer, { limitInputPixels: aiConfig.image.maxInputPixels, failOn: "error" });
  const { width, height } = await base.metadata();
  if (!width || !height) return null;

  const layers: OverlayOptions[] = [];
  for (const [i, area] of areas.entries()) {
    const mask = area.mask ? decodeMask(area.mask) : null;
    if (!mask) continue;
    const [r, g, b] = GUIDE_COLOURS[i % GUIDE_COLOURS.length]!.rgb;
    const raw = Buffer.alloc(mask.width * mask.height * 4);
    for (let c = 0; c < mask.cells.length; c++) {
      if (!mask.cells[c]) continue;
      raw[c * 4] = r;
      raw[c * 4 + 1] = g;
      raw[c * 4 + 2] = b;
      raw[c * 4 + 3] = GUIDE_ALPHA;
    }
    // Stretched over the whole photo: the grid always covers the full frame. A smooth kernel softens the cell steps.
    const layer = await sharp(raw, { raw: { width: mask.width, height: mask.height, channels: 4 } })
      .resize(width, height, { fit: "fill", kernel: "mitchell" })
      .png()
      .toBuffer();
    layers.push({ input: layer, left: 0, top: 0 });
  }
  if (layers.length === 0) return null;

  const buffer = await base.composite(layers).jpeg({ quality: aiConfig.image.modelJpegQuality, mozjpeg: true }).toBuffer();
  return { buffer, mimeType: "image/jpeg" };
}
