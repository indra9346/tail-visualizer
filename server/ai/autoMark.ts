import sharp from "sharp";
import { z } from "zod";
import { aiConfig } from "./config.js";
import { classifyGeminiError, getGeminiClient } from "./geminiClient.js";
import { GeminiEmptyResponseError, GeminiRateLimitError, GeminiUpstreamError } from "./errors.js";
import { aiLogger } from "./logger.js";
import { withTimeout } from "./timeout.js";
import { validateRoomImage } from "./imageValidation.js";
import { prepareImageForModel } from "./prepareImageForModel.js";
import { encodeMask, maskGrid, paintedCount } from "./areaMask.js";
import type { ImageInput, SurfaceType } from "./types.js";

/**
 * AI marking: before the owner paints anything, the model finds each chosen surface on the room photo and returns
 * where it is, in the same mask format the owner's painting uses (areaMask.ts). The owner then only checks it
 * ("Is the red part the wall? Yes, correct") or fixes it with Add / Remove. Nothing here is trusted blindly: a mask
 * that is missing, too small or malformed is simply left out, and the owner marks that surface by hand as before.
 *
 * Off unless AUTO_MARK_ENABLED=1, so it can be switched on only after it has been checked on real photos.
 */
export function autoMarkEnabled(): boolean {
  return process.env.AUTO_MARK_ENABLED === "1";
}

/** What each surface means, in the words the model is given. */
const SURFACE_DESCRIPTIONS: Record<SurfaceType, string> = {
  floor: "the floor: the flat ground surface people walk on in this room, including the part under small rugs and mats. Not walls, steps, furniture, toilets, cabinets or anything standing on the floor.",
  wall: "the walls: every vertical wall surface of the room that could be tiled, inside or outside the house. Not doors, windows, door or window frames, mirrors, cabinets, shelves, taps, toilets, basins, pipes, furniture, the ceiling or the floor.",
  backsplash: "the kitchen wall: the wall between the kitchen countertop and the upper cabinets (or up to where wall tiles would usually stop). Not the countertop, stove, sink, chimney, cabinets, appliances or windows.",
  shower_wall: "the shower wall: the wall surfaces inside the shower or bathroom wet area. Not taps, shower heads, glass, doors, windows or the floor.",
  step_tread: "the step tops: the flat top surface of each stair step, where a foot is placed.",
  step_riser: "the step fronts: the vertical front face of each stair step, between one step top and the next.",
};

/** Longest side of the copy sent to the model: enough for clean edges on a 256-cell mask, small enough to stay fast. */
const MODEL_MAX_SIDE = 1024;
/** A surface marked on less than this share of the photo is treated as not found (a stray speck, not a wall). */
const MIN_SHARE = 0.003;
/** Mask probability (0-255) from which a cell counts as marked. */
const THRESHOLD = 128;
/** A hostile or broken reply cannot make the server decode huge images. */
const MAX_MASK_BASE64 = 2_000_000;
const MAX_ENTRIES = 24;

export function buildAutoMarkPrompt(surfaces: SurfaceType[]): string {
  const lines = surfaces.map((s) => `- label "${s}": ${SURFACE_DESCRIPTIONS[s]}`);
  return [
    "This is a customer's room photo in a tile showroom. Find these surfaces so new tiles can be laid on exactly them:",
    ...lines,
    "",
    'Give the segmentation masks. Output a JSON list where each entry has "label" (exactly one of the labels above), "box_2d" ([ymin, xmin, ymax, xmax], scaled 0 to 1000) and "mask" (the segmentation mask inside that box, as a base64 PNG).',
    "A surface in several separate pieces (for example two walls) may get one entry per piece. Leave out a surface that is not visible. Do not mark anything that is not the surface itself.",
  ].join("\n");
}

const entrySchema = z.object({
  label: z.string(),
  box_2d: z.array(z.number()).length(4),
  mask: z.string().min(1).max(MAX_MASK_BASE64),
});

/** The model's JSON list, or null when the reply is not one. A few bad entries are skipped, not fatal. */
export function parseSegmentation(rawText: string): Array<z.infer<typeof entrySchema>> | null {
  const text = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed
    .slice(0, MAX_ENTRIES)
    .map((e) => entrySchema.safeParse(e))
    .flatMap((r) => (r.success ? [r.data] : []));
}

export interface AutoMarkResult {
  surface: SurfaceType;
  /** areaMask.ts text ("WxH:runs") on the grid of this photo. */
  mask: string;
}

/**
 * Turns the model's per-box masks into one mask per surface on the photo's grid. Where two surfaces claim the same
 * cell (a floor and a wall at the skirting) the more certain one wins, so the masks never overlap.
 */
export async function segmentationToMasks(
  entries: Array<z.infer<typeof entrySchema>>,
  surfaces: SurfaceType[],
  photo: { width: number; height: number },
): Promise<AutoMarkResult[]> {
  const grid = maskGrid(photo.width, photo.height);
  const size = grid.width * grid.height;
  const probability = new Map<SurfaceType, Uint8Array>();

  for (const entry of entries) {
    const surface = surfaces.find((s) => s === entry.label.trim().toLowerCase());
    if (!surface) continue;
    const [ymin, xmin, ymax, xmax] = entry.box_2d.map((v) => Math.min(1000, Math.max(0, v)) / 1000) as [number, number, number, number];
    const x0 = Math.floor(xmin * grid.width);
    const y0 = Math.floor(ymin * grid.height);
    const w = Math.min(grid.width - x0, Math.max(1, Math.round((xmax - xmin) * grid.width)));
    const h = Math.min(grid.height - y0, Math.max(1, Math.round((ymax - ymin) * grid.height)));
    if (w <= 0 || h <= 0 || xmax <= xmin || ymax <= ymin) continue;
    let pixels: Buffer;
    try {
      const png = Buffer.from(entry.mask.replace(/^data:image\/\w+;base64,/, ""), "base64");
      pixels = await sharp(png, { limitInputPixels: 4_000_000 }).greyscale().resize(w, h, { fit: "fill" }).raw().toBuffer();
    } catch {
      continue; // not a picture: skip this piece
    }
    const grid8 = probability.get(surface) ?? new Uint8Array(size);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = pixels[y * w + x]!;
        const at = (y0 + y) * grid.width + (x0 + x);
        if (v > grid8[at]!) grid8[at] = v;
      }
    probability.set(surface, grid8);
  }

  const cells = new Map<SurfaceType, Uint8Array>(surfaces.map((s) => [s, new Uint8Array(size)]));
  for (let i = 0; i < size; i++) {
    let best: SurfaceType | null = null;
    let bestValue = THRESHOLD - 1;
    for (const s of surfaces) {
      const v = probability.get(s)?.[i] ?? 0;
      if (v > bestValue) {
        best = s;
        bestValue = v;
      }
    }
    if (best) cells.get(best)![i] = 1;
  }

  return surfaces.flatMap((surface) => {
    const mask = { width: grid.width, height: grid.height, cells: cells.get(surface)! };
    return paintedCount(mask) >= MIN_SHARE * size ? [{ surface, mask: encodeMask(mask) }] : [];
  });
}

/** Finds the chosen surfaces on a room photo. Returns only the ones the model found; never throws for a bad reply. */
export async function autoMarkSurfaces(input: { roomUploadId: string; image: ImageInput; surfaces: SurfaceType[] }): Promise<AutoMarkResult[]> {
  const start = Date.now();
  const surfaces = [...new Set(input.surfaces)];
  validateRoomImage(input.image);
  const modelImage = await prepareImageForModel(input.image, { maxDimension: MODEL_MAX_SIDE, label: "room image" });
  const meta = await sharp(modelImage.buffer).metadata();
  const photo = { width: meta.width ?? 1, height: meta.height ?? 1 };
  const model = aiConfig.models.autoMark;

  let response;
  try {
    response = await withTimeout(
      getGeminiClient().models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: modelImage.mimeType, data: modelImage.buffer.toString("base64") } }, { text: buildAutoMarkPrompt(surfaces) }],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
          // Spatial answers come out better and faster without "thinking" first.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      aiConfig.timeoutsMs.autoMark,
      "autoMark",
    );
  } catch (err) {
    if (err instanceof Error && err.name === "GeminiTimeoutError") throw err;
    throw classifyGeminiError(err) === "rate_limited" ? new GeminiRateLimitError("autoMark", err) : new GeminiUpstreamError("autoMark", err);
  }

  const rawText = response.text;
  if (!rawText || rawText.trim().length === 0) throw new GeminiEmptyResponseError("autoMark");
  const entries = parseSegmentation(rawText);
  const masks = entries ? await segmentationToMasks(entries, surfaces, photo) : [];

  aiLogger.info("auto mark finished", {
    operation: "autoMark",
    model,
    roomUploadId: input.roomUploadId,
    durationMs: Date.now() - start,
    success: masks.length > 0,
    asked: surfaces.join(","),
    found: masks.map((m) => m.surface).join(","),
    parsed: entries !== null,
  });
  return masks;
}
