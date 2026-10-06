import { designSchema } from "../server/lib/validation";
import { normalizeDesign } from "../server/lib/design";
import { LAYOUT_SPECS } from "../server/ai/roomLayouts";
import { buildDesignPrompt } from "../server/ai/prompts/visualizationPrompt";
import { MAX_AREAS, chosenTiles, newArea, toPayload, validateDraft, withPattern, type DraftArea } from "../client/src/lib/designDraft";
import {
  TEMPLATES,
  TEMPLATE_IDS,
  applyTemplate,
  areaOfFace,
  ensureFace,
  faceOfArea,
  isTemplateId,
  keptFaces,
  keptLabels,
  templateForLayout,
  toggleFace,
  type TemplateId,
} from "../client/src/lib/roomTemplates";
import type { DesignAreaInput, RoomAnalysis, TileCandidate } from "../server/ai/types";
import type { Tile } from "../client/src/api/types";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tile = (n: number, category: Tile["category"] = "both"): Tile =>
  ({ id: uuid(n), sku: `S${n}`, name: `Tile ${n}`, brand: null, category, material: null, finish: null, colorFamily: null, sizeMm: "600x600", pricePerSqft: null, currency: "INR", suitableRooms: [], storagePath: `x/${n}`, isActive: true }) as Tile;

/** Fills every empty slot of every area with a tile that suits it. */
function fillAll(areas: DraftArea[]): DraftArea[] {
  return areas.map((a, i) => ({ ...a, slots: a.slots.map((s, j) => s ?? tile(10 + i * 4 + j)) }));
}
const labelsOf = (areas: DraftArea[]) => areas.map((a) => a.location);

describe("room templates", () => {
  test("every template id is known, has unique face keys, and its layout exists on the server", () => {
    for (const id of TEMPLATE_IDS) {
      const t = TEMPLATES[id];
      expect(isTemplateId(id)).toBe(true);
      expect(new Set(t.faces.map((f) => f.key)).size).toBe(t.faces.length);
      expect(Object.keys(LAYOUT_SPECS)).toContain(t.layout);
      for (const f of t.faces.filter((x) => x.wall)) expect(LAYOUT_SPECS[t.layout].walls.map((w) => w.id)).toContain(f.wall);
      for (const f of t.faces.filter((x) => x.wall)) expect(f.location).toBe(LAYOUT_SPECS[t.layout].walls.find((w) => w.id === f.wall)!.label);
    }
    expect(isTemplateId("garage")).toBe(false);
  });

  test.each([...TEMPLATE_IDS])("%s: the default design (everything switched on) is a valid design the server accepts", (id: TemplateId) => {
    const areas = fillAll(applyTemplate([newArea("wall")], id));
    expect(validateDraft(areas, TEMPLATES[id].layout)).toEqual({});
    expect(areas.length).toBeLessThanOrEqual(MAX_AREAS);
    const payload = toPayload(areas, TEMPLATES[id].layout);
    expect(designSchema.safeParse({ ...payload, areas: payload.areas.map((a) => ({ ...a, tileIds: a.tileIds })) }).success).toBe(true);
  });

  test("kitchen = walls + floor + a backsplash that is its own surface; washroom has no backsplash", () => {
    expect(TEMPLATES.kitchen.faces.map((f) => f.key)).toEqual(["floor", "C1", "C2", "C3", "backsplash"]);
    expect(TEMPLATES.kitchen.faces.find((f) => f.key === "backsplash")!.surface).toBe("backsplash");
    expect(TEMPLATES.washroom.faces.map((f) => f.key)).toEqual(["floor", "C1", "C2", "C3"]);
    expect(TEMPLATES.washroom_corner.faces.map((f) => f.key)).toEqual(["floor", "L1", "L2"]);
  });

  test("the client's case: floor + left wall + right wall tiled, the back (middle) wall NOT chosen", () => {
    const all = fillAll(applyTemplate([newArea("wall")], "washroom"));
    const areas = toggleFace(all, "washroom", "C2");
    expect(labelsOf(areas).sort()).toEqual(["C1 (left wall)", "C3 (right wall)", "Entire floor"].sort());
    expect(keptFaces(TEMPLATES.washroom, areas).map((f) => f.key)).toEqual(["C2"]);
    expect(keptLabels(TEMPLATES.washroom, areas)).toEqual(["Back wall (C2)"]);

    const payload = toPayload(areas, TEMPLATES.washroom.layout);
    expect(payload.layout).toBe("c_shape");
    expect(payload.areas.map((a) => a.wall ?? a.surface).sort()).toEqual(["C1", "C3", "floor"]);
    const parsed = designSchema.parse(payload);
    const normalized = normalizeDesign({ design: parsed });
    expect(normalized.areas.some((a) => a.wall === "C2")).toBe(false);

    // What the model is told: C2 is explicitly KEPT, and it is not a target area.
    const analysis = { roomType: "bathroom", constructionState: "finished_needs_renovation", perspective: "straight_on", lighting: "artificial", doorCount: 0, windowCount: 0, fixtures: [] } as unknown as RoomAnalysis;
    const candidate = (t: Tile): TileCandidate => ({ ...t, id: t.id }) as unknown as TileCandidate;
    const inputs: DesignAreaInput[] = normalized.areas.map((a) => ({
      surface: a.surface,
      location: a.location,
      ...(a.wall ? { wall: a.wall } : {}),
      pattern: a.pattern,
      tiles: a.tileIds.map((id) => candidate(tile(Number(id.slice(-12))))),
    }));
    const prompt = buildDesignPrompt(analysis, inputs, null, "REQ-fixed", undefined, normalized.layout);
    expect(prompt).toContain("Walls to FINISH: C1 (left wall), C3 (right wall).");
    expect(prompt).toMatch(/Walls to KEEP EXACTLY AS IN THE SOURCE PHOTO[^\n]*: C2 \(middle wall\)\./);
    expect(prompt).not.toMatch(/AREA \d+: wall C2/);
    expect(prompt).toContain("only the walls C1 and C3 (every other wall left unchanged)");
  });

  test("any surface can be kept: floor off leaves the floor alone; everything off is rejected until something is on", () => {
    const base = fillAll(applyTemplate([newArea("wall")], "washroom"));
    const noFloor = toggleFace(base, "washroom", "floor");
    expect(areaOfFace(noFloor, TEMPLATES.washroom.faces[0]!)).toBeUndefined();
    expect(keptLabels(TEMPLATES.washroom, noFloor)).toEqual(["Floor"]);
    const none = ["floor", "C1", "C2", "C3"].reduce((acc, key) => toggleFace(acc, "washroom", key), base);
    expect(none).toEqual([]);
    expect(validateDraft(none, "c_shape")["_"]![0]).toMatch(/at least one/);
  });

  test("switching a face back on restores it in order and reuses another wall's design", () => {
    const base = fillAll(applyTemplate([withPattern(newArea("wall"), "dado")], "washroom"));
    const off = toggleFace(base, "washroom", "C2");
    const on = toggleFace(off, "washroom", "C2");
    expect(on.filter((a) => a.wall).map((a) => a.wall)).toEqual(["C1", "C2", "C3"]);
    const c2 = on.find((a) => a.wall === "C2")!;
    expect(c2.pattern).toBe("dado");
    expect(chosenTiles(c2)).toHaveLength(2);
  });

  test("clicking a kept face in the 3D box switches it on first (ensureFace), clicking a tiled one changes nothing", () => {
    const base = fillAll(applyTemplate([newArea("wall")], "kitchen"));
    const kept = toggleFace(base, "kitchen", "backsplash");
    expect(keptLabels(TEMPLATES.kitchen, kept)).toEqual(["Backsplash"]);
    const clicked = ensureFace(kept, "kitchen", "backsplash");
    expect(clicked.area?.surface).toBe("backsplash");
    expect(clicked.areas).toHaveLength(kept.length + 1);
    const again = ensureFace(clicked.areas, "kitchen", "backsplash");
    expect(again.areas).toBe(clicked.areas);
    expect(ensureFace(base, "kitchen", "nope").area).toBeUndefined();
  });

  test("choosing a template from a finished free design carries its tiles over; the floor starts switched on with no tile", () => {
    const free = fillAll([newArea("wall")]);
    const washroom = applyTemplate(free, "washroom");
    const walls = washroom.filter((a) => a.wall);
    expect(walls.map((a) => a.wall)).toEqual(["C1", "C2", "C3"]);
    expect(walls.every((a) => chosenTiles(a).length === 1)).toBe(true);
    const floor = washroom.find((a) => a.surface === "floor")!;
    expect(chosenTiles(floor)).toHaveLength(0);
    // Applying the same template again changes nothing about which surfaces exist.
    expect(labelsOf(applyTemplate(washroom, "washroom")).sort()).toEqual(labelsOf(washroom).sort());
  });

  test("switching to free naming keeps a floor / backsplash as plain areas and collapses the walls to one 'All walls'", () => {
    const kitchen = fillAll(applyTemplate([newArea("wall")], "kitchen"));
    const free = applyTemplate(kitchen, "free");
    expect(free.filter((a) => a.surface === "wall").map((a) => a.location)).toEqual(["All walls"]);
    expect(free.some((a) => a.surface === "backsplash")).toBe(true);
    expect(free.some((a) => a.surface === "floor")).toBe(true);
    expect(validateDraft(fillAll(free), "open")).toEqual({});
  });

  test("moving from the kitchen to a washroom drops the backsplash (no stray area needing a tile); the floor stays", () => {
    const kitchen = fillAll(applyTemplate([newArea("wall")], "kitchen"));
    const washroom = applyTemplate(kitchen, "washroom", "kitchen");
    expect(washroom.some((a) => a.surface === "backsplash")).toBe(false);
    expect(washroom.find((a) => a.surface === "floor")).toBeDefined();
    expect(washroom.filter((a) => a.wall).map((a) => a.wall)).toEqual(["C1", "C2", "C3"]);
    expect(validateDraft(fillAll(washroom), "c_shape")).toEqual({});
    // without the previous template nothing is dropped; moving to free naming keeps every surface as a plain area
    expect(applyTemplate(kitchen, "washroom").some((a) => a.surface === "backsplash")).toBe(true);
    expect(applyTemplate(kitchen, "free", "kitchen").some((a) => a.surface === "backsplash")).toBe(true);
    // an extra area that never belonged to a template (stair steps) survives every switch
    const withSteps = [...kitchen, newArea("step_tread")];
    expect(applyTemplate(withSteps, "washroom", "kitchen").some((a) => a.surface === "step_tread")).toBe(true);
  });

  test("an area belongs to a face only through its numbered wall or its surface", () => {
    const base = applyTemplate([newArea("wall")], "kitchen");
    for (const area of base) expect(faceOfArea(TEMPLATES.kitchen, area)).toBeDefined();
    expect(faceOfArea(TEMPLATES.kitchen, newArea("step_tread"))).toBeUndefined();
  });

  test("drafts saved before templates map their layout to a template", () => {
    expect(templateForLayout("open")).toBe("free");
    expect(templateForLayout("c_shape")).toBe("three_walls");
    expect(templateForLayout("l_shape")).toBe("corner");
  });
});

describe("puja mandir, balcony, feature wall and staircase templates", () => {
  test("every template id is defined and valid", () => {
    for (const id of TEMPLATE_IDS) expect(TEMPLATES[id].id).toBe(id);
    for (const id of ["puja_mandir", "balcony", "feature_wall", "staircase"]) expect(isTemplateId(id)).toBe(true);
  });

  test("puja mandir is a 3-wall room with a platform floor; balcony is a corner", () => {
    const mandir = applyTemplate([], "puja_mandir");
    expect(mandir.map((a) => a.wall ?? a.surface)).toEqual(expect.arrayContaining(["C1", "C2", "C3", "floor"]));
    const balcony = applyTemplate([], "balcony");
    expect(balcony.map((a) => a.wall ?? a.surface)).toEqual(expect.arrayContaining(["L1", "L2", "floor"]));
  });

  test("feature wall tiles only the middle wall and keeps the others", () => {
    const areas = applyTemplate([], "feature_wall");
    expect(areas.filter((a) => a.wall).map((a) => a.wall)).toEqual(["C2"]);
    expect(keptFaces(TEMPLATES.feature_wall, areas)).toEqual([]);
    const draft = areas.map((a) => withPattern(a, "single"));
    const payload = toPayload(draft, "c_shape");
    expect(payload.areas.filter((a) => a.wall).length).toBe(1);
  });

  test("staircase has treads and risers, no walls, from any previous template", () => {
    const areas = applyTemplate(applyTemplate([], "kitchen"), "staircase", "kitchen");
    expect(areas.map((a) => a.surface).sort()).toEqual(["step_riser", "step_tread"]);
    expect(areas.every((a) => !a.wall)).toBe(true);
    expect(keptFaces(TEMPLATES.staircase, areas)).toEqual([]);
    const off = toggleFace(areas, "staircase", "riser");
    expect(keptFaces(TEMPLATES.staircase, off).map((f) => f.key)).toEqual(["riser"]);
  });

  test("moving from the staircase to a washroom drops the stair areas", () => {
    const stairs = applyTemplate([], "staircase");
    const next = applyTemplate(stairs, "washroom", "staircase");
    expect(next.some((a) => a.surface === "step_tread" || a.surface === "step_riser")).toBe(false);
    expect(next.filter((a) => a.wall).length).toBe(3);
  });
});
