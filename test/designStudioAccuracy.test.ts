import { DESIGN_PATTERNS as SERVER_IDS, PATTERN_SPECS, patternFitsSurface as serverFits, patternPrompt, patternRoles } from "../server/ai/designPatterns";
import { SURFACE_TYPES } from "../server/ai/types";
import { designAreaSchema } from "../server/lib/validation";
import { buildDesignPrompt } from "../server/ai/prompts/visualizationPrompt";
import { PATTERNS, SURFACES, hintFor, patternFitsSurface, patternsFor, rolesFor } from "../client/src/lib/designPatterns";
import {
  draftFromDesign,
  loadDraft,
  newArea,
  saveDraft,
  toPayload,
  uniqueLocation,
  validateDraft,
  withPattern,
  withSurface,
  type DraftArea,
} from "../client/src/lib/designDraft";
import { LAYOUT_WASTE, layoutForWaste } from "../client/src/lib/tileCalc";
import type { DesignAreaInput, RoomAnalysis, TileCandidate } from "../server/ai/types";
import type { Tile } from "../client/src/api/types";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function tile(id: string, category: Tile["category"] = "both", extra: Partial<Tile> = {}): Tile {
  return { id, sku: id, name: `Tile ${id}`, brand: null, category, material: null, finish: null, colorFamily: null, sizeMm: "600x600", pricePerSqft: null, currency: "INR", suitableRooms: [], storagePath: `${id}.jpg`, isActive: true, ...extra };
}
const fill = (area: DraftArea, ...tiles: Tile[]): DraftArea => ({ ...area, slots: area.slots.map((_, i) => tiles[i] ?? null) });

const analysis = {
  roomType: "bathroom",
  confidence: 0.9,
  constructionState: "unfinished",
  floorVisible: true,
  floorCurrentMaterial: null,
  floorConditionNotes: null,
  wallVisible: true,
  wallCurrentMaterial: null,
  wallConditionNotes: null,
  recommendedSurfaces: ["floor", "wall"],
  doorCount: 1,
  windowCount: 1,
  fixtures: [],
  lighting: "natural",
  perspective: "straight_on",
  warnings: [],
} as unknown as RoomAnalysis;
const candidate = (n: number, category: TileCandidate["category"] = "both"): TileCandidate => ({
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
  suitableRooms: [],
  storagePath: `${n}.jpg`,
  isActive: true,
});
const promptFor = (areas: DesignAreaInput[], layout: "open" | "c_shape" = "open") => buildDesignPrompt(analysis, areas, null, "REQ-x", "bathroom", layout);

describe("each layout is offered only where it can be laid (UI and server agree)", () => {
  test.each([...SERVER_IDS])("%s: same surfaces and floor roles on both sides", (id) => {
    expect([...PATTERNS[id].surfaces].sort()).toEqual([...PATTERN_SPECS[id].surfaces].sort());
    expect(PATTERNS[id].floorRoles).toEqual(PATTERN_SPECS[id].floorRoles);
    for (const s of SURFACE_TYPES) expect(patternFitsSurface(id, s)).toBe(serverFits(id, s));
  });

  test("a floor never offers a dado or an eye-level highlighter strip; a wall offers every layout", () => {
    expect(patternsFor("floor")).not.toContain("dado");
    expect(patternsFor("floor")).not.toContain("highlighter_strip");
    expect(patternsFor("step_tread")).not.toContain("dado");
    expect(patternsFor("wall")).toEqual([...SERVER_IDS]);
    expect(patternsFor("floor")).toEqual(expect.arrayContaining(["single", "checkerboard", "vertical_stripes", "horizontal_bands", "border_frame", "feature_panel", "herringbone", "diagonal", "random_mix"]));
  });

  test("the server refuses a dado on a floor with a clear message, and accepts stripes on a floor", () => {
    const bad = designAreaSchema.safeParse({ surface: "floor", location: "Entire floor", pattern: "dado", tileIds: [uuid(1), uuid(2)] });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad)).toMatch(/can't be laid on a floor/);
    expect(designAreaSchema.safeParse({ surface: "floor", location: "Entire floor", pattern: "vertical_stripes", tileIds: [uuid(1), uuid(2)] }).success).toBe(true);
    expect(designAreaSchema.safeParse({ surface: "shower_wall", location: "Shower walls", pattern: "dado", tileIds: [uuid(1), uuid(2)] }).success).toBe(true);
  });

  test("the Design Studio blocks a dado left on a floor (e.g. from an old draft) before Preview", () => {
    const area = fill({ ...withPattern(newArea("floor"), "dado") }, tile("a", "floor"), tile("b", "floor"));
    expect(validateDraft([area])[area.key]!.join(" ")).toMatch(/can't be laid on floor/);
  });
});

describe("floor wording: what the AI is told matches a floor, not a wall", () => {
  test("stripes on a floor run away from the camera; on a wall they are full-height columns", () => {
    expect(patternPrompt("vertical_stripes", "floor")).toMatch(/away from the camera/);
    expect(patternPrompt("vertical_stripes", "floor")).not.toMatch(/full-height/);
    expect(patternPrompt("vertical_stripes", "wall")).toMatch(/full-height vertical stripes/);
  });

  test("bands on a floor start at the front (nearest the camera), and the roles say so", () => {
    expect(patternPrompt("horizontal_bands", "floor")).toMatch(/nearest the camera/);
    expect(patternRoles("horizontal_bands", "floor")[0]).toBe("front band (nearest the camera)");
    expect(rolesFor("horizontal_bands", "floor")[0]).toBe("front band (nearest the camera)");
    expect(rolesFor("horizontal_bands", "wall")[0]).toBe("bottom band");
    expect(hintFor("feature_panel", "floor")).toMatch(/rug/);
  });

  test("the generation prompt uses the floor wording and floor roles for a floor area", () => {
    const prompt = promptFor([{ surface: "floor", location: "Entire floor", pattern: "horizontal_bands", tiles: [candidate(1, "floor"), candidate(2, "floor")] }]);
    expect(prompt).toMatch(/bands running across the floor/);
    expect(prompt).toMatch(/- front band \(nearest the camera\): TILE A/);
    expect(prompt).not.toMatch(/from the bottom of the area upward/);
  });
});

describe("several areas on one surface never overlap in the prompt", () => {
  test("'Entire floor' + 'Shower floor area': the named part wins, the general area covers the rest", () => {
    const prompt = promptFor([
      { surface: "floor", location: "Entire floor", pattern: "single", tiles: [candidate(1, "floor")] },
      { surface: "floor", location: "Shower floor area", pattern: "single", tiles: [candidate(2, "floor")] },
    ]);
    expect(prompt).toMatch(/Shared surfaces: the floor is split into more than one area/);
    expect(prompt).toMatch(/covers only the rest of that surface/);
  });

  test("no shared-surface rule for one area per surface, nor for numbered walls of a C-shape room", () => {
    expect(promptFor([{ surface: "floor", location: "Entire floor", pattern: "single", tiles: [candidate(1)] }])).not.toMatch(/Shared surfaces/);
    const walls = promptFor(
      [
        { surface: "wall", location: "C1 (left wall)", wall: "C1", pattern: "single", tiles: [candidate(1, "wall")] },
        { surface: "wall", location: "C3 (right wall)", wall: "C3", pattern: "single", tiles: [candidate(2, "wall")] },
      ],
      "c_shape",
    );
    expect(walls).not.toMatch(/Shared surfaces/);
  });
});

describe("area names never clash (Gowda's 'Another area already has the same surface and location')", () => {
  test("uniqueLocation gives the first free preset, then 'Floor 2', 'Floor 3'", () => {
    const floors = SURFACES.floor.locations.map((loc) => newArea("floor", loc));
    expect(uniqueLocation("floor", [])).toBe("Entire floor");
    expect(uniqueLocation("floor", floors.slice(0, 1))).toBe("Floor near entrance");
    expect(uniqueLocation("floor", floors)).toBe("Floor 2");
    expect(uniqueLocation("floor", [...floors, newArea("floor", "Floor 2")])).toBe("Floor 3");
  });

  test("switching 'All walls' to Floor next to 'Entire floor' picks a free floor name: no duplicate warning", () => {
    const floor = fill(newArea("floor"), tile("f", "floor"));
    const wall = fill(newArea("wall"), tile("w", "both"));
    const moved = withSurface(wall, "floor", [floor, wall]);
    expect(moved.surface).toBe("floor");
    expect(moved.location).toBe("Floor near entrance");
    expect(validateDraft([floor, moved])).toEqual({});
  });

  test("a name the owner typed is kept when it does not clash, and replaced when it would", () => {
    const floor = newArea("floor", "Bathroom floor");
    const typed = { ...newArea("wall"), location: "Near the window" };
    expect(withSurface(typed, "floor", [floor, typed]).location).toBe("Near the window");
    const clash = { ...newArea("wall"), location: "Bathroom floor" };
    expect(withSurface(clash, "floor", [floor, clash]).location).toBe("Entire floor");
  });

  test("moving a dado wall to the floor falls back to a plain layout and keeps the chosen tiles", () => {
    const wall = fill(withPattern(newArea("wall"), "dado"), tile("a", "both"), tile("b", "both"));
    const moved = withSurface(wall, "floor", [wall]);
    expect(moved.pattern).toBe("single");
    expect(moved.slots[0]?.id).toBe("a");
  });

  test("the duplicate check ignores extra spaces and case, like the server", () => {
    const x = fill(newArea("wall", "Back wall"), tile("a", "wall"));
    const y = fill(newArea("wall", "back   wall "), tile("b", "wall"));
    expect(validateDraft([x, y])[y.key]!.join(" ")).toMatch(/already named/);
  });
});

describe("drafts and 'Edit design' keep the owner's work", () => {
  const memory = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
    };
  });
  afterAll(() => {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  });

  test("the requirements text survives a refresh together with the areas", () => {
    const area = fill(newArea("floor"), tile("a", "floor"));
    saveDraft("room-1", [area], "open", "free", "Keep the toilet as it is.");
    const loaded = loadDraft("room-1")!;
    expect(loaded.requirements).toBe("Keep the toilet as it is.");
    expect(loaded.areas[0]!.slots[0]?.id).toBe("a");
    saveDraft("room-2", [area]);
    expect(loadDraft("room-2")!.requirements).toBeUndefined();
  });

  test("a generated design is rebuilt as an editable draft with its tiles in the right slots", () => {
    const a = tile(uuid(1), "floor");
    const b = tile(uuid(2), "floor");
    const draft = draftFromDesign(
      {
        layout: "c_shape",
        areas: [
          { surface: "floor", location: "Entire floor", pattern: "checkerboard", patternNote: null, tileIds: [a.id, b.id] },
          { surface: "wall", location: "C2 (middle wall)", wall: "C2", pattern: "single", patternNote: "up to 7 ft", tileIds: [uuid(9)] },
        ],
      },
      [a, b],
    )!;
    expect(draft.layout).toBe("c_shape");
    expect(draft.areas[0]!.slots.map((t) => t?.id)).toEqual([a.id, b.id]);
    expect(draft.areas[1]!.wall).toBe("C2");
    expect(draft.areas[1]!.patternNote).toBe("up to 7 ft");
    // A tile no longer in the catalog leaves its slot empty, so the owner is asked to pick again.
    expect(draft.areas[1]!.slots[0]).toBeNull();
    expect(toPayload(draft.areas, draft.layout).areas[0]!.tileIds).toEqual([a.id, b.id]);
  });

  test("a numbered wall is dropped back to a plain wall when the design has no layout", () => {
    const draft = draftFromDesign({ areas: [{ surface: "wall", location: "Back wall", wall: "C2", pattern: "single", patternNote: null, tileIds: [] }] }, [])!;
    expect(draft.areas[0]!.wall).toBeUndefined();
  });
});

describe("tile calculator: the laying style goes with the saved job", () => {
  test("old entries without a stored style get it back from their waste %", () => {
    expect(layoutForWaste(LAYOUT_WASTE.herringbone.pct)).toBe("herringbone");
    expect(layoutForWaste(LAYOUT_WASTE.diagonal.pct)).toBe("diagonal");
    expect(layoutForWaste(7)).toBe("straight");
  });
});
