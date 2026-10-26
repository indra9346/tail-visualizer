import type { SurfaceType } from "../api/types";
import type { DesignPattern } from "./designPatterns";
import { SURFACES } from "./designPatterns";
import { maskBounds, maskColour, type AreaMask } from "./areaMask";
import { tilePixels } from "./tileSize";

/**
 * The free, instant "quick look": each painted area shown as if the chosen tiles were laid there, right on the room
 * photo, in the browser. Like a real installation, the old surface is fully covered (its pattern never shows through),
 * the tiles have their real proportions with grout between them, floors recede in perspective, and only the room's
 * light and shadow are kept. It is still a sketch: "Make the real photo" asks the AI for the realistic result.
 */
export interface QuickLookTile {
  image: CanvasImageSource;
  /** Real size from the catalog (width x height in mm), when known. */
  sizeMm?: string | null;
}

export interface QuickLookLayer {
  mask: AreaMask;
  surface: SurfaceType;
  pattern: DesignPattern;
  /** Loaded tile photos in slot order (at least one). */
  tiles: QuickLookTile[];
}

/** The photo's colours per grid cell (from useRoomPhoto); without them the tiles are drawn without the room's shading. */
export interface QuickLookLight {
  lab: Float32Array;
  width: number;
  height: number;
}

/** One tile of `w` x `h` px: the tile photo cropped to the tile's shape (never stretched), with grout on two edges. */
function tileCell(tile: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  const ctx = c.getContext("2d")!;
  const sw = (tile as HTMLImageElement).naturalWidth || (tile as HTMLCanvasElement).width || c.width;
  const sh = (tile as HTMLImageElement).naturalHeight || (tile as HTMLCanvasElement).height || c.height;
  const scale = Math.max(c.width / sw, c.height / sh);
  const cw = c.width / scale;
  const ch = c.height / scale;
  ctx.drawImage(tile, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  const grout = Math.max(1, Math.round(Math.min(c.width, c.height) * 0.035));
  ctx.fillStyle = "rgba(236,233,226,0.9)";
  ctx.fillRect(0, 0, c.width, grout);
  ctx.fillRect(0, 0, grout, c.height);
  return c;
}

/** The smallest block of tiles that repeats for this pattern; null = the pattern is drawn by its own rule. */
function repeatUnit(pattern: DesignPattern, tiles: CanvasImageSource[], w: number, h: number): HTMLCanvasElement | null {
  const cells = tiles.map((t) => tileCell(t, w, h));
  const at = (i: number) => cells[i % cells.length]!;
  const cw = at(0).width;
  const chh = at(0).height;
  const grid = (cols: number, rows: number, pick: (x: number, y: number) => number) => {
    const c = document.createElement("canvas");
    c.width = cols * cw;
    c.height = rows * chh;
    const ctx = c.getContext("2d")!;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) ctx.drawImage(at(pick(x, y)), x * cw, y * chh);
    return c;
  };
  switch (pattern) {
    case "checkerboard":
    case "herringbone":
    case "diagonal":
      return grid(2, 2, (x, y) => (cells.length > 1 ? (x + y) % 2 : 0));
    case "horizontal_bands":
      return grid(1, cells.length, (_x, y) => cells.length - 1 - y);
    case "vertical_stripes":
      return grid(cells.length, 1, (x) => x);
    case "random_mix": {
      let s = 7;
      const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const picks = Array.from({ length: 16 }, () => Math.floor(rnd() * cells.length));
      return grid(4, 4, (x, y) => picks[y * 4 + x]!);
    }
    case "single":
      return grid(1, 1, () => 0);
    default:
      return null;
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Fills the canvas with the pattern laid flat (a wall seen straight on), starting from the painted area's corner. */
function drawFlat(ctx: CanvasRenderingContext2D, w: number, h: number, layer: QuickLookLayer, tile: { w: number; h: number }, box: Box) {
  const images = layer.tiles.map((t) => t.image);
  const fill = (source: HTMLCanvasElement, x: number, y: number, fw: number, fh: number, rotate = false) => {
    const p = ctx.createPattern(source, "repeat");
    if (!p) return;
    if (typeof DOMMatrix !== "undefined") {
      // Whole tiles start at the area's bottom-left corner, as a tiler starts from the floor line.
      const m = new DOMMatrix().translate(box.x0, box.y1);
      p.setTransform(rotate ? m.rotate(45) : m);
    }
    ctx.fillStyle = p;
    ctx.fillRect(x, y, fw, fh);
  };
  const unit = repeatUnit(layer.pattern, images, tile.w, tile.h);
  if (unit) {
    fill(unit, 0, 0, w, h, layer.pattern === "diagonal" || layer.pattern === "herringbone");
    return;
  }
  const single = (img: CanvasImageSource) => repeatUnit("single", [img], tile.w, tile.h)!;
  const a = single(images[0]!);
  const b = single(images[1] ?? images[0]!);
  const height = box.y1 - box.y0;
  const width = box.x1 - box.x0;
  fill(a, 0, 0, w, h);
  if (layer.pattern === "dado") {
    // Lower section from the floor up to about 40 % of the wall, the upper tile above it.
    fill(b, 0, 0, w, box.y0 + height * 0.6);
  } else if (layer.pattern === "highlighter_strip") {
    if (images[2]) fill(single(images[2]), 0, 0, w, box.y0 + height * 0.4);
    fill(b, 0, box.y0 + height * 0.4, w, tile.h);
  } else if (layer.pattern === "feature_panel") {
    fill(b, box.x0 + width * 0.3, box.y0 + height * 0.2, width * 0.4, height * 0.6);
  } else if (layer.pattern === "border_frame") {
    const t = Math.min(tile.w, tile.h);
    fill(b, box.x0, box.y0, width, t);
    fill(b, box.x0, box.y1 - t, width, t);
    fill(b, box.x0, box.y0, t, height);
    fill(b, box.x1 - t, box.y0, t, height);
  }
}

/**
 * Floors recede from the camera: tiles near the top of the painted area are drawn smaller than those at the bottom.
 * The flat pattern is drawn once and then copied row by row, each row narrower the further away it is.
 */
function drawFloor(ctx: CanvasRenderingContext2D, w: number, h: number, layer: QuickLookLayer, tile: { w: number; h: number }, box: Box) {
  const far = 0.42;
  const top = Math.max(0, Math.floor(box.y0));
  const bottom = Math.min(h, Math.ceil(box.y1));
  const span = Math.max(1, bottom - top);
  const texture = document.createElement("canvas");
  texture.width = Math.ceil(w / far);
  texture.height = Math.ceil(span * 1.7) + 4;
  const t = texture.getContext("2d")!;
  drawFlat(t, texture.width, texture.height, layer, tile, { x0: 0, y0: 0, x1: texture.width, y1: texture.height });
  const band = 2;
  let v = 0;
  // From the nearest row (bottom) to the farthest (top), so whole tiles start at the near edge.
  for (let y = bottom - band; y >= top; y -= band) {
    const s = far + (1 - far) * ((y - top) / span);
    const sw = w / s;
    ctx.drawImage(texture, (texture.width - sw) / 2, Math.max(0, texture.height - 1 - v - band / s), sw, Math.max(1, band / s), 0, y, w, band);
    v += band / s;
  }
}

/** The mask as an image at grid size (the browser smooths it when it is stretched over the photo). */
function maskImage(mask: AreaMask, rgb: readonly number[] = [0, 0, 0]): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = mask.width;
  c.height = mask.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.cells.length; i++) {
    if (!mask.cells[i]) continue;
    img.data[i * 4] = rgb[0]!;
    img.data[i * 4 + 1] = rgb[1]!;
    img.data[i * 4 + 2] = rgb[2]!;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Box blur of the brightness channel, twice (close to a soft Gaussian). */
function blurBrightness(light: QuickLookLight, radius: number): Float32Array {
  const { width, height, lab } = light;
  let src = new Float32Array(width * height);
  for (let i = 0; i < src.length; i++) src[i] = lab[i * 3]!;
  const pass = (input: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(input.length);
    const len = horizontal ? width : height;
    const lines = horizontal ? height : width;
    for (let line = 0; line < lines; line++) {
      const idx = (k: number) => (horizontal ? line * width + k : k * width + line);
      let sum = 0;
      let count = 0;
      for (let k = 0; k <= Math.min(radius, len - 1); k++) {
        sum += input[idx(k)]!;
        count++;
      }
      for (let k = 0; k < len; k++) {
        out[idx(k)] = sum / count;
        const add = k + radius + 1;
        const drop = k - radius;
        if (add < len) {
          sum += input[idx(add)]!;
          count++;
        }
        if (drop >= 0) {
          sum -= input[idx(drop)]!;
          count--;
        }
      }
    }
    return out;
  };
  for (let i = 0; i < 2; i++) src = pass(pass(src, true), false);
  return src;
}

/**
 * The room's light and shadow over one painted area, as a grey image: white where the area is brightest, darker where
 * it is in shadow. It is blurred widely enough that the old surface's own pattern disappears and only the light stays.
 */
function shadingImage(light: QuickLookLight, mask: AreaMask): HTMLCanvasElement | null {
  if (light.width !== mask.width || light.height !== mask.height) return null;
  const blurred = blurBrightness(light, Math.max(3, Math.round(Math.max(light.width, light.height) / 22)));
  const inside: number[] = [];
  for (let i = 0; i < mask.cells.length; i++) if (mask.cells[i]) inside.push(blurred[i]!);
  if (inside.length === 0) return null;
  inside.sort((a, b) => a - b);
  const bright = Math.max(1, inside[Math.floor(inside.length * 0.85)]!);
  const c = document.createElement("canvas");
  c.width = mask.width;
  c.height = mask.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < blurred.length; i++) {
    // Never pitch black: a tile in shadow still shows its colour.
    const v = Math.round(255 * Math.min(1, Math.max(0.35, blurred[i]! / bright)));
    img.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Draws the quick look of every layer onto `canvas` (sized to the photo on screen). The photo itself stays underneath. */
export function drawQuickLook(canvas: HTMLCanvasElement, layers: QuickLookLayer[], light: QuickLookLight | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  for (const layer of layers) {
    const bounds = maskBounds(layer.mask);
    const alpha = maskImage(layer.mask);
    if (!bounds || !alpha || layer.tiles.length === 0) continue;
    const sx = w / layer.mask.width;
    const sy = h / layer.mask.height;
    const box = { x0: bounds.x0 * sx, y0: bounds.y0 * sy, x1: (bounds.x1 + 1) * sx, y1: (bounds.y1 + 1) * sy };
    const flat = SURFACES[layer.surface].kind === "floor";
    const tile = tilePixels(box.x1 - box.x0, (bounds.x1 - bounds.x0 + 1) / layer.mask.width, layer.surface, layer.tiles[0]!.sizeMm);

    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const o = off.getContext("2d");
    if (!o) continue;
    o.imageSmoothingEnabled = true;
    if (flat) drawFloor(o, w, h, layer, tile, box);
    else drawFlat(o, w, h, layer, tile, box);
    // The room's light and shadow, but not the old surface: the new tiles cover it completely.
    const shade = light ? shadingImage(light, layer.mask) : null;
    if (shade) {
      o.globalCompositeOperation = "multiply";
      o.drawImage(shade, 0, 0, w, h);
    }
    // Only inside the painted area.
    o.globalCompositeOperation = "destination-in";
    o.drawImage(alpha, 0, 0, w, h);
    ctx.drawImage(off, 0, 0);
  }
}

/** Draws every area's paint in its own colour (the marks the owner made), the active one stronger. */
export function drawMarks(canvas: HTMLCanvasElement, masks: Array<{ mask: AreaMask; colourIndex: number; active: boolean }>): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  for (const { mask, colourIndex, active } of masks) {
    const img = maskImage(mask, maskColour(colourIndex).rgb);
    if (!img) continue;
    ctx.globalAlpha = active ? 0.62 : 0.42;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  ctx.globalAlpha = 1;
}
