import { designSchema } from "../server/lib/validation";
import { designHash, normalizeDesign } from "../server/lib/design";
import { buildDesignPrompt } from "../server/ai/prompts/visualizationPrompt";
import { newArea, toPayload, validateDraft, type DraftArea } from "../client/src/lib/designDraft";
import {
  emptySize,
  fitTile,
  parseTileSizeMm,
  rankTiles,
  recommendPatterns,
  sizeProblem,
  sizeToDimensions,
  toMm,
} from "../client/src/lib/fitRecommend";
import { PATTERNS } from "../client/src/lib/designPatterns";
import type { DesignAreaInput, RoomAnalysis, TileCandidate } from "../server/ai/types";
import type { Tile } from "../client/src/api/types";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tile = (n: number, sizeMm: string | null, over: Partial<Tile> = {}): Tile =>
  ({ id: uuid(n), sku: `S${n}`, name: `Tile ${n}`, brand: null, category: "both", material: null, finish: null, colorFamily: null, sizeMm, pricePerSqft: null, currency: "INR", suitableRooms: [], storagePath: `x/${n}`, isActive: true, ...over }) as Tile;

describe("measurements", () => {
  test("feet and metres become millimetres; blanks, junk and impossible sizes are rejected", () => {
    expect(toMm("10", "ft")).toBe(3048);
    expect(toMm("2.4", "m")).toBe(2400);
    expect(toMm("2,4", "m")).toBe(2400);
    for (const bad of ["", "  ", "abc", "0", "0.5", "-3", "200", "9999"]) expect(toMm(bad, bad === "200" || bad === "9999" ? "m" : "ft")).toBeNull();
    expect(toMm("200", "ft")).toBeNull(); // 61 m
  });

  test("a size is optional: empty is fine, half-filled or invalid is reported, both valid becomes dimensions", () => {
    expect(sizeProblem(undefined)).toBeNull();
    expect(sizeProblem(emptySize())).toBeNull();
    expect(sizeProblem({ width: "10", height: "", unit: "ft" })).toMatch(/both measurements/i);
    expect(sizeProblem({ width: "10", height: "x", unit: "ft" })).toMatch(/both measurements/i);
    expect(sizeProblem({ width: "10", height: "8", unit: "ft" })).toBeNull();
    expect(sizeToDimensions({ width: "10", height: "8", unit: "ft" })).toEqual({ widthMm: 3048, heightMm: 2438 });
    expect(sizeToDimensions({ width: "10", height: "", unit: "ft" })).toBeNull();
  });

  test("an invalid size blocks only that area in the Design Studio; a valid one is sent as dimensions in mm", () => {
    const a: DraftArea = { ...newArea("wall", "Back wall"), slots: [tile(1, "600x600")], size: { width: "10", height: "", unit: "ft" } };
    expect(Object.keys(validateDraft([a]))).toEqual([a.key]);
    const ok: DraftArea = { ...a, size: { width: "3", height: "2.4", unit: "m" } };
    expect(validateDraft([ok])).toEqual({});
    expect(toPayload([ok]).areas[0]!.dimensions).toEqual({ widthMm: 3000, heightMm: 2400 });
    expect(toPayload([{ ...a, size: undefined }]).areas[0]).not.toHaveProperty("dimensions");
  });
});

describe("tile size parsing", () => {
  test.each([
    ["600x600", { w: 600, h: 600 }],
    ["600 x 1200", { w: 600, h: 1200 }],
    ["300×600 mm", { w: 300, h: 600 }],
    ["800*800", { w: 800, h: 800 }],
    ["24x48", null], // too small to be millimetres, and we do not guess inches
    ["", null],
    ["big", null],
    [null, null],
    ["5000x5000", null],
  ])("%s", (input, expected) => {
    expect(parseTileSizeMm(input as string | null)).toEqual(expected);
  });
});

describe("best-fit tiles", () => {
  test("a tile that divides the wall exactly wastes (almost) nothing and beats one that leaves a sliver", () => {
    const good = fitTile(tile(1, "600x600"), 3000, 2400)!; // 5 x 4 pieces, ignoring joints
    const bad = fitTile(tile(2, "600x600"), 3050, 2450)!; // slivers of ~50mm
    expect(good.pieces).toBeGreaterThan(0);
    expect(good.wastePct).toBeLessThan(bad.wastePct + 10);
    const ranked = rankTiles([tile(2, "600x600"), tile(1, "300x600")], "wall", 3000, 2400);
    expect(ranked.length).toBe(2);
    expect(ranked[0]!.score).toBeGreaterThanOrEqual(ranked[1]!.score);
  });

  test("tiles bigger than the surface, without a usable size, hidden, or of the wrong category are never offered", () => {
    const tiles = [
      tile(1, "1200x2400"),
      tile(2, null),
      tile(3, "600x600", { isActive: false }),
      tile(4, "600x600", { category: "floor" }),
      tile(5, "600x600", { category: "wall" }),
      tile(6, "600x600", { category: "both" }),
    ];
    const wall = rankTiles(tiles, "wall", 1500, 1500, { limit: 10 }).map((f) => f.tile.id);
    expect(wall).toEqual(expect.arrayContaining([uuid(5), uuid(6)]));
    for (const excluded of [1, 2, 3, 4]) expect(wall).not.toContain(uuid(excluded));
    const floor = rankTiles(tiles, "floor", 1500, 1500, { limit: 10 }).map((f) => f.tile.id);
    expect(floor).toContain(uuid(4));
    expect(floor).not.toContain(uuid(5));
  });

  test("the rotated orientation is used when it fits better", () => {
    const f = fitTile(tile(1, "300x600"), 1200, 3000)!;
    expect(f.tw * f.th).toBe(180000);
    expect(f.cols * f.rows).toBe(f.pieces);
  });

  test("room suitability and the AI's own recommendation lift a tile; the limit is respected", () => {
    const a = tile(1, "600x600", { suitableRooms: ["kitchen"] });
    const b = tile(2, "600x600", { suitableRooms: ["bathroom"] });
    expect(rankTiles([a, b], "wall", 3000, 2400, { roomType: "bathroom" })[0]!.tile.id).toBe(b.id);
    expect(rankTiles([a, b], "wall", 3000, 2400, { roomType: "bathroom", recommendedIds: new Set([a.id]) })[0]!.tile.id).toBe(a.id);
    const many = Array.from({ length: 6 }, (_, i) => tile(10 + i, "600x600"));
    expect(rankTiles(many, "wall", 3000, 2400)).toHaveLength(3);
    expect(rankTiles(many, "wall", 3000, 2400, { limit: 5 })).toHaveLength(5);
  });
});

describe("pattern suggestions", () => {
  test("a washroom wall suggests a dado; a tall wall a highlighter strip; every suggestion is a real pattern, at most 3, no repeats", () => {
    const wall = recommendPatterns("wall", { widthMm: 2400, heightMm: 2700 }, "bathroom");
    expect(wall[0]!.pattern).toBe("dado");
    expect(wall.map((s) => s.pattern)).toContain("highlighter_strip");
    for (const s of ["wall", "floor", "backsplash", "shower_wall", "step_tread", "step_riser"] as const) {
      for (const size of [null, { widthMm: 1200, heightMm: 900 }, { widthMm: 6000, heightMm: 3000 }]) {
        const out = recommendPatterns(s, size, "kitchen");
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(3);
        expect(new Set(out.map((o) => o.pattern)).size).toBe(out.length);
        for (const o of out) {
          expect(PATTERNS[o.pattern]).toBeDefined();
          expect(o.reason.length).toBeGreaterThan(10);
        }
      }
    }
  });

  test("a small floor suggests one large tile; a large floor a checkerboard or diagonal; a backsplash a herringbone", () => {
    expect(recommendPatterns("floor", { widthMm: 1500, heightMm: 1800 })[0]!.pattern).toBe("single");
    expect(recommendPatterns("floor", { widthMm: 4000, heightMm: 3500 })[0]!.pattern).toBe("checkerboard");
    expect(recommendPatterns("backsplash", null)[0]!.pattern).toBe("herringbone");
  });
});

describe("server: optional measured size", () => {
  const area = (over: Record<string, unknown> = {}) => ({ surface: "wall", location: "Back wall", pattern: "single", tileIds: [uuid(1)], ...over });

  test("accepts a sensible size, and none at all", () => {
    expect(designSchema.safeParse({ areas: [area({ dimensions: { widthMm: 3000, heightMm: 2400 } })] }).success).toBe(true);
    expect(designSchema.safeParse({ areas: [area()] }).success).toBe(true);
  });

  test.each([
    ["too small", { widthMm: 100, heightMm: 2400 }],
    ["too large", { widthMm: 3000, heightMm: 99999 }],
    ["not whole mm", { widthMm: 3000.5, heightMm: 2400 }],
    ["missing a side", { widthMm: 3000 }],
    ["an extra field", { widthMm: 3000, heightMm: 2400, depth: 5 }],
    ["text", { widthMm: "3000", heightMm: 2400 }],
  ])("rejects: %s", (_n, dimensions) => {
    expect(designSchema.safeParse({ areas: [area({ dimensions })] }).success).toBe(false);
  });

  test("stored on the normalized design and part of the retry fingerprint only when given", () => {
    const withSize = normalizeDesign({ design: designSchema.parse({ areas: [area({ dimensions: { widthMm: 3000, heightMm: 2400 } })] }) });
    const without = normalizeDesign({ design: designSchema.parse({ areas: [area()] }) });
    expect(withSize.areas[0]!.dimensions).toEqual({ widthMm: 3000, heightMm: 2400 });
    expect(without.areas[0]).not.toHaveProperty("dimensions");
    expect(designHash(withSize)).not.toBe(designHash(without));
    const other = normalizeDesign({ design: designSchema.parse({ areas: [area({ dimensions: { widthMm: 3000, heightMm: 2700 } })] }) });
    expect(designHash(other)).not.toBe(designHash(withSize));
  });

  test("the prompt carries the measurement (walls: wide x high, floors: long x deep) and nothing when absent", () => {
    const analysis = { roomType: "bathroom", constructionState: "unfinished", perspective: "angled", lighting: "artificial", doorCount: 0, windowCount: 0, fixtures: [] } as unknown as RoomAnalysis;
    const t = { id: uuid(1), sku: "s", name: "Marble", brand: null, category: "both", material: null, finish: null, colorFamily: null, sizeMm: "600x600", pricePerSqft: null, suitableRooms: [], storagePath: "p", isActive: true } as TileCandidate;
    const wallArea: DesignAreaInput = { surface: "wall", location: "All walls", pattern: "single", tiles: [t], dimensions: { widthMm: 3000, heightMm: 2400 } };
    const floorArea: DesignAreaInput = { surface: "floor", location: "Entire floor", pattern: "single", tiles: [t], dimensions: { widthMm: 3600, heightMm: 2400 } };
    const p = buildDesignPrompt(analysis, [wallArea, floorArea], null, "REQ-fixed");
    expect(p).toContain("Measured size of this area: about 3000 mm wide by 2400 mm high");
    expect(p).toContain("Measured size of this area: about 3600 mm long by 2400 mm deep");
    expect(buildDesignPrompt(analysis, [{ ...wallArea, dimensions: undefined }], null, "REQ-fixed")).not.toContain("Measured size");
  });
});
