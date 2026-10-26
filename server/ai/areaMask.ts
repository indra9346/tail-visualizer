/**
 * Where an area is, painted by the owner on the room photo: a coarse on/off grid laid over the whole photo.
 *
 * Encoded as "<width>x<height>:<runs>". The runs are the lengths of alternating unpainted / painted stretches of
 * cells in row-major order, written in base 36 and joined by "."; the first run is unpainted and may be 0, every
 * other run is at least 1 (so one grid has exactly one encoding, and the same painting always hashes the same).
 *
 * The UI mirror is client/src/lib/areaMask.ts; test/areaMask.test.ts keeps the two identical.
 */

/** Cells along the long side of the photo. The short side follows the photo's aspect ratio. */
export const MASK_MAX_SIDE = 256;
export const MASK_MIN_SIDE = 8;
/** A painting with many small strokes still fits in a few kilobytes; this caps a hostile request. */
export const MASK_MAX_CHARS = 40_000;

export interface AreaMask {
  width: number;
  height: number;
  /** 1 = painted, 0 = not painted; row-major, width * height cells. */
  cells: Uint8Array;
}

const FORMAT = /^(\d{1,3})x(\d{1,3}):([0-9a-z]+(?:\.[0-9a-z]+)*)$/;

export function encodeMask(mask: AreaMask): string {
  const runs: number[] = [];
  let current = 0;
  let length = 0;
  for (let i = 0; i < mask.cells.length; i++) {
    const v = mask.cells[i] ? 1 : 0;
    if (v === current) length++;
    else {
      runs.push(length);
      current = v;
      length = 1;
    }
  }
  runs.push(length);
  return `${mask.width}x${mask.height}:${runs.map((r) => r.toString(36)).join(".")}`;
}

/** The grid, or null when the text is not a well-formed mask (wrong size, runs that do not add up, ...). */
export function decodeMask(text: string): AreaMask | null {
  if (typeof text !== "string" || text.length > MASK_MAX_CHARS) return null;
  const match = FORMAT.exec(text);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < MASK_MIN_SIDE || height < MASK_MIN_SIDE || width > MASK_MAX_SIDE || height > MASK_MAX_SIDE) return null;
  const total = width * height;
  const runs = match[3]!.split(".").map((r) => parseInt(r, 36));
  if (runs.some((r, i) => !Number.isSafeInteger(r) || r < 0 || (i > 0 && r === 0))) return null;
  if (runs.reduce((a, b) => a + b, 0) !== total) return null;
  const cells = new Uint8Array(total);
  let at = 0;
  runs.forEach((run, i) => {
    if (i % 2 === 1) cells.fill(1, at, at + run);
    at += run;
  });
  return { width, height, cells };
}

export function paintedCount(mask: AreaMask): number {
  let n = 0;
  for (let i = 0; i < mask.cells.length; i++) n += mask.cells[i]!;
  return n;
}

/** True when two masks of the same grid share at least one painted cell. Masks of different grids never compare equal. */
export function masksOverlap(a: AreaMask, b: AreaMask): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] && b.cells[i]) return true;
  return false;
}
