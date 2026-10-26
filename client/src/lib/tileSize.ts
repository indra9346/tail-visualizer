import type { SurfaceType } from "../api/types";
import { SURFACES } from "./designPatterns";

/** Tile sizes for the quick look. No DOM here, so it is unit tested with the server-side tests. */

/** About how wide the whole photo is in real life where the tiles are, for laying a believable number of tiles. */
const PHOTO_WIDTH_MM = 3000;

/** "600x600", "300 x 600 mm", "200*1200" -> [width, height] in mm. */
export function parseTileSize(size: string | null | undefined): [number, number] | null {
  const m = /(\d{2,4})\s*[x×*]\s*(\d{2,4})/i.exec(size ?? "");
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w >= 20 && h >= 20 ? [w, h] : null;
}

/**
 * Tile size on screen: real tile size against the real width of the painted area. Unknown sizes fall back to a
 * common tile (600 x 600 on floors, 300 x 600 on walls). Never fewer than 2 or more than 30 tiles across.
 */
export function tilePixels(paintedWidthPx: number, paintedShare: number, surface: SurfaceType, sizeMm?: string | null): { w: number; h: number } {
  const flat = SURFACES[surface].kind === "floor";
  const [tw, th] = parseTileSize(sizeMm) ?? (flat ? [600, 600] : [300, 600]);
  const realWidth = Math.max(600, PHOTO_WIDTH_MM * paintedShare);
  const across = Math.min(30, Math.max(2, realWidth / tw));
  const w = Math.max(6, paintedWidthPx / across);
  return { w, h: Math.max(6, w * (th / tw)) };
}
