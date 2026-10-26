import sharp from "sharp";
import * as serverMask from "../server/ai/areaMask";
import * as clientMask from "../client/src/lib/areaMask";
import { GUIDE_COLOURS, buildGuideImage } from "../server/ai/guideImage";
import { buildDesignPrompt } from "../server/ai/prompts/visualizationPrompt";
import { generationKey } from "../server/ai/generateVisualization";
import { designSchema, generateVisualizationBodySchema } from "../server/lib/validation";
import { designHash, normalizeDesign } from "../server/lib/design";
import {
  clearQuickDraft,
  editPathFor,
  isQuickDesign,
  loadQuickDraft,
  newQuickArea,
  quickFromDesign,
  quickIssues,
  quickLocation,
  saveQuickDraft,
  toQuickPayload,
  withQuickPattern,
  withTile,
  type QuickArea,
} from "../client/src/lib/quickDesign";
import type { DesignAreaInput, RoomAnalysis, TileCandidate } from "../server/ai/types";
import type { Tile } from "../client/src/api/types";

/**
 * The easy visualizer: the owner paints where each area is on the photo, and the painting reaches the AI as a guide
 * image. These tests cover the shared mask format (UI and server must agree byte for byte), "tap to colour", the
 * request rules, the guide image and the prompt wording, and the UI's design model.
 */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A mask painted over a rectangle of the grid (inclusive cell coordinates). */
function rect(width: number, height: number, x0: number, y0: number, x1: number, y1: number): clientMask.AreaMask {
  const m = clientMask.emptyMask(width, height);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.cells[y * width + x] = 1;
  return m;
}

/** A deterministic pseudo-random painting, for checking the two codecs against each other. */
function speckled(width: number, height: number, seed: number): clientMask.AreaMask {
  const m = clientMask.emptyMask(width, height);
  let s = seed;
  for (let i = 0; i < m.cells.length; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    m.cells[i] = s % 7 < 3 ? 1 : 0;
  }
  return m;
}

describe("mask format: the UI and the server agree exactly", () => {
  test.each([
    ["one painted block", rect(64, 48, 10, 30, 50, 47)],
    ["painted from the very first cell", rect(16, 16, 0, 0, 3, 3)],
    ["painted to the very last cell", rect(16, 16, 12, 12, 15, 15)],
    ["random speckles", speckled(64, 48, 7)],
    ["portrait photo grid", speckled(36, 64, 3)],
  ])("%s: same text from both, and it decodes back to the same cells", (_name, mask) => {
    const text = clientMask.encodeMask(mask);
    expect(serverMask.encodeMask(mask)).toBe(text);
    const back = serverMask.decodeMask(text)!;
    expect(back.width).toBe(mask.width);
    expect(back.height).toBe(mask.height);
    expect(Array.from(back.cells)).toEqual(Array.from(mask.cells));
    expect(clientMask.decodeMask(text)).toEqual(back);
  });

  test.each([
    ["not a mask", "hello"],
    ["runs do not add up", "16x16:5.5"],
    ["grid too small", "4x4:2.14"],
    ["grid too large", "300x10:a.b"],
    ["a zero run after the first", "16x16:0.0.100"],
    ["uppercase digits", "16x16:A.70"],
    ["over the size cap", `16x16:${"1.".repeat(30000)}1`],
  ])("rejects %s, the same on both sides", (_name, text) => {
    expect(serverMask.decodeMask(text)).toBeNull();
    expect(clientMask.decodeMask(text)).toBeNull();
  });

  test("the UI paints in the same colours the server shows the AI", () => {
    expect(clientMask.MASK_COLOURS.map((c) => c.rgb)).toEqual(GUIDE_COLOURS.map((c) => c.rgb));
    expect(clientMask.MASK_MAX_SIDE).toBe(serverMask.MASK_MAX_SIDE);
    expect(clientMask.MASK_MAX_CHARS).toBe(serverMask.MASK_MAX_CHARS);
  });

  test("a painting too ragged to send is smoothed until it fits, and stays painted", () => {
    const ragged = speckled(256, 192, 11);
    expect(clientMask.encodeMask(ragged).length).toBeGreaterThan(clientMask.MASK_MAX_CHARS);
    const fitted = clientMask.fitMask(ragged);
    expect(clientMask.encodeMask(fitted).length).toBeLessThanOrEqual(clientMask.MASK_MAX_CHARS);
    expect(serverMask.decodeMask(clientMask.encodeMask(fitted))).not.toBeNull();
    // A normal painting is sent exactly as painted.
    const plain = rect(256, 192, 10, 10, 200, 150);
    expect(clientMask.fitMask(plain)).toBe(plain);
  });

  test("the grid follows the photo's shape, 256 cells on its long side", () => {
    expect(clientMask.maskGrid(4000, 3000)).toEqual({ width: 256, height: 192 });
    expect(clientMask.maskGrid(1080, 1920)).toEqual({ width: 144, height: 256 });
    expect(clientMask.maskGrid(5000, 100)).toEqual({ width: 256, height: 8 });
  });
});

describe("painting with a finger", () => {
  test("a stroke leaves no gaps, even when the finger moves fast", () => {
    const m = clientMask.emptyMask(100, 20);
    clientMask.paintSegment(m, 2, 10, 97, 10, 3, 1);
    for (let x = 2; x <= 97; x++) expect(m.cells[10 * 100 + x]).toBe(1);
  });

  test("the eraser takes paint away", () => {
    const m = rect(40, 40, 0, 0, 39, 39);
    clientMask.paintDisc(m, 20, 20, 5, 0);
    expect(m.cells[20 * 40 + 20]).toBe(0);
    expect(m.cells[0]).toBe(1);
  });

  test("bounds and counts", () => {
    const m = rect(32, 32, 4, 6, 9, 20);
    expect(clientMask.maskBounds(m)).toEqual({ x0: 4, y0: 6, x1: 9, y1: 20 });
    expect(clientMask.paintedCount(m)).toBe(6 * 15);
    expect(clientMask.maskBounds(clientMask.emptyMask(8, 8))).toBeNull();
  });
});

describe("tap to colour", () => {
  /** A grid "photo" whose colour at each cell comes from `colour(x, y)`. */
  function photo(width: number, height: number, colour: (x: number, y: number) => [number, number, number]) {
    const px = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const [r, g, b] = colour(x, y);
        px.set([r, g, b, 255], (y * width + x) * 4);
      }
    return clientMask.toLab(px, width * height);
  }
  const count = (r: Uint8Array) => r.reduce((a, b) => a + b, 0);

  test("a tap on the wall colours the wall and stops at the floor", () => {
    // Top 60 % a cream wall, bottom 40 % a dark grey floor.
    const lab = photo(80, 60, (_x, y) => (y < 36 ? [235, 225, 205] : [70, 70, 75]));
    const wall = clientMask.growRegion(lab, 80, 60, 40, 10);
    expect(count(wall)).toBe(80 * 36);
    const floor = clientMask.growRegion(lab, 80, 60, 40, 50);
    expect(count(floor)).toBe(80 * 24);
  });

  test("soft light and shade across a wall does not stop the fill, but a different material does", () => {
    // The wall darkens slowly from left to right (a lamp on the left); a blue door on the right.
    const lab = photo(100, 50, (x) => (x >= 85 ? [40, 70, 160] : [Math.round(240 - x * 0.9), Math.round(232 - x * 0.9), Math.round(215 - x * 0.9)]));
    const wall = clientMask.growRegion(lab, 100, 50, 5, 25);
    expect(count(wall)).toBe(85 * 50);
  });

  test("thin grout lines and a small speck inside the floor are filled in; a big object is left out", () => {
    const lab = photo(90, 60, (x, y) => {
      if (x >= 30 && x < 50 && y >= 20 && y < 45) return [250, 250, 250]; // a white toilet / cabinet
      if (x === 70 && y === 10) return [20, 20, 20]; // one dark speck
      if (x % 10 === 0) return [150, 150, 150]; // grout lines every 10 cells
      return [190, 160, 120];
    });
    const floor = clientMask.growRegion(lab, 90, 60, 15, 5);
    expect(floor[10 * 90 + 70]).toBe(1); // the speck
    expect(floor[5 * 90 + 20]).toBe(1); // a grout line
    expect(floor[30 * 90 + 40]).toBe(0); // the object
  });

  test("a busy patterned wall (black and white motifs) is coloured as one surface, and stops at the plain wall and the floor", () => {
    // Columns 0-39: existing patterned tiles, 4-cell black and white squares. Columns 40-79: a plain cream wall. Rows 36+: floor.
    const lab = photo(80, 60, (x, y) => {
      if (y >= 36) return [120, 85, 60];
      if (x >= 40) return [240, 232, 214];
      return (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? [245, 245, 245] : [25, 25, 25];
    });
    const wall = clientMask.growRegion(lab, 80, 60, 2, 2); // a tap on one white square
    let inPattern = 0;
    let outside = 0;
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 80; x++) {
        if (!wall[y * 80 + x]) continue;
        if (x < 40 && y < 36) inPattern++;
        else outside++;
      }
    // Most of the patterned wall, and at most a thin seam beyond its edges (the AI snaps to the real edge).
    expect(inPattern).toBeGreaterThan(40 * 36 * 0.85);
    expect(outside).toBeLessThan(40 * 36 * 0.08);
    // A plain surface is still filled by its colour, exactly.
    expect(count(clientMask.growRegion(lab, 80, 60, 60, 10))).toBe(40 * 36);
  });

  test("'More' spreads further than 'Less' on a surface with a clear colour drift", () => {
    const lab = photo(120, 20, (x) => [Math.round(230 - x * 1.4), Math.round(220 - x * 1.4), Math.round(200 - x * 1.4)]);
    const less = count(clientMask.growRegion(lab, 120, 20, 2, 10, 1));
    const more = count(clientMask.growRegion(lab, 120, 20, 2, 10, 5));
    expect(more).toBeGreaterThan(less);
  });

  test("a tap outside the grid is clamped onto it instead of failing", () => {
    const lab = photo(20, 20, () => [200, 200, 200]);
    expect(count(clientMask.growRegion(lab, 20, 20, -5, 99))).toBe(400);
  });
});

describe("request rules for marked areas", () => {
  const wallMask = serverMask.encodeMask(rect(64, 48, 0, 0, 63, 27));
  const floorMask = serverMask.encodeMask(rect(64, 48, 0, 28, 63, 47));
  const area = (over: Record<string, unknown>) => ({ surface: "wall", location: "Marked wall", pattern: "single", tileIds: [uuid(1)], ...over });

  test("accepts a marked wall plus a marked floor", () => {
    const r = designSchema.safeParse({ areas: [area({ mask: wallMask }), area({ surface: "floor", location: "Marked floor", tileIds: [uuid(2)], mask: floorMask })] });
    expect(r.success).toBe(true);
  });

  test.each([
    ["a mask that cannot be read", area({ mask: "16x16:5.5" })],
    ["an empty mask (nothing painted)", area({ mask: clientMask.encodeMask(clientMask.emptyMask(16, 16)) })],
  ])("rejects %s", (_name, bad) => {
    expect(designSchema.safeParse({ areas: [bad] }).success).toBe(false);
  });

  test("rejects two areas painted on the same spot, and masks from two different photos", () => {
    const overlapping = serverMask.encodeMask(rect(64, 48, 0, 20, 63, 47));
    const clash = designSchema.safeParse({ areas: [area({ mask: wallMask }), area({ surface: "floor", location: "Marked floor", tileIds: [uuid(2)], mask: overlapping })] });
    expect(clash.success).toBe(false);
    expect(JSON.stringify(clash.error?.issues)).toContain("same spot");
    const otherPhoto = serverMask.encodeMask(rect(48, 64, 0, 0, 10, 10));
    expect(designSchema.safeParse({ areas: [area({ mask: wallMask }), area({ surface: "floor", location: "Marked floor", tileIds: [uuid(2)], mask: otherPhoto })] }).success).toBe(false);
  });

  test("marking an area differently is a different design (its own retries and picture); an unmarked design hashes as before", () => {
    const hash = (mask?: string) => designHash(normalizeDesign({ design: designSchema.parse({ areas: [area(mask ? { mask } : {})] }) }));
    expect(hash(wallMask)).not.toBe(hash(floorMask));
    expect(hash(wallMask)).not.toBe(hash());
    // Without masks the hash input is exactly the pre-existing shape.
    const plain = normalizeDesign({ design: designSchema.parse({ areas: [area({})] }) });
    expect(plain.areas[0]).not.toHaveProperty("mask");
  });

  test("the mask is kept on the stored design", () => {
    const n = normalizeDesign({ design: designSchema.parse({ areas: [area({ mask: wallMask })] }) });
    expect(n.areas[0]!.mask).toBe(wallMask);
  });
});

describe("guide image", () => {
  async function greyRoom(width: number, height: number) {
    return { buffer: await sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } } }).jpeg().toBuffer(), mimeType: "image/jpeg" };
  }
  async function pixel(buffer: Buffer, x: number, y: number) {
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * info.channels;
    return [data[i]!, data[i + 1]!, data[i + 2]!] as [number, number, number];
  }

  test("paints area 1 red and area 2 blue on a copy of the photo, same size, and leaves the rest untouched", async () => {
    const room = await greyRoom(400, 300);
    const left = serverMask.encodeMask(rect(64, 48, 0, 0, 20, 47));
    const right = serverMask.encodeMask(rect(64, 48, 44, 0, 63, 47));
    const guide = await buildGuideImage(room, [{ mask: left }, { mask: right }]);
    expect(guide).not.toBeNull();
    const meta = await sharp(guide!.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
    const [lr, lg, lb] = await pixel(guide!.buffer, 40, 150);
    expect(lr).toBeGreaterThan(lg + 60);
    expect(lr).toBeGreaterThan(lb + 60);
    const [rr, , rb] = await pixel(guide!.buffer, 370, 150);
    expect(rb).toBeGreaterThan(rr + 60);
    const middle = await pixel(guide!.buffer, 200, 150);
    for (const c of middle) expect(Math.abs(c - 128)).toBeLessThan(12);
  });

  test("no marked areas: no guide image", async () => {
    expect(await buildGuideImage(await greyRoom(64, 48), [{}, { mask: null }])).toBeNull();
  });

  test("an area's colour is its position in the design, even when an earlier area is unmarked", async () => {
    const room = await greyRoom(200, 100);
    const guide = await buildGuideImage(room, [{}, { mask: serverMask.encodeMask(rect(64, 32, 0, 0, 63, 31)) }]);
    const [r, , b] = await pixel(guide!.buffer, 100, 50);
    expect(b).toBeGreaterThan(r + 60); // area 2 = blue
  });
});

describe("prompt with a guide image", () => {
  const analysis = { roomType: "bathroom", constructionState: "unfinished", perspective: "angled", lighting: "artificial", doorCount: 1, windowCount: 0, fixtures: ["toilet"] } as unknown as RoomAnalysis;
  const tile = (n: number, name: string): TileCandidate => ({ id: uuid(n), sku: `S${n}`, name, brand: null, category: "both", material: "ceramic", finish: "matte", colorFamily: null, sizeMm: "600x600", pricePerSqft: null, suitableRooms: [], storagePath: `o/${n}.jpg`, isActive: true });
  const mask = serverMask.encodeMask(rect(64, 48, 0, 0, 63, 20));
  const marked: DesignAreaInput[] = [
    { surface: "floor", location: "Entire floor", pattern: "single", tiles: [tile(1, "Grey Stone")] },
    { surface: "wall", location: "Marked wall", pattern: "single", tiles: [tile(2, "Ivory")], mask },
  ];

  test("the guide is image 2, the tiles move to image 3 onwards, and the marked area is found by its colour", () => {
    const p = buildDesignPrompt(analysis, marked, null, "REQ-x", undefined, "open", true);
    expect(p).toContain("You are given 4 images");
    expect(p).toContain("GUIDE IMAGE (image 2)");
    expect(p).toContain("BLUE = AREA 2");
    expect(p).toMatch(/TILE A \(image 3\).*Grey Stone/);
    expect(p).toMatch(/TILE B \(image 4\).*Ivory/);
    expect(p).toContain("AREA 2: ONLY the region painted BLUE in the GUIDE IMAGE");
    expect(p).toContain("AREA 2 is the region painted BLUE in the guide image");
    expect(p).toContain("Never copy its paint colours into the result");
    expect(p).toContain("None of the guide image's paint colours appear anywhere in the result");
    // The unmarked floor is still the whole floor; the marked wall is not "the walls" in general.
    expect(p).toContain("AREA 1: the floor");
    expect(p).toMatch(/OUTPUT: .*the floor and only the region painted BLUE in the guide image/);
    expect(p).not.toContain("ONLY the wall surface named by the label below");
  });

  test("the AI is told to show a real installation, never a filter over the old surface", () => {
    const p = buildDesignPrompt(analysis, marked, null, "REQ-x");
    expect(p).toContain("REAL INSTALLATION, NOT A FILTER");
    expect(p).toContain("completely removed and covered");
    expect(p).toContain("Never a transparent overlay, a colour tint");
    expect(p).toContain("cut tiles only where the area ends");
    expect(p).toContain("No trace of the old surface");
  });

  test("without the guide image attached, masks are ignored and nothing mentions a guide", () => {
    const p = buildDesignPrompt(analysis, marked, null, "REQ-x", undefined, "open", false);
    expect(p).toContain("You are given 3 images");
    expect(p).not.toMatch(/guide/i);
    expect(p).toMatch(/TILE A \(image 2\)/);
  });

  test("two marked walls are told apart by colour, not by the shared-surface name rule", () => {
    const two: DesignAreaInput[] = [
      { surface: "wall", location: "Marked wall", pattern: "single", tiles: [tile(1, "A")], mask },
      { surface: "wall", location: "Marked wall 2", pattern: "single", tiles: [tile(2, "B")], mask: serverMask.encodeMask(rect(64, 48, 0, 30, 63, 47)) },
    ];
    const p = buildDesignPrompt(analysis, two, null, "REQ-x");
    expect(p).toContain("AREA 1: ONLY the region painted RED");
    expect(p).toContain("AREA 2: ONLY the region painted BLUE");
    expect(p).not.toContain("Shared surfaces:");
    expect(p).toContain("only the regions painted RED, BLUE in the guide image");
  });

  test("the same design marked differently gets a different seed", () => {
    const base = { requirements: null, layout: "open" as const, roomType: undefined, context: { roomUploadId: "r", visualizationId: "v", generationJobId: "j" } };
    const a = generationKey({ ...base, areas: marked });
    const b = generationKey({ ...base, areas: [marked[0]!, { ...marked[1]!, mask: serverMask.encodeMask(rect(64, 48, 0, 0, 63, 30)) }] });
    expect(a.seed).not.toBe(b.seed);
    expect(generationKey({ ...base, areas: marked }).seed).toBe(a.seed);
  });
});

describe("the easy visualizer's design model", () => {
  const tile = (n: number, category: Tile["category"] = "both", over: Partial<Tile> = {}): Tile => ({
    id: uuid(n),
    sku: `S${n}`,
    name: `Tile ${n}`,
    brand: null,
    category,
    material: null,
    finish: null,
    colorFamily: null,
    sizeMm: "600x600",
    pricePerSqft: null,
    currency: "INR",
    suitableRooms: [],
    storagePath: `o/${n}.jpg`,
    isActive: true,
    ...over,
  });
  const marked = (surface: QuickArea["surface"], y0: number, y1: number, t: Tile): QuickArea => ({ ...withTile(newQuickArea(surface), 0, t), mask: rect(64, 48, 0, y0, 63, y1) });

  test("names: an unmarked area covers the whole surface, marked ones are numbered per surface", () => {
    const floor = withTile(newQuickArea("floor"), 0, tile(1));
    const w1 = marked("wall", 0, 10, tile(2));
    const w2 = marked("wall", 11, 20, tile(3));
    const areas = [floor, w1, w2];
    expect(areas.map((a) => quickLocation(areas, a))).toEqual(["Entire floor", "Marked wall", "Marked wall 2"]);
  });

  test("what the server receives passes its real request schema", () => {
    const areas = [withTile(newQuickArea("floor"), 0, tile(1)), marked("wall", 0, 20, tile(2)), marked("backsplash", 21, 30, tile(3))];
    expect(quickIssues(areas)).toEqual({});
    const payload = toQuickPayload(areas);
    const parsed = generateVisualizationBodySchema.safeParse({ roomUploadId: uuid(99), design: payload, requirements: "" });
    expect(parsed.success).toBe(true);
    expect(payload.areas[0]).not.toHaveProperty("mask");
    expect(typeof payload.areas[1]!.mask).toBe("string");
  });

  test("two areas of one surface must both be marked; a missing tile and a wrong tile are said plainly", () => {
    const issues = quickIssues([withTile(newQuickArea("wall"), 0, tile(1)), marked("wall", 0, 10, tile(2))]);
    expect(Object.values(issues).flat().join(" ")).toContain("paint where this one is");
    const noTile = quickIssues([newQuickArea("floor")]);
    expect(Object.values(noTile).flat()).toContain("Pick a tile for the floor.");
    const wrong = quickIssues([withTile(newQuickArea("floor"), 0, tile(4, "wall"))]);
    expect(Object.values(wrong).flat().join(" ")).toContain("can't go on a floor");
    expect(quickIssues([])["_"]).toEqual(["Choose what you want to tile."]);
  });

  test("a two-tile style asks for both tiles; switching style keeps the tiles already picked", () => {
    let area = withQuickPattern(withTile(newQuickArea("floor"), 0, tile(1)), "checkerboard");
    expect(Object.values(quickIssues([area])).flat()[0]).toMatch(/^Pick 2 tiles/);
    area = withTile(area, 1, tile(2));
    expect(quickIssues([area])).toEqual({});
    expect(withQuickPattern(area, "single").slots.map((t) => t?.id)).toEqual([uuid(1)]);
    // The same tile picked for the second slot moves there instead of being in both.
    expect(withTile(area, 1, tile(1)).slots.map((t) => t?.id ?? null)).toEqual([null, uuid(1)]);
  });

  test("a generated design reopens with its marks and tiles; only painted designs open in the easy visualizer", () => {
    const areas = [withTile(newQuickArea("floor"), 0, tile(1)), marked("wall", 0, 20, tile(2))];
    const design = { areas: toQuickPayload(areas).areas.map((a) => ({ ...a, patternNote: null })) };
    const back = quickFromDesign(design, [tile(1), tile(2)])!;
    expect(back.map((a) => [a.surface, a.mask ? clientMask.paintedCount(a.mask) : 0, a.slots[0]?.id])).toEqual([
      ["floor", 0, uuid(1)],
      ["wall", 64 * 21, uuid(2)],
    ]);
    expect(isQuickDesign(design)).toBe(true);
    expect(editPathFor(design, "room-1")).toBe("/visualize/room-1");
    const studio = { layout: "c_shape" as const, areas: [{ surface: "wall" as const, location: "C1 (left wall)", wall: "C1" as const, pattern: "single" as const, patternNote: null, tileIds: [uuid(1)] }] };
    expect(editPathFor(studio, "room-1")).toBe("/tiles/room-1");
    expect(editPathFor(null, "room-1")).toBe("/tiles/room-1");
  });

  test("the unfinished design survives a refresh, marks included", () => {
    const data = new Map<string, string>();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k) };
    try {
      saveQuickDraft("room-1", { areas: [marked("wall", 5, 9, tile(2))], note: "dark grout" });
      const back = loadQuickDraft("room-1")!;
      expect(back.note).toBe("dark grout");
      expect(back.areas[0]!.surface).toBe("wall");
      expect(clientMask.paintedCount(back.areas[0]!.mask!)).toBe(64 * 5);
      expect(back.areas[0]!.slots[0]!.id).toBe(uuid(2));
      clearQuickDraft("room-1");
      expect(loadQuickDraft("room-1")).toBeNull();
    } finally {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    }
  });
});

describe("quick look tile sizes (real proportions, believable count)", () => {
  const { parseTileSize, tilePixels } = require("../client/src/lib/tileSize") as typeof import("../client/src/lib/tileSize");

  test("reads the catalog's size text", () => {
    expect(parseTileSize("600x600")).toEqual([600, 600]);
    expect(parseTileSize("300 x 600 mm")).toEqual([300, 600]);
    expect(parseTileSize("200*1200")).toEqual([200, 1200]);
    expect(parseTileSize("big")).toBeNull();
    expect(parseTileSize(null)).toBeNull();
  });

  test("a 600x600 floor tile across a floor the width of the photo: 5 square tiles across", () => {
    const t = tilePixels(1000, 1, "floor", "600x600");
    expect(t.w).toBeCloseTo(200);
    expect(t.h).toBeCloseTo(200);
  });

  test("a 300x600 wall tile is drawn twice as tall as wide; unknown sizes use a common tile", () => {
    const t = tilePixels(800, 0.5, "wall", "300x600");
    expect(t.h).toBeCloseTo(t.w * 2);
    const unknown = tilePixels(800, 0.5, "wall", null);
    expect(unknown).toEqual(t);
  });

  test("never fewer than 2 or more than 30 tiles across", () => {
    expect(tilePixels(1000, 1, "floor", "1200x2400").w).toBeCloseTo(1000 / 2.5);
    expect(tilePixels(1000, 1, "wall", "25x25").w).toBeCloseTo(1000 / 30);
  });
});
