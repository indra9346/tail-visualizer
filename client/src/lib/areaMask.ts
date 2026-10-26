/**
 * The owner marks each area by painting on the room photo. The painting is a coarse on/off grid over the whole photo.
 *
 * Codec: UI mirror of server/ai/areaMask.ts (the client cannot import server code); test/areaMask.test.ts keeps the
 * two byte-for-byte identical. Everything else here (painting, tap-to-fill) is UI-only and pure, so it is unit tested
 * without a browser.
 */

export const MASK_MAX_SIDE = 256;
export const MASK_MIN_SIDE = 8;
export const MASK_MAX_CHARS = 40_000;

export interface AreaMask {
  width: number;
  height: number;
  /** 1 = painted, 0 = not painted; row-major, width * height cells. */
  cells: Uint8Array;
}

/**
 * Mark colours by area position, the same colours the server paints on the guide image it shows the AI
 * (server/ai/guideImage.ts GUIDE_COLOURS), so what the owner sees is exactly what the AI is shown.
 */
export const MASK_COLOURS = [
  { name: "Red", rgb: [235, 30, 45] },
  { name: "Blue", rgb: [30, 90, 255] },
  { name: "Green", rgb: [0, 200, 70] },
  { name: "Yellow", rgb: [255, 210, 0] },
  { name: "Pink", rgb: [225, 0, 225] },
  { name: "Sky blue", rgb: [0, 215, 235] },
] as const;

export const maskColour = (index: number) => MASK_COLOURS[index % MASK_COLOURS.length]!;
export const maskCss = (index: number, alpha = 1) => `rgba(${maskColour(index).rgb.join(",")},${alpha})`;

/** The grid for a photo: MASK_MAX_SIDE cells along its long side, the short side in proportion. */
export function maskGrid(photoWidth: number, photoHeight: number): { width: number; height: number } {
  const w = Math.max(1, photoWidth);
  const h = Math.max(1, photoHeight);
  const scale = MASK_MAX_SIDE / Math.max(w, h);
  return {
    width: Math.min(MASK_MAX_SIDE, Math.max(MASK_MIN_SIDE, Math.round(w * scale))),
    height: Math.min(MASK_MAX_SIDE, Math.max(MASK_MIN_SIDE, Math.round(h * scale))),
  };
}

export function emptyMask(width: number, height: number): AreaMask {
  return { width, height, cells: new Uint8Array(width * height) };
}

export function cloneMask(mask: AreaMask): AreaMask {
  return { width: mask.width, height: mask.height, cells: new Uint8Array(mask.cells) };
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

export function masksOverlap(a: AreaMask, b: AreaMask): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.cells.length; i++) if (a.cells[i] && b.cells[i]) return true;
  return false;
}

/** The painted cells' bounding box (inclusive), or null when nothing is painted. */
export function maskBounds(mask: AreaMask): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!mask.cells[y * mask.width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * A mask small enough to send. A painting is normally a few kilobytes; a very ragged one (tap to fill on a busy
 * pattern) is smoothed, each cell taking the majority of its 3x3 neighbourhood, until it fits. Never returns an empty
 * mask for a painted one.
 */
export function fitMask(mask: AreaMask): AreaMask {
  let current = mask;
  for (let pass = 0; pass < 8 && encodeMask(current).length > MASK_MAX_CHARS; pass++) {
    const { width, height } = current;
    const next = emptyMask(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let on = 0;
        let all = 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++)
          for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
            on += current.cells[yy * width + xx]!;
            all++;
          }
        next.cells[y * width + x] = on * 2 > all ? 1 : 0;
      }
    }
    if (paintedCount(next) === 0) break;
    current = next;
  }
  return current;
}

// ---------- painting (these MUTATE the mask they are given; callers paint on a copy) ----------

/** Paints (value 1) or erases (value 0) a disc. Centre and radius are in cells and may be fractional. */
export function paintDisc(mask: AreaMask, cx: number, cy: number, radius: number, value: 0 | 1): void {
  const r = Math.max(0.5, radius);
  const ys = Math.max(0, Math.floor(cy - r));
  const ye = Math.min(mask.height - 1, Math.ceil(cy + r));
  const xs = Math.max(0, Math.floor(cx - r));
  const xe = Math.min(mask.width - 1, Math.ceil(cx + r));
  const r2 = r * r;
  for (let y = ys; y <= ye; y++) {
    for (let x = xs; x <= xe; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) mask.cells[y * mask.width + x] = value;
    }
  }
}

/** A brush stroke from one point to the next: discs close enough together to leave no gaps. */
export function paintSegment(mask: AreaMask, x0: number, y0: number, x1: number, y1: number, radius: number, value: 0 | 1): void {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(length / Math.max(0.5, radius / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintDisc(mask, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, value);
  }
}

/** Adds every cell of `region` to the mask. */
export function addRegion(mask: AreaMask, region: Uint8Array): void {
  for (let i = 0; i < mask.cells.length; i++) if (region[i]) mask.cells[i] = 1;
}

/** Removes every cell of `region` from the mask (the cells another area was just painted on). */
export function removeRegion(mask: AreaMask, region: Uint8Array): void {
  for (let i = 0; i < mask.cells.length; i++) if (region[i]) mask.cells[i] = 0;
}

// ---------- tap to fill ----------

/** How far "tap to fill" spreads: 1 = only very similar colour, 5 = generous. The owner nudges it with Less / More. */
export const FILL_LEVELS = [1, 2, 3, 4, 5] as const;
export type FillLevel = (typeof FILL_LEVELS)[number];
// One notch on the careful side: a fill that stops short is fixed by tapping again, one that spills needs "Less".
export const DEFAULT_FILL_LEVEL: FillLevel = 2;
// Differences in CIE Lab units. From the tapped colour, colour (a, b) and brightness (L) are judged apart: light and
// shade across one wall change mostly its brightness, while another material changes its colour. From the
// neighbouring cell, any change counts: that is what stops the fill at the edge of a wall, a counter or a door frame.
const SEED_COLOUR: Record<FillLevel, number> = { 1: 6, 2: 9, 3: 13, 4: 18, 5: 25 };
const SEED_BRIGHTNESS: Record<FillLevel, number> = { 1: 18, 2: 30, 3: 40, 4: 52, 5: 66 };
const FROM_NEIGHBOUR: Record<FillLevel, number> = { 1: 4, 2: 5.5, 3: 7, 4: 9, 5: 12 };
// Lines this many cells wide are stepped over when the same surface goes on behind them: the grout between existing
// tiles, a crack, a thin cable. Nothing is stepped over at the lowest level.
const BRIDGE: Record<FillLevel, number> = { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2 };

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/** RGBA pixels (one per grid cell) to CIE Lab (D65), three floats per cell. */
export function toLab(pixels: Uint8ClampedArray | Uint8Array, count: number): Float32Array {
  const lab = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = srgbToLinear(pixels[i * 4]!);
    const g = srgbToLinear(pixels[i * 4 + 1]!);
    const b = srgbToLinear(pixels[i * 4 + 2]!);
    const fx = labF((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
    const fy = labF(r * 0.2126 + g * 0.7152 + b * 0.0722);
    const fz = labF((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    lab[i * 3] = 116 * fy - 16;
    lab[i * 3 + 1] = 500 * (fx - fy);
    lab[i * 3 + 2] = 200 * (fy - fz);
  }
  return lab;
}

/**
 * "Tap to fill": the cells around the tapped one that look like the same surface. It grows out from the tap while each
 * new cell is close to its neighbour (so it stops at the edge of a wall, a counter or a door frame) and to the tapped
 * colour (so a slow drift can never carry it onto another material; brightness may vary more, for light and shade).
 * It steps over thin lines such as the grout of existing tiles, and fills small specks inside the result; large
 * objects (a toilet on the floor) stay out.
 *
 * A busy pattern (existing patterned tiles, a printed wall) changes colour at every motif, so the colour fill finds
 * only the motifs like the tapped one. So the fill is also run on the photo's TEXTURE: the average colour and contrast
 * over a small neighbourhood, which are the same all over one patterned surface and different on the plain wall next
 * to it. When the texture finds a much larger surface, that is the patterned surface the owner meant.
 *
 * `lab` comes from toLab() over the photo scaled to the grid. Returns the region as 0/1 cells.
 */
export function growRegion(lab: Float32Array, width: number, height: number, seedX: number, seedY: number, level: FillLevel = DEFAULT_FILL_LEVEL): Uint8Array {
  const total = width * height;
  const sx = Math.min(width - 1, Math.max(0, Math.floor(seedX)));
  const sy = Math.min(height - 1, Math.max(0, Math.floor(seedY)));
  const texture = textureOf(lab, width, height);
  const region = grow(lab, texture.contrast, "colour", width, height, sx, sy, level);
  // A texture blurs edges, so it is judged one notch more carefully than colour; one more tap adds what it missed.
  const patterned = grow(texture.mean, texture.contrast, "texture", width, height, sx, sy, Math.max(1, level - 1) as FillLevel);
  const plainSize = countCells(region);
  const patternSize = countCells(patterned);
  // On a plain surface both agree. Never the whole photo: then the texture could not tell the surfaces apart.
  if (patternSize >= Math.max(24, plainSize * PATTERN_GAIN) && patternSize < total * 0.7) {
    for (let i = 0; i < total; i++) if (patterned[i]) region[i] = 1;
  }
  return fillSmallHoles(closeGaps(region, width, height), width, height);
}

/** How much larger the texture fill must be than the colour fill to be taken as a patterned surface. */
const PATTERN_GAIN = 2.5;
/** Neighbourhood (cells each way) over which a pattern's texture is measured: wider than one motif. */
const TEXTURE_RADIUS = 4;
/** How far the contrast of a patterned surface may differ from the tapped spot's, as a share of it. */
const CONTRAST_SHARE: Record<FillLevel, number> = { 1: 0.25, 2: 0.35, 3: 0.45, 4: 0.6, 5: 0.8 };
/** A tapped spot this busy (L standard deviation around it) is on a pattern. */
const BUSY = 8;

function countCells(region: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < region.length; i++) n += region[i]!;
  return n;
}

const textureCache = new WeakMap<Float32Array, { mean: Float32Array; contrast: Float32Array }>();

/** Per cell: the average Lab colour and the brightness contrast (standard deviation of L) over its neighbourhood. */
function textureOf(lab: Float32Array, width: number, height: number): { mean: Float32Array; contrast: Float32Array } {
  const cached = textureCache.get(lab);
  if (cached && cached.contrast.length === width * height) return cached;
  // Summed-area tables of L, a, b and L squared: each neighbourhood is then four look-ups.
  const W = width + 1;
  const sums = [0, 1, 2, 3].map(() => new Float64Array(W * (height + 1)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const values = [lab[i]!, lab[i + 1]!, lab[i + 2]!, lab[i]! * lab[i]!];
      const at = (y + 1) * W + (x + 1);
      for (let c = 0; c < 4; c++) sums[c]![at] = values[c]! + sums[c]![at - 1]! + sums[c]![at - W]! - sums[c]![at - W - 1]!;
    }
  }
  const mean = new Float32Array(width * height * 3);
  const contrast = new Float32Array(width * height);
  const r = TEXTURE_RADIUS;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const n = (y1 - y0) * (x1 - x0);
      const box = (c: number) => (sums[c]![y1 * W + x1]! - sums[c]![y0 * W + x1]! - sums[c]![y1 * W + x0]! + sums[c]![y0 * W + x0]!) / n;
      const i = y * width + x;
      const l = box(0);
      mean[i * 3] = l;
      mean[i * 3 + 1] = box(1);
      mean[i * 3 + 2] = box(2);
      contrast[i] = Math.sqrt(Math.max(0, box(3) - l * l));
    }
  }
  textureCache.set(lab, { mean, contrast });
  return { mean, contrast };
}

/**
 * The region growing itself, before gap closing. "colour" compares the cells' own colours; when the tap is on a busy
 * pattern it may only spread over equally busy cells, so a dark motif can never run on into a plain dark floor or a
 * wall in shadow. "texture" compares the neighbourhood averages and contrast instead (`lab` is then texture.mean).
 */
function grow(lab: Float32Array, contrast: Float32Array, mode: "colour" | "texture", width: number, height: number, sx: number, sy: number, level: FillLevel): Uint8Array {
  const total = width * height;
  const region = new Uint8Array(total);

  // The tapped colour: the average of the 3x3 cells around the tap, so one odd pixel cannot decide it.
  let sl = 0;
  let sa = 0;
  let sb = 0;
  let n = 0;
  for (let y = Math.max(0, sy - 1); y <= Math.min(height - 1, sy + 1); y++) {
    for (let x = Math.max(0, sx - 1); x <= Math.min(width - 1, sx + 1); x++) {
      const i = (y * width + x) * 3;
      sl += lab[i]!;
      sa += lab[i + 1]!;
      sb += lab[i + 2]!;
      n++;
    }
  }
  sl /= n;
  sa /= n;
  sb /= n;

  const colourLimit = SEED_COLOUR[level] ** 2;
  const brightnessLimit = SEED_BRIGHTNESS[level];
  const texture = mode === "texture";
  // A texture changes smoothly from cell to cell, even across a motif: the neighbour check may be looser.
  const stepLimit = (FROM_NEIGHBOUR[level] * (texture ? 2 : 1)) ** 2;
  const bridge = texture ? 0 : BRIDGE[level];
  const seedContrast = contrast[sy * width + sx]!;
  const contrastLimit = Math.max(4, seedContrast * CONTRAST_SHARE[level]);
  const busySeed = !texture && seedContrast > BUSY;
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const start = sy * width + sx;
  region[start] = 1;
  queue[tail++] = start;

  const close = (from: number, to: number) => {
    const a = from * 3;
    const b = to * 3;
    const dl = lab[b]! - lab[a]!;
    const da = lab[b + 1]! - lab[a + 1]!;
    const db = lab[b + 2]! - lab[a + 2]!;
    return dl * dl + da * da + db * db <= stepLimit;
  };
  const likeSeed = (cell: number) => {
    const i = cell * 3;
    const ea = lab[i + 1]! - sa;
    const eb = lab[i + 2]! - sb;
    if (texture && Math.abs(contrast[cell]! - seedContrast) > contrastLimit) return false;
    if (busySeed && contrast[cell]! < seedContrast - contrastLimit) return false;
    return Math.abs(lab[i]! - sl) <= brightnessLimit && ea * ea + eb * eb <= colourLimit;
  };
  const accept = (cell: number) => {
    region[cell] = 1;
    queue[tail++] = cell;
  };

  // From cell p one step along `step` (+-1 or +-width); `room` = how many cells there are before the photo's edge that way.
  const visit = (p: number, step: number, room: number) => {
    const q = p + step;
    if (region[q]) return;
    if (close(p, q) && likeSeed(q)) return accept(q);
    // A thin line in the way: if the same surface carries on just behind it, take the line too.
    for (let k = 1; k <= Math.min(bridge, room - 1); k++) {
      const far = p + step * (k + 1);
      if (region[far]) return;
      if (close(p, far) && likeSeed(far)) {
        for (let j = 1; j <= k + 1; j++) if (!region[p + step * j]) accept(p + step * j);
        return;
      }
    }
  };

  while (head < tail) {
    const p = queue[head++]!;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) visit(p, -1, x);
    if (x < width - 1) visit(p, 1, width - 1 - x);
    if (y > 0) visit(p, -width, y);
    if (y < height - 1) visit(p, width, height - 1 - y);
  }
  return region;
}

/** Morphological closing (grow by one cell, then shrink by one): joins the region across thin grout lines and specks. */
function closeGaps(region: Uint8Array, width: number, height: number): Uint8Array {
  const grown = new Uint8Array(region.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      grown[i] = region[i] || (x > 0 && region[i - 1]) || (x < width - 1 && region[i + 1]) || (y > 0 && region[i - width]) || (y < height - 1 && region[i + width]) ? 1 : 0;
    }
  }
  const closed = new Uint8Array(region.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // A cell at the photo's edge keeps what it had: the frame is not an edge of the surface.
      const keep = (j: number, inside: boolean) => !inside || grown[j];
      closed[i] = grown[i] && keep(i - 1, x > 0) && keep(i + 1, x < width - 1) && keep(i - width, y > 0) && keep(i + width, y < height - 1) ? 1 : 0;
      if (region[i]) closed[i] = 1;
    }
  }
  return closed;
}

/** Fills holes enclosed by the region when they are small (dirt, a drain, a light reflection), never a big object. */
function fillSmallHoles(region: Uint8Array, width: number, height: number): Uint8Array {
  let size = 0;
  for (let i = 0; i < region.length; i++) size += region[i]!;
  const maxHole = Math.max(12, Math.round(size * 0.015));
  const seen = new Uint8Array(region.length);
  const out = new Uint8Array(region);
  const stack: number[] = [];
  for (let start = 0; start < region.length; start++) {
    if (region[start] || seen[start]) continue;
    // Collect one connected hole and note whether it reaches the photo's edge (then it is outside, not a hole).
    const cells: number[] = [];
    let touchesEdge = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const p = stack.pop()!;
      cells.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of next) {
        if (q >= 0 && !region[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (!touchesEdge && cells.length <= maxHole) for (const c of cells) out[c] = 1;
  }
  return out;
}
