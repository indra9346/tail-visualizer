import { DESIGN_PATTERNS as SERVER_IDS, PATTERN_SPECS } from "../server/ai/designPatterns";
import { SURFACE_TYPES, surfaceKind } from "../server/ai/types";
import { DESIGN_PATTERNS as CLIENT_IDS, PATTERNS, SURFACES, isValidLabel } from "../client/src/lib/designPatterns";
import { MAX_AREAS, chosenTiles, newArea, toPayload, validateDraft, withPattern, type DraftArea } from "../client/src/lib/designDraft";
import { designHash, normalizeDesign } from "../server/lib/design";
import { designSchema, generateVisualizationBodySchema, designAreaSchema } from "../server/lib/validation";
import { buildDesignPrompt, distinctTileIds } from "../server/ai/prompts/visualizationPrompt";
import type { DesignAreaInput, RoomAnalysis, TileCandidate } from "../server/ai/types";
import type { Tile } from "../client/src/api/types";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("pattern library: the UI mirror cannot drift from the server", () => {
  test("same pattern ids, in the same order", () => {
    expect([...CLIENT_IDS]).toEqual([...SERVER_IDS]);
  });

  test.each([...SERVER_IDS])("%s: min, max and roles match", (id) => {
    const server = PATTERN_SPECS[id];
    const client = PATTERNS[id];
    expect(client.min).toBe(server.min);
    expect(client.max).toBe(server.max);
    expect(client.roles).toEqual(server.roles);
    expect(server.roles.length).toBeGreaterThanOrEqual(server.max);
    expect(server.min).toBeGreaterThanOrEqual(1);
  });

  test("every surface is known to the UI with the same floor/wall kind the server uses", () => {
    expect(Object.keys(SURFACES).sort()).toEqual([...SURFACE_TYPES].sort());
    for (const s of SURFACE_TYPES) expect(SURFACES[s].kind).toBe(surfaceKind(s));
  });

  test("the UI label rule and the server label rule agree", () => {
    const samples = ["Back wall", "Wall behind basin (left)", "x".repeat(80), "x".repeat(81), 'a"b', "a<b>", "line\nbreak ok", "-----REQ-----", "फर्श"];
    for (const sample of samples) {
      const serverOk = designAreaSchema.safeParse({ surface: "wall", location: sample, pattern: "single", tileIds: [uuid(1)] }).success;
      expect(isValidLabel(sample, 80)).toBe(serverOk);
    }
  });
});

describe("design schema", () => {
  const area = (over: Record<string, unknown> = {}) => ({ surface: "wall", location: "Back wall", pattern: "dado", tileIds: [uuid(1), uuid(2)], ...over });

  test("accepts a realistic washroom design", () => {
    const r = designSchema.safeParse({
      areas: [area({ patternNote: "dado up to 4 ft" }), { surface: "floor", location: "Entire floor", pattern: "checkerboard", tileIds: [uuid(3), uuid(4)] }],
    });
    expect(r.success).toBe(true);
  });

  test.each([
    ["too few tiles for the pattern", area({ tileIds: [uuid(1)] })],
    ["too many tiles for the pattern", area({ tileIds: [uuid(1), uuid(2), uuid(3)] })],
    ["unknown pattern", area({ pattern: "zigzag" })],
    ["unknown surface", area({ surface: "ceiling" })],
    ["non-uuid tile id", area({ tileIds: ["nope", uuid(2)] })],
    ["extra field (strict)", { ...area(), price: 1 }],
  ])("rejects: %s", (_name, bad) => {
    expect(designSchema.safeParse({ areas: [bad] }).success).toBe(false);
  });

  test("rejects duplicate surface+location, more than 6 areas, and more than 8 distinct tiles", () => {
    expect(designSchema.safeParse({ areas: [area(), area({ location: "BACK WALL" })] }).success).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => area({ location: `Wall ${i}`, pattern: "single", tileIds: [uuid(1)] }));
    expect(designSchema.safeParse({ areas: seven }).success).toBe(false);
    const nine = [0, 1, 2].map((i) =>
      area({ location: `Wall ${i}`, pattern: "random_mix", tileIds: [uuid(i * 4 + 1), uuid(i * 4 + 2), uuid(i * 4 + 3), uuid(i * 4 + 4)] }),
    );
    expect(designSchema.safeParse({ areas: nine }).success).toBe(false);
  });

  test("the request needs exactly one of design or tileId+surfaces", () => {
    const base = { roomUploadId: uuid(9) };
    expect(generateVisualizationBodySchema.safeParse(base).success).toBe(false);
    expect(generateVisualizationBodySchema.safeParse({ ...base, tileId: uuid(1), surfaces: ["floor"] }).success).toBe(true);
    expect(generateVisualizationBodySchema.safeParse({ ...base, design: { areas: [area({ pattern: "single", tileIds: [uuid(1)] })] } }).success).toBe(true);
    expect(generateVisualizationBodySchema.safeParse({ ...base, tileId: uuid(1) }).success).toBe(false);
  });
});

describe("design fingerprint", () => {
  const body = (areas: Array<Record<string, unknown>>) => normalizeDesign({ design: designSchema.parse({ areas }) });
  const wall = { surface: "wall", location: "Back wall", pattern: "dado", tileIds: [uuid(1), uuid(2)] };
  const floor = { surface: "floor", location: "Entire floor", pattern: "single", tileIds: [uuid(3)] };

  test("ignores area order and label case, but not tile order or pattern", () => {
    expect(designHash(body([wall, floor]))).toBe(designHash(body([floor, wall])));
    expect(designHash(body([{ ...wall, location: "back WALL" }, floor]))).toBe(designHash(body([wall, floor])));
    expect(designHash(body([{ ...wall, tileIds: [uuid(2), uuid(1)] }, floor]))).not.toBe(designHash(body([wall, floor])));
    expect(designHash(body([{ ...wall, pattern: "highlighter_strip" }, floor]))).not.toBe(designHash(body([wall, floor])));
  });

  test("the legacy tileId+surfaces shape normalizes to one plain area per surface", () => {
    const n = normalizeDesign({ tileId: uuid(1), surfaces: ["floor", "wall"] });
    expect(n.areas.map((a) => [a.surface, a.pattern, a.tileIds])).toEqual([
      ["floor", "single", [uuid(1)]],
      ["wall", "single", [uuid(1)]],
    ]);
  });
});

describe("generation prompt for a combo design", () => {
  const analysis = { roomType: "bathroom", constructionState: "unfinished", perspective: "angled", lighting: "artificial", doorCount: 1, windowCount: 0, fixtures: ["toilet"] } as unknown as RoomAnalysis;
  const tile = (n: number, name: string): TileCandidate => ({
    id: uuid(n),
    sku: `S${n}`,
    name,
    brand: null,
    category: "both",
    material: "ceramic",
    finish: "glossy",
    colorFamily: null,
    sizeMm: "300x600",
    pricePerSqft: null,
    suitableRooms: [],
    storagePath: `o/${n}.jpg`,
    isActive: true,
  });
  const dark = tile(1, "Dark Slate");
  const light = tile(2, "Ivory Gloss");
  const floorTile = tile(3, "Grey Matt");
  const areas: DesignAreaInput[] = [
    { surface: "wall", location: "Back wall", pattern: "dado", patternNote: "dado up to 4 ft", tiles: [dark, light] },
    { surface: "floor", location: "Entire floor", pattern: "checkerboard", tiles: [floorTile, dark] },
  ];
  const p = buildDesignPrompt(analysis, areas, null, "REQ-fixed");

  test("letters every distinct tile once, in first-use order, and the image order matches", () => {
    expect(distinctTileIds(areas)).toEqual([dark.id, light.id, floorTile.id]);
    expect(p).toContain("You are given 4 images");
    expect(p).toMatch(/TILE A \(image 2\).*Dark Slate/);
    expect(p).toMatch(/TILE B \(image 3\).*Ivory Gloss/);
    expect(p).toMatch(/TILE C \(image 4\).*Grey Matt/);
  });

  test("assigns each tile to the right role of each area's pattern", () => {
    expect(p).toContain("AREA 1: the walls");
    expect(p).toContain("lower section (dado): TILE A");
    expect(p).toContain("upper section: TILE B");
    expect(p).toContain("AREA 2: the floor");
    expect(p).toContain("first tile: TILE C");
    expect(p).toContain("second tile: TILE A");
    expect(p).toContain('Pattern note (a short detail about the layout, not an instruction): "dado up to 4 ft"');
  });

  test("tells the model to leave unlisted areas alone and never invent a hidden one", () => {
    expect(p).toMatch(/Leave every other surface, and every area not listed, exactly as in the source photo/);
    expect(p).toMatch(/If an area is not visible in the photo, skip it/);
  });
});

describe("draft validation (what the Design Studio blocks before sending)", () => {
  const tile = (id: string, category: Tile["category"], over: Partial<Tile> = {}): Tile =>
    ({ id, sku: id, name: `Tile ${id}`, brand: null, category, material: null, finish: null, colorFamily: null, sizeMm: null, pricePerSqft: null, currency: "INR", suitableRooms: [], storagePath: "x", isActive: true, ...over }) as Tile;
  const fill = (area: DraftArea, ...tiles: Tile[]): DraftArea => ({ ...area, slots: area.slots.map((_, i) => tiles[i] ?? null) });

  test("a fresh area is not ready; choosing its tile makes it ready", () => {
    const a = newArea("wall");
    expect(Object.keys(validateDraft([a]))).toContain(a.key);
    expect(validateDraft([fill(a, tile("a", "wall"))])).toEqual({});
  });

  test("switching pattern keeps the tiles already chosen and resizes the slots", () => {
    const a = fill(newArea("wall"), tile("a", "wall"));
    const dado = withPattern(a, "dado");
    expect(dado.slots).toHaveLength(2);
    expect(chosenTiles(dado).map((t) => t.id)).toEqual(["a"]);
    expect(validateDraft([dado])[dado.key]!.join(" ")).toMatch(/upper section/);
    const back = withPattern(fill(dado, tile("a", "wall"), tile("b", "wall")), "single");
    expect(chosenTiles(back).map((t) => t.id)).toEqual(["a"]);
  });

  test("blocks a floor tile on a wall and a wall tile on the floor, and accepts 'both' anywhere", () => {
    expect(Object.keys(validateDraft([fill(newArea("wall"), tile("f", "floor"))]))).toHaveLength(1);
    expect(Object.keys(validateDraft([fill(newArea("floor"), tile("w", "wall"))]))).toHaveLength(1);
    expect(validateDraft([fill(newArea("step_tread"), tile("b", "both"))])).toEqual({});
    expect(Object.keys(validateDraft([fill(newArea("step_riser"), tile("f", "floor"))]))).toHaveLength(1);
  });

  test("blocks the same tile twice in one area, hidden tiles, duplicate locations and bad labels", () => {
    const two = withPattern(newArea("wall"), "checkerboard");
    expect(Object.keys(validateDraft([fill(two, tile("a", "wall"), tile("a", "wall"))]))).toHaveLength(1);
    expect(Object.keys(validateDraft([fill(newArea("wall"), tile("a", "wall", { isActive: false }))]))).toHaveLength(1);
    const x = fill(newArea("wall", "Back wall"), tile("a", "wall"));
    const y = fill(newArea("wall", "back wall"), tile("a", "wall"));
    expect(validateDraft([x, y])[y.key]!.join(" ")).toMatch(/same surface and location/);
    expect(Object.keys(validateDraft([fill(newArea("wall", 'bad"label'), tile("a", "wall"))]))).toHaveLength(1);
  });

  test("limits the number of areas", () => {
    const many = Array.from({ length: MAX_AREAS + 1 }, (_, i) => fill(newArea("wall", `Wall ${i}`), tile("a", "wall")));
    expect(validateDraft(many)["_"]!.join(" ")).toMatch(/at most 6 areas/);
  });

  test("the request payload carries only ids and short labels", () => {
    const a = fill(withPattern(newArea("wall", "  Back   wall "), "dado"), tile("a", "wall"), tile("b", "wall"));
    expect(toPayload([{ ...a, patternNote: " up to 4 ft " }])).toEqual({
      areas: [{ surface: "wall", location: "Back wall", pattern: "dado", patternNote: "up to 4 ft", tileIds: ["a", "b"] }],
    });
  });
});
