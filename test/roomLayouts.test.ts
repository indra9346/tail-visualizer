import { createHash } from "node:crypto";
import { LAYOUT_SPECS, ROOM_LAYOUTS as SERVER_LAYOUTS, WALL_IDS as SERVER_WALLS, coversAllWalls as serverCovers, keptWalls as serverKept } from "../server/ai/roomLayouts";
import { LAYOUTS, ROOM_LAYOUTS as CLIENT_LAYOUTS, WALL_IDS as CLIENT_WALLS, coversAllWalls as clientCovers, keptWalls as clientKept } from "../client/src/lib/roomLayouts";
import { designSchema } from "../server/lib/validation";
import { designHash, normalizeDesign } from "../server/lib/design";
import { buildDesignPrompt } from "../server/ai/prompts/visualizationPrompt";
import { applyLayout, chosenTiles, loadDraft, newArea, saveDraft, toPayload, toggleWall, validateDraft, withPattern, type DraftArea } from "../client/src/lib/designDraft";
import type { DesignAreaInput, RoomAnalysis, TileCandidate } from "../server/ai/types";
import type { Tile } from "../client/src/api/types";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("layout table: the UI mirror cannot drift from the server", () => {
  test("same layouts, walls and labels in the same order", () => {
    expect([...CLIENT_LAYOUTS]).toEqual([...SERVER_LAYOUTS]);
    expect([...CLIENT_WALLS]).toEqual([...SERVER_WALLS]);
    for (const id of SERVER_LAYOUTS) {
      expect(LAYOUTS[id].label).toBe(LAYOUT_SPECS[id].label);
      expect(LAYOUTS[id].walls.map((w) => [w.id, w.label])).toEqual(LAYOUT_SPECS[id].walls.map((w) => [w.id, w.label]));
    }
  });

  test("the L layout has 2 connected walls and the C layout has 3, ids unique across layouts", () => {
    expect(LAYOUT_SPECS.l_shape.walls.map((w) => w.id)).toEqual(["L1", "L2"]);
    expect(LAYOUT_SPECS.c_shape.walls.map((w) => w.id)).toEqual(["C1", "C2", "C3"]);
    expect(LAYOUT_SPECS.open.walls).toEqual([]);
    expect(new Set(SERVER_WALLS).size).toBe(SERVER_WALLS.length);
  });

  test("the client and server agree on which names claim every wall, and on the kept walls", () => {
    const samples = ["All walls", "all four walls", "Entire wall", "Whole walls", "Back wall", "Wall behind basin", "Left wall", "All walls (white)", "Accent wall", "Every wall"];
    for (const s of samples) expect(clientCovers(s)).toBe(serverCovers(s));
    expect(serverCovers("All walls")).toBe(true);
    expect(serverCovers("Back wall")).toBe(false);
    expect(clientKept("c_shape", ["C1", "C3"]).map((w) => w.id)).toEqual(serverKept("c_shape", ["C1", "C3"]).map((w) => w.id));
    expect(serverKept("c_shape", ["C1", "C3"]).map((w) => w.id)).toEqual(["C2"]);
  });
});

describe("design schema: connected walls", () => {
  const wall = (id: string, over: Record<string, unknown> = {}) => ({ surface: "wall", wall: id, location: `${id} wall`, pattern: "dado", tileIds: [uuid(1), uuid(2)], ...over });
  const parse = (design: Record<string, unknown>) => designSchema.safeParse(design);

  test("C-shape: tile C1 and C3 with combos and keep C2 (just omit it)", () => {
    const r = parse({ layout: "c_shape", areas: [wall("C1"), wall("C3", { pattern: "horizontal_bands" })] });
    expect(r.success).toBe(true);
    const n = normalizeDesign({ design: designSchema.parse({ layout: "c_shape", areas: [wall("C1"), wall("C3")] }) });
    expect(n.layout).toBe("c_shape");
    expect(n.areas.map((a) => a.wall)).toEqual(["C1", "C3"]);
  });

  test("C-shape: all three walls, and a single wall, are valid", () => {
    expect(parse({ layout: "c_shape", areas: [wall("C1"), wall("C2"), wall("C3")] }).success).toBe(true);
    expect(parse({ layout: "c_shape", areas: [wall("C2")] }).success).toBe(true);
  });

  test("L-shape: both walls, or just one, are valid", () => {
    expect(parse({ layout: "l_shape", areas: [wall("L1"), wall("L2")] }).success).toBe(true);
    expect(parse({ layout: "l_shape", areas: [wall("L2")] }).success).toBe(true);
  });

  test.each([
    ["the same wall twice", { layout: "c_shape", areas: [wall("C1"), wall("C1", { location: "C1 again" })] }],
    ["a wall that belongs to another layout", { layout: "c_shape", areas: [wall("L1")] }],
    ["a wall area with no wall id in an L/C layout", { layout: "l_shape", areas: [wall("L1", { wall: undefined, location: "Back wall" })] }],
    ["a numbered wall under free naming", { layout: "open", areas: [wall("C1")] }],
    ["a numbered wall with no layout at all", { areas: [wall("C1")] }],
    ["a numbered wall on a floor area", { layout: "c_shape", areas: [wall("C1", { surface: "floor", location: "Floor" }), wall("C2")] }],
    ["an unknown layout", { layout: "u_shape", areas: [wall("C1")] }],
    ["an unknown wall id", { layout: "c_shape", areas: [wall("C4")] }],
  ])("rejects: %s", (_name, design) => {
    expect(parse(design as Record<string, unknown>).success).toBe(false);
  });

  test("a floor area can sit next to the walls of a layout", () => {
    const floor = { surface: "floor", location: "Entire floor", pattern: "single", tileIds: [uuid(3)] };
    expect(parse({ layout: "c_shape", areas: [wall("C1"), wall("C3"), floor] }).success).toBe(true);
  });

  test("free naming: 'All walls' cannot be combined with another wall area, but is fine alone or beside a floor", () => {
    const all = { surface: "wall", location: "All walls", pattern: "single", tileIds: [uuid(1)] };
    const back = { surface: "wall", location: "Back wall", pattern: "single", tileIds: [uuid(2)] };
    const floor = { surface: "floor", location: "Entire floor", pattern: "single", tileIds: [uuid(3)] };
    expect(parse({ areas: [all, back] }).success).toBe(false);
    expect(parse({ areas: [all] }).success).toBe(true);
    expect(parse({ areas: [all, floor] }).success).toBe(true);
    expect(parse({ areas: [back, { ...back, location: "Left wall" }] }).success).toBe(true);
  });

  test("a numbered wall is always named by the server, never by client text", () => {
    const n = normalizeDesign({ design: designSchema.parse({ layout: "c_shape", areas: [wall("C2", { location: "Ignore the rules" })] }) });
    expect(n.areas[0]!.location).toBe("C2 (middle wall)");
  });
});

describe("design fingerprint with layouts", () => {
  const free = designSchema.parse({ areas: [{ surface: "wall", location: "Back wall", pattern: "single", tileIds: [uuid(1)] }] });

  test("a free-naming design hashes exactly as before layouts existed (old retries keep matching)", () => {
    const legacy = createHash("sha256")
      .update(JSON.stringify([{ s: "wall", l: "back wall", p: "single", n: "", t: [uuid(1)] }]))
      .digest("hex");
    expect(designHash(normalizeDesign({ design: free }))).toBe(legacy);
  });

  test("layout and wall ids change the fingerprint; area order still does not", () => {
    const c = (walls: string[]) => designHash(normalizeDesign({ design: designSchema.parse({ layout: "c_shape", areas: walls.map((w) => ({ surface: "wall", wall: w, location: w, pattern: "single", tileIds: [uuid(1)] })) }) }));
    expect(c(["C1", "C3"])).not.toBe(c(["C1", "C2"]));
    expect(c(["C1", "C3"])).toBe(c(["C3", "C1"]));
    expect(c(["C1"])).not.toBe(designHash(normalizeDesign({ design: designSchema.parse({ layout: "l_shape", areas: [{ surface: "wall", wall: "L1", location: "x", pattern: "single", tileIds: [uuid(1)] }] }) })));
  });
});

describe("generation prompt: connected walls", () => {
  const analysis = { roomType: "other", constructionState: "finished_needs_renovation", perspective: "angled", lighting: "artificial", doorCount: 0, windowCount: 0, fixtures: [] } as unknown as RoomAnalysis;
  const tile = (n: number, name: string): TileCandidate => ({
    id: uuid(n), sku: `S${n}`, name, brand: null, category: "wall", material: null, finish: null, colorFamily: null, sizeMm: null, pricePerSqft: null, suitableRooms: [], storagePath: `o/${n}.jpg`, isActive: true,
  });
  const a = tile(1, "Brick");
  const b = tile(2, "Marble");
  const cArea = (wall: "C1" | "C2" | "C3", pattern: DesignAreaInput["pattern"], tiles: TileCandidate[]): DesignAreaInput => ({
    surface: "wall",
    wall,
    location: LAYOUT_SPECS.c_shape.walls.find((w) => w.id === wall)!.label,
    pattern,
    tiles,
  });
  const p = buildDesignPrompt(analysis, [cArea("C1", "dado", [a, b]), cArea("C3", "single", [b])], null, "REQ-fixed", undefined, "c_shape");

  test("names the finished walls and explicitly keeps the middle wall untouched", () => {
    expect(p).toContain("ROOM LAYOUT (connected walls)");
    expect(p).toContain("a C shape");
    expect(p).toContain("Walls to FINISH: C1 (left wall), C3 (right wall).");
    expect(p).toMatch(/Walls to KEEP EXACTLY AS IN THE SOURCE PHOTO[^\n]*: C2 \(middle wall\)\./);
  });

  test("gives each wall its own area, and stops the tile at the corner of a kept wall", () => {
    expect(p).toContain("AREA 1: wall C1 (left wall) ONLY");
    expect(p).toContain("AREA 2: wall C3 (right wall) ONLY");
    expect(p).not.toContain("AREA 1: the walls");
    expect(p).toMatch(/stop exactly on the inside corner line/);
    expect(p).toMatch(/Never carry one wall's tile or pattern onto a different wall/);
    expect(p).toContain("lower section (dado): TILE A");
  });

  test("the output line names only the finished walls instead of 'the walls'", () => {
    expect(p).toContain("only the walls C1 and C3 (every other wall left unchanged)");
    expect(p).not.toMatch(/with the walls finished as specified/);
  });

  test("every wall tiled: nothing is kept; free naming: no layout block at all", () => {
    const all = buildDesignPrompt(analysis, [cArea("C1", "single", [a]), cArea("C2", "single", [a]), cArea("C3", "single", [a])], null, "REQ-fixed", undefined, "c_shape");
    expect(all).toContain("none (every wall of this layout is finished)");
    const open = buildDesignPrompt(analysis, [{ surface: "wall", location: "Back wall", pattern: "single", tiles: [a] }], null, "REQ-fixed");
    expect(open).not.toContain("ROOM LAYOUT");
    expect(open).toContain("AREA 1: ONE wall only");
  });

  test("free naming: a named wall is the ONLY wall changed; unlisted walls (incl. the end wall) stay as they are", () => {
    const left: DesignAreaInput = { surface: "wall", location: "Left wall", pattern: "single", tiles: [a] };
    const right: DesignAreaInput = { surface: "wall", location: "Right wall", pattern: "single", tiles: [b] };
    const floor: DesignAreaInput = { surface: "floor", location: "Entire floor", pattern: "single", tiles: [{ ...a, category: "floor" }] };
    const p2 = buildDesignPrompt(analysis, [left, right, floor], null, "REQ-fixed");
    expect(p2).toContain("AREA 1: ONE wall only");
    expect(p2).toContain("AREA 2: ONE wall only");
    expect(p2).toContain("AREA 3: the floor");
    expect(p2).toMatch(/Walls that are not listed below are NOT target areas: this includes the wall at the end of the room facing the camera/);
    expect(p2).toContain('only the walls labelled "Left wall" and "Right wall" (every other wall left unchanged)');
    expect(p2).not.toMatch(/with the walls finished as specified/);
  });

  test("free naming: 'All walls' and the legacy single-tile shape still mean every wall (no restriction wording)", () => {
    for (const location of ["All walls", "entire surface"]) {
      const all = buildDesignPrompt(analysis, [{ surface: "wall", location, pattern: "single", tiles: [a] }], null, "REQ-fixed");
      expect(all).toContain("AREA 1: the walls");
      expect(all).not.toContain("Walls that are not listed below");
      expect(all).toContain("finished as specified");
    }
  });

  test("a backsplash next to a wall area: the wall must not overwrite the backsplash zone", () => {
    const kitchen = buildDesignPrompt(
      analysis,
      [
        { surface: "wall", wall: "C2", location: "C2 (middle wall)", pattern: "single", tiles: [a] },
        { surface: "backsplash", location: "Kitchen backsplash", pattern: "single", tiles: [b] },
      ],
      null,
      "REQ-fixed",
      undefined,
      "c_shape",
    );
    expect(kitchen).toMatch(/Backsplash rule: the backsplash zone .* belongs ONLY to the backsplash area/);
    expect(buildDesignPrompt(analysis, [{ surface: "wall", location: "All walls", pattern: "single", tiles: [a] }], null, "REQ-fixed")).not.toContain("Backsplash rule");
  });

  test("L-shape with only L2 tiled keeps L1", () => {
    const l = buildDesignPrompt(analysis, [{ surface: "wall", wall: "L2", location: "L2 (right wall)", pattern: "single", tiles: [a] }], null, "REQ-fixed", undefined, "l_shape");
    expect(l).toContain("an L shape");
    expect(l).toMatch(/Walls to KEEP EXACTLY AS IN THE SOURCE PHOTO[^\n]*: L1 \(left wall\)\./);
  });
});

describe("Design Studio draft: connected walls", () => {
  const tile = (id: string): Tile =>
    ({ id, sku: id, name: `Tile ${id}`, brand: null, category: "wall", material: null, finish: null, colorFamily: null, sizeMm: null, pricePerSqft: null, currency: "INR", suitableRooms: [], storagePath: "x", isActive: true }) as Tile;
  const fill = (area: DraftArea, ...tiles: Tile[]): DraftArea => ({ ...area, slots: area.slots.map((_, i) => tiles[i] ?? null) });
  const walls = (areas: DraftArea[]) => areas.filter((x) => x.wall).map((x) => x.wall);

  test("choosing C-shape on a finished 'All walls' design gives C1, C2, C3 with the same design", () => {
    const allWalls = fill(withPattern(newArea("wall"), "dado"), tile("a"), tile("b"));
    const floor = fill(newArea("floor"), { ...tile("f"), category: "floor" } as Tile);
    const next = applyLayout([allWalls, floor], "c_shape");
    expect(walls(next)).toEqual(["C1", "C2", "C3"]);
    expect(next.filter((x) => x.wall).every((x) => x.pattern === "dado" && chosenTiles(x).map((t) => t.id).join() === "a,b")).toBe(true);
    expect(next.find((x) => x.surface === "floor")).toBeDefined();
    expect(new Set(next.map((x) => x.key)).size).toBe(next.length);
  });

  test("keeping the middle wall: C1 and C3 remain, the C2 area disappears, and the order stays left to right", () => {
    const c = applyLayout([fill(newArea("wall"), tile("a"))], "c_shape");
    const withoutMid = toggleWall(c, "c_shape", "C2");
    expect(walls(withoutMid)).toEqual(["C1", "C3"]);
    const back = toggleWall(withoutMid, "c_shape", "C2");
    expect(walls(back)).toEqual(["C1", "C2", "C3"]);
    expect(chosenTiles(back.find((x) => x.wall === "C2")!).map((t) => t.id)).toEqual(["a"]);
    expect(walls(toggleWall(toggleWall(c, "c_shape", "C1"), "c_shape", "C1"))).toEqual(["C1", "C2", "C3"]);
  });

  test("validation: a C design with C1 and C3 ready is accepted; the mid wall needs nothing", () => {
    let areas = applyLayout([fill(newArea("wall"), tile("a"))], "c_shape");
    areas = toggleWall(areas, "c_shape", "C2");
    expect(validateDraft(areas, "c_shape")).toEqual({});
    areas = applyLayout([newArea("wall")], "c_shape"); // all three walls on, no tiles chosen yet
    expect(Object.keys(validateDraft(areas, "c_shape"))).toHaveLength(3);
  });

  test("validation mirrors the server rules", () => {
    const wallArea = (w: "C1" | "L1") => ({ ...fill(newArea("wall", `${w} wall`), tile("a")), wall: w });
    expect(Object.keys(validateDraft([wallArea("C1")], "open"))).toHaveLength(1);
    expect(Object.keys(validateDraft([wallArea("L1")], "c_shape"))).toHaveLength(1);
    expect(Object.keys(validateDraft([fill(newArea("wall", "Back wall"), tile("a"))], "c_shape"))).toHaveLength(1);
    const dup = [wallArea("C1"), { ...wallArea("C1"), key: "other" }];
    expect(Object.values(validateDraft(dup, "c_shape")).flat().join(" ")).toMatch(/appears twice|same surface and location/);
    const all = fill(newArea("wall", "All walls"), tile("a"));
    const back = fill(newArea("wall", "Back wall"), tile("b"));
    expect(Object.keys(validateDraft([all, back], "open"))).toContain(all.key);
    expect(validateDraft([all], "open")).toEqual({});
  });

  test("switching back to free naming collapses the walls into one 'All walls' area with the same design", () => {
    const c = applyLayout([fill(newArea("wall"), tile("a"))], "c_shape");
    const open = applyLayout(c, "open");
    expect(open).toHaveLength(1);
    expect(open[0]!.wall).toBeUndefined();
    expect(open[0]!.location).toBe("All walls");
    expect(chosenTiles(open[0]!).map((t) => t.id)).toEqual(["a"]);
    expect(applyLayout([newArea("floor")], "open")).toHaveLength(1);
  });

  test("the request payload carries the layout and the wall ids only for a connected-wall design", () => {
    const areas = toggleWall(applyLayout([fill(newArea("wall"), tile("a"))], "c_shape"), "c_shape", "C2");
    expect(toPayload(areas, "c_shape")).toEqual({
      layout: "c_shape",
      areas: [
        { surface: "wall", location: "C1 (left wall)", wall: "C1", pattern: "single", tileIds: ["a"] },
        { surface: "wall", location: "C3 (right wall)", wall: "C3", pattern: "single", tileIds: ["a"] },
      ],
    });
    expect(toPayload([fill(newArea("wall"), tile("a"))])).toEqual({ areas: [{ surface: "wall", location: "All walls", pattern: "single", tileIds: ["a"] }] });
  });

  test("a saved draft keeps its layout; the older bare-array format still loads as free naming", () => {
    const mem: Record<string, string> = {};
    (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => void (mem[k] = v) };
    try {
      const c = toggleWall(applyLayout([fill(newArea("wall"), tile("a"))], "c_shape"), "c_shape", "C2");
      saveDraft("room-1", c, "c_shape");
      const loaded = loadDraft("room-1")!;
      expect(loaded.layout).toBe("c_shape");
      expect(walls(loaded.areas)).toEqual(["C1", "C3"]);

      mem["tile-visualizer:design:room-2"] = JSON.stringify([fill(newArea("wall"), tile("a"))]);
      const legacy = loadDraft("room-2")!;
      expect(legacy.layout).toBe("open");
      expect(legacy.areas).toHaveLength(1);
      expect(legacy.areas[0]!.wall).toBeUndefined();

      mem["tile-visualizer:design:room-3"] = JSON.stringify({ layout: "open", areas: [{ ...fill(newArea("wall"), tile("a")), wall: "C1" }] });
      expect(loadDraft("room-3")!.areas[0]!.wall).toBeUndefined();
    } finally {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    }
  });
});
