import type { RoomType, SurfaceType, Tile } from "../api/types";
import type { DesignPattern } from "./designPatterns";
import { SURFACES } from "./designPatterns";

/**
 * Optional "size and recommendations" helper for one area. Everything here only SUGGESTS: nothing is ever applied
 * unless the owner taps it, and a design is complete without any size at all.
 */
export type DimUnit = "ft" | "m";
export const MM_PER_UNIT: Record<DimUnit, number> = { ft: 304.8, m: 1000 };

/** What the owner typed (strings, so a half-typed number is not lost). */
export interface AreaSize {
  width: string;
  height: string;
  unit: DimUnit;
}

export const MIN_AREA_MM = 300;
export const MAX_AREA_MM = 30000;

export function emptySize(unit: DimUnit = "ft"): AreaSize {
  return { width: "", height: "", unit };
}

/** "10", "10.5", "10,5" -> millimetres, or null when empty / not a number / outside what a room can be. */
export function toMm(value: string, unit: DimUnit): number | null {
  const n = Number(value.trim().replace(",", "."));
  if (value.trim() === "" || !Number.isFinite(n)) return null;
  const mm = Math.round(n * MM_PER_UNIT[unit]);
  return mm >= MIN_AREA_MM && mm <= MAX_AREA_MM ? mm : null;
}

export function sizeIsEmpty(size?: AreaSize): boolean {
  return !size || (size.width.trim() === "" && size.height.trim() === "");
}

/** Both measurements valid -> millimetres; otherwise null (a partly filled size is reported by sizeProblem). */
export function sizeToDimensions(size?: AreaSize): { widthMm: number; heightMm: number } | null {
  if (!size) return null;
  const widthMm = toMm(size.width, size.unit);
  const heightMm = toMm(size.height, size.unit);
  return widthMm !== null && heightMm !== null ? { widthMm, heightMm } : null;
}

export function sizeProblem(size?: AreaSize): string | null {
  if (sizeIsEmpty(size)) return null;
  return sizeToDimensions(size) ? null : "Enter both measurements as numbers (for example 10 and 8), or clear them. They are optional.";
}

/** "600x600", "600 x 1200", "300×600 mm" -> mm. Anything smaller than 100 mm a side (mosaic sheets, inch values) is not trusted. */
export function parseTileSizeMm(sizeMm: string | null | undefined): { w: number; h: number } | null {
  if (!sizeMm) return null;
  const m = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i.exec(sizeMm);
  if (!m) return null;
  const w = Number(m[1]!.replace(",", "."));
  const h = Number(m[2]!.replace(",", "."));
  if (!(w >= 100 && h >= 100 && w <= 3200 && h <= 3200)) return null;
  return { w, h };
}

export interface FitResult {
  tile: Tile;
  /** Tile size in the orientation that fits best. */
  tw: number;
  th: number;
  cols: number;
  rows: number;
  pieces: number;
  /** Share of the tiles' own area that ends up as offcuts, in percent. */
  wastePct: number;
  score: number;
  /** e.g. "600 x 600 mm | 5 x 4 pieces | about 8% cutting waste" */
  label: string;
}

const JOINT_MM = 3;

/** How well a tile's size suits a wall / floor of the given size (both orientations are tried). */
export function fitTile(tile: Tile, widthMm: number, heightMm: number): FitResult | null {
  const size = parseTileSizeMm(tile.sizeMm);
  if (!size) return null;
  let best: FitResult | null = null;
  for (const [tw, th] of [[size.w, size.h], [size.h, size.w]] as const) {
    // A tile larger than the surface in either direction makes no sense for it.
    if (tw > widthMm * 1.05 || th > heightMm * 1.05) continue;
    const stepX = tw + JOINT_MM;
    const stepY = th + JOINT_MM;
    const cols = Math.ceil(widthMm / stepX - 1e-9);
    const rows = Math.ceil(heightMm / stepY - 1e-9);
    const pieces = cols * rows;
    const covered = pieces * tw * th;
    const wastePct = Math.max(0, ((covered - widthMm * heightMm) / covered) * 100);
    // A very thin sliver of tile at an edge is hard to cut and looks poor.
    const remX = widthMm - Math.floor(widthMm / stepX) * stepX;
    const remY = heightMm - Math.floor(heightMm / stepY) * stepY;
    const slivers = (remX > 1 && remX < tw * 0.2 ? 6 : 0) + (remY > 1 && remY < th * 0.2 ? 6 : 0);
    const score = 100 - wastePct * 1.5 - slivers;
    if (!best || score > best.score) {
      best = {
        tile,
        tw,
        th,
        cols,
        rows,
        pieces,
        wastePct,
        score,
        label: `${tw} x ${th} mm | ${cols} x ${rows} pieces | about ${Math.round(wastePct)}% cutting waste`,
      };
    }
  }
  return best;
}

export interface RankOptions {
  roomType?: RoomType;
  /** Tiles the room analysis already recommended (a small boost). */
  recommendedIds?: Set<string>;
  limit?: number;
}

const kindOf = (surface: SurfaceType) => SURFACES[surface].kind;

/** Best-fitting active catalog tiles for a surface of the given size, best first. Tiles of the wrong category are never offered. */
export function rankTiles(tiles: Tile[], surface: SurfaceType, widthMm: number, heightMm: number, opts: RankOptions = {}): FitResult[] {
  const kind = kindOf(surface);
  const results: FitResult[] = [];
  for (const tile of tiles) {
    if (!tile.isActive) continue;
    if (!(tile.category === "both" || tile.category === kind)) continue;
    const fit = fitTile(tile, widthMm, heightMm);
    if (!fit) continue;
    let score = fit.score;
    if (opts.roomType && (tile.suitableRooms.length === 0 || tile.suitableRooms.includes(opts.roomType))) score += 8;
    if (opts.recommendedIds?.has(tile.id)) score += 12;
    results.push({ ...fit, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 3);
}

export interface PatternSuggestion {
  pattern: DesignPattern;
  reason: string;
}

/**
 * Layouts that suit this surface (and size, when it is given), with a one-line reason each. At most 3, best first.
 * These are common interior-design rules of thumb, not guarantees.
 */
export function recommendPatterns(surface: SurfaceType, size: { widthMm: number; heightMm: number } | null, roomType?: RoomType): PatternSuggestion[] {
  const out: PatternSuggestion[] = [];
  const add = (pattern: DesignPattern, reason: string) => {
    if (!out.some((s) => s.pattern === pattern)) out.push({ pattern, reason });
  };
  const w = size?.widthMm ?? 0;
  const h = size?.heightMm ?? 0;
  const m2 = (w * h) / 1_000_000;

  if (surface === "floor" || surface === "step_tread") {
    if (size && m2 < 4.6) add("single", "A small floor looks bigger with one large tile and few joints.");
    if (size && m2 >= 4.6) {
      add("checkerboard", "A larger floor can carry a two-tile checkerboard without feeling busy.");
      add("diagonal", "Laying on the diagonal makes the room feel wider (expect 10 to 15% more cutting).");
    }
    add("single", "Plain laying is the simplest and the least cutting.");
    add("diagonal", "Diagonal laying makes the room feel wider.");
    add("checkerboard", "A classic two-tile floor.");
  } else if (surface === "backsplash") {
    add("herringbone", "A herringbone backsplash is the classic kitchen look.");
    add("highlighter_strip", "One decorative strip lifts a plain backsplash.");
    add("single", "Plain tiles keep a busy kitchen calm.");
  } else if (surface === "step_riser") {
    add("single", "Risers look cleanest in one tile.");
    add("vertical_stripes", "Alternating tiles pick out each step.");
  } else {
    // wall or shower wall
    if (roomType === "bathroom" || surface === "shower_wall") add("dado", "Standard for washrooms: a hardwearing tile up to about 1 m, a lighter tile above.");
    if (size && h >= 2400) add("highlighter_strip", "A tall wall reads better with one decorative strip at eye level.");
    if (size && w / h >= 1.8) add("highlighter_strip", "One strip breaks up a long, wide wall.");
    if (size && h / w >= 1.4) add("vertical_stripes", "Vertical stripes add to the height of a narrow wall.");
    add("single", "Plain and easy to install; lets one strong tile speak.");
    add("dado", "Two tiles, lower and upper, are a safe and popular combination.");
    add("feature_panel", "A centred accent panel gives one wall a focal point.");
  }
  return out.slice(0, 3);
}
