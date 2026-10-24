import type { SurfaceType } from "../api/types";
import { LAYOUTS, type RoomLayout, type WallId } from "./roomLayouts";
import { applyLayout, chosenTiles, newArea, toggleWall, type DraftArea } from "./designDraft";

/**
 * Room templates: ready-made room boxes (washroom, kitchen, ...) shown as a 3D CAD-style box in the
 * Design Studio. Every face of the box is one surface of the room - floor, left / back / right wall,
 * kitchen backsplash - and each can be TILED (it gets a tile design) or KEPT (it stays exactly as in
 * the customer's photo). A face with no area is always "kept", so a surface the owner did not choose
 * can never be tiled by accident.
 *
 * A template is only a front end for the existing design model: it picks the room layout (which
 * numbers the connected walls) and adds/removes the matching areas, so the server needs no template
 * concept - it validates and prompts from the same layout + areas as before.
 */
export const TEMPLATE_IDS = ["washroom", "washroom_corner", "kitchen", "three_walls", "corner", "puja_mandir", "balcony", "feature_wall", "staircase", "free"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Where a face sits in the 3D box. */
export type FaceRole = "floor" | "left" | "back" | "right" | "backsplash" | "tread" | "riser";
export type SceneKind = "box" | "corner" | "kitchen" | "stairs" | "none";

export interface FaceSpec {
  /** Stable key within a template. */
  key: string;
  role: FaceRole;
  /** Short name shown on the switch list and in the picture. */
  label: string;
  surface: SurfaceType;
  /** Numbered wall of the template's layout (walls only). */
  wall?: WallId;
  /** Area name for floor / backsplash faces (walls take their canonical numbered label). */
  location: string;
  /** Explains what the face covers; shown on its area card. */
  note: string;
  /** Offered in the switch list but switched off when the template is chosen (e.g. the walls that are not the feature wall). */
  startsOff?: boolean;
}

export interface RoomTemplate {
  id: TemplateId;
  label: string;
  blurb: string;
  layout: RoomLayout;
  scene: SceneKind;
  faces: FaceSpec[];
}

const floor: FaceSpec = { key: "floor", role: "floor", label: "Floor", surface: "floor", location: "Entire floor", note: "Template surface: the floor. Only the floor is changed here." };

const boxFaces = (): FaceSpec[] => [
  floor,
  { key: "C1", role: "left", label: "Left wall (C1)", surface: "wall", wall: "C1", location: "C1 (left wall)", note: "" },
  { key: "C2", role: "back", label: "Back wall (C2)", surface: "wall", wall: "C2", location: "C2 (middle wall)", note: "" },
  { key: "C3", role: "right", label: "Right wall (C3)", surface: "wall", wall: "C3", location: "C3 (right wall)", note: "" },
];

const cornerFaces = (): FaceSpec[] => [
  floor,
  { key: "L1", role: "left", label: "Left wall (L1)", surface: "wall", wall: "L1", location: "L1 (left wall)", note: "" },
  { key: "L2", role: "right", label: "Right wall (L2)", surface: "wall", wall: "L2", location: "L2 (right wall)", note: "" },
];

export const TEMPLATES: Record<TemplateId, RoomTemplate> = {
  washroom: {
    id: "washroom",
    label: "Washroom",
    blurb: "Box room: left, back and right wall + floor",
    layout: "c_shape",
    scene: "box",
    faces: boxFaces(),
  },
  washroom_corner: {
    id: "washroom_corner",
    label: "Washroom corner",
    blurb: "Two connected walls (L) + floor",
    layout: "l_shape",
    scene: "corner",
    faces: cornerFaces(),
  },
  kitchen: {
    id: "kitchen",
    label: "Kitchen",
    blurb: "Walls + counter backsplash + floor",
    layout: "c_shape",
    scene: "kitchen",
    faces: [
      ...boxFaces(),
      {
        key: "backsplash",
        role: "backsplash",
        label: "Backsplash",
        surface: "backsplash",
        location: "Kitchen backsplash",
        note: "Template surface: the wall zone between the counter and the wall cabinets. The back wall covers the rest of that wall.",
      },
    ],
  },
  three_walls: {
    id: "three_walls",
    label: "Any room: 3 walls",
    blurb: "Three connected walls (C) + floor",
    layout: "c_shape",
    scene: "box",
    faces: boxFaces(),
  },
  corner: {
    id: "corner",
    label: "Any room: corner",
    blurb: "Two connected walls (L) + floor",
    layout: "l_shape",
    scene: "corner",
    faces: cornerFaces(),
  },
  puja_mandir: {
    id: "puja_mandir",
    label: "Puja mandir",
    blurb: "Prayer room / mandir: 3 panels + platform floor",
    layout: "c_shape",
    scene: "box",
    faces: [
      // Its own name, so the AI tiles the platform and not the whole room floor around it.
      { ...floor, label: "Platform / floor", location: "Mandir platform", note: "Template surface: the mandir platform. Only the platform is changed here; rename it (e.g. Prayer room floor) if the whole floor should be tiled." },
      { key: "C1", role: "left", label: "Left panel (C1)", surface: "wall", wall: "C1", location: "C1 (left wall)", note: "" },
      { key: "C2", role: "back", label: "Back panel (C2)", surface: "wall", wall: "C2", location: "C2 (middle wall)", note: "" },
      { key: "C3", role: "right", label: "Right panel (C3)", surface: "wall", wall: "C3", location: "C3 (right wall)", note: "" },
    ],
  },
  balcony: {
    id: "balcony",
    label: "Balcony / terrace",
    blurb: "Two connected parapet or house walls + floor",
    layout: "l_shape",
    scene: "corner",
    faces: [
      { ...floor, label: "Balcony floor", note: "Template surface: the balcony or terrace floor. Only the floor is changed here." },
      { key: "L1", role: "left", label: "Left wall (L1)", surface: "wall", wall: "L1", location: "L1 (left wall)", note: "" },
      { key: "L2", role: "right", label: "Right wall (L2)", surface: "wall", wall: "L2", location: "L2 (right wall)", note: "" },
    ],
  },
  feature_wall: {
    id: "feature_wall",
    label: "Feature wall",
    blurb: "One accent wall (living room, TV unit, bed head) + floor. Switch on whichever wall is the feature wall",
    layout: "c_shape",
    scene: "box",
    faces: [
      floor,
      { key: "C1", role: "left", label: "Left wall (C1)", surface: "wall", wall: "C1", location: "C1 (left wall)", note: "", startsOff: true },
      { key: "C2", role: "back", label: "Back wall (C2)", surface: "wall", wall: "C2", location: "C2 (middle wall)", note: "" },
      { key: "C3", role: "right", label: "Right wall (C3)", surface: "wall", wall: "C3", location: "C3 (right wall)", note: "", startsOff: true },
    ],
  },
  staircase: {
    id: "staircase",
    label: "Staircase",
    blurb: "Step treads (top) and risers (front of each step)",
    layout: "open",
    scene: "stairs",
    faces: [
      { key: "tread", role: "tread", label: "Step treads", surface: "step_tread", location: "All stair treads", note: "Template surface: the flat top of every step. Only the treads are changed here." },
      { key: "riser", role: "riser", label: "Step risers", surface: "step_riser", location: "All stair risers", note: "Template surface: the upright front of every step. Only the risers are changed here." },
    ],
  },
  free: {
    id: "free",
    label: "Free naming",
    blurb: "Name each area yourself",
    layout: "open",
    scene: "none",
    faces: [],
  },
};

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && (TEMPLATE_IDS as readonly string[]).includes(value);
}

/** Drafts saved before templates existed only knew the layout. */
export function templateForLayout(layout: RoomLayout): TemplateId {
  return layout === "c_shape" ? "three_walls" : layout === "l_shape" ? "corner" : "free";
}

/**
 * The template a generated design most likely came from ("Edit design" reopens it). The server stores only the
 * layout and the areas, so the room type and the surfaces decide: a C-shape with a backsplash is the kitchen.
 */
export function templateForDesign(layout: RoomLayout, areas: DraftArea[], roomType?: string): TemplateId {
  if (layout === "c_shape") {
    if (areas.some((a) => a.surface === "backsplash")) return "kitchen";
    return roomType === "bathroom" ? "washroom" : "three_walls";
  }
  if (layout === "l_shape") return roomType === "bathroom" ? "washroom_corner" : roomType === "balcony" ? "balcony" : "corner";
  return areas.length > 0 && areas.every((a) => a.surface === "step_tread" || a.surface === "step_riser") ? "staircase" : "free";
}

/** Free-naming name of a numbered wall: leaving a template must never turn the walls into one "All walls". */
const FREE_WALL_NAME: Record<WallId, string> = { C1: "Left wall", C2: "Back wall", C3: "Right wall", L1: "Left wall", L2: "Right wall" };

/** The template's surfaces in its own order (floor, walls left to right, backsplash); extra areas keep their order after them. */
export function sortByFaces(template: RoomTemplate, areas: DraftArea[]): DraftArea[] {
  const rank = (a: DraftArea) => {
    const i = template.faces.findIndex((f) => faceMatchesArea(f, a));
    return i === -1 ? template.faces.length : i;
  };
  return areas
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i)
    .map((x) => x.a);
}

export function faceMatchesArea(face: FaceSpec, area: DraftArea): boolean {
  return face.wall ? area.wall === face.wall : !area.wall && area.surface === face.surface;
}

export function areaOfFace(areas: DraftArea[], face: FaceSpec): DraftArea | undefined {
  return areas.find((a) => faceMatchesArea(face, a));
}

/** The template face an area belongs to, if any (areas with no face are free extras such as stair steps). */
export function faceOfArea(template: RoomTemplate, area: DraftArea): FaceSpec | undefined {
  return template.faces.find((f) => faceMatchesArea(f, area));
}

/** Faces whose surface the owner did not choose: these stay exactly as in the photo. */
export function keptFaces(template: RoomTemplate, areas: DraftArea[]): FaceSpec[] {
  return template.faces.filter((f) => !areaOfFace(areas, f));
}

/**
 * Choosing a template.
 * - Same wall shape as before (Washroom -> Kitchen): every wall keeps its own tiles and its on/off choice.
 * - Another shape: wall areas become the template's numbered walls (each starting from the first wall design that
 *   has tiles), all switched on except the faces marked startsOff.
 * - Free naming: each numbered wall becomes a named wall ("Left wall"), so walls the owner kept are never tiled.
 * The floor / backsplash faces are added when missing. Left behind: the surfaces of the PREVIOUS template the new one
 * does not have (e.g. the kitchen backsplash when moving to a washroom), and any area the app itself created (a
 * template face or the first guess from the photo) that never got a tile. What the owner added or tiled stays.
 */
export function applyTemplate(areas: DraftArea[], id: TemplateId, previous?: TemplateId): DraftArea[] {
  const template = TEMPLATES[id];
  const before = previous && previous !== id ? TEMPLATES[previous] : undefined;
  const stray = (a: DraftArea) =>
    !a.wall && !faceOfArea(template, a) && ((before !== undefined && Boolean(faceOfArea(before, a))) || (a.auto === true && chosenTiles(a).length === 0));
  const kept = template.faces.length > 0 ? areas.filter((a) => !stray(a)) : areas;

  let next: DraftArea[];
  if (before && before.layout === template.layout && template.layout !== "open") {
    next = kept;
    // A wall the previous template did not offer at all starts the way this template says.
    const offeredBefore = new Set(before.faces.map((f) => f.wall).filter((w): w is WallId => Boolean(w)));
    for (const face of template.faces) {
      if (face.wall && !face.startsOff && !offeredBefore.has(face.wall) && !next.some((a) => a.wall === face.wall)) next = toggleWall(next, template.layout, face.wall);
    }
  } else if (template.layout === "open" && kept.some((a) => a.wall)) {
    next = kept.map(({ wall, ...a }) => (wall ? { ...a, location: FREE_WALL_NAME[wall] } : a));
  } else {
    next = applyLayout(kept, template.layout);
    const off = new Set(template.faces.filter((f) => f.wall && f.startsOff).map((f) => f.wall));
    if (off.size > 0) next = next.filter((a) => !(a.wall && off.has(a.wall)));
  }
  // A template that names its walls (e.g. one feature wall) keeps only those; a template with no wall faces (stairs) keeps none.
  if (template.faces.length > 0) {
    const walls = template.faces.filter((f) => f.wall).map((f) => f.wall);
    next = next.filter((a) => (a.surface !== "wall" && a.surface !== "step_riser") || (a.wall ? walls.includes(a.wall) : a.surface === "step_riser"));
  }
  for (const face of template.faces) {
    if (face.wall || face.startsOff || areaOfFace(next, face)) continue;
    next = [...next, { ...newArea(face.surface, face.location), auto: true }];
  }
  return sortByFaces(template, next);
}

/** Switch one face on (add its area) or off (remove it: the surface is kept as in the photo). */
export function toggleFace(areas: DraftArea[], id: TemplateId, faceKey: string): DraftArea[] {
  const template = TEMPLATES[id];
  const face = template.faces.find((f) => f.key === faceKey);
  if (!face) return areas;
  if (face.wall) return sortByFaces(template, toggleWall(areas, template.layout, face.wall));
  const existing = areaOfFace(areas, face);
  return existing ? areas.filter((a) => a.key !== existing.key) : sortByFaces(template, [...areas, { ...newArea(face.surface, face.location), auto: true }]);
}

/** The area of a face, adding it first when the face was switched off (clicking a face in the 3D box means "tile this"). */
export function ensureFace(areas: DraftArea[], id: TemplateId, faceKey: string): { areas: DraftArea[]; area: DraftArea | undefined } {
  const face = TEMPLATES[id].faces.find((f) => f.key === faceKey);
  if (!face) return { areas, area: undefined };
  const have = areaOfFace(areas, face);
  if (have) return { areas, area: have };
  const next = toggleFace(areas, id, faceKey);
  return { areas: next, area: areaOfFace(next, face) };
}

/** Human-readable list of the walls and surfaces the template keeps; used in summaries. */
export function keptLabels(template: RoomTemplate, areas: DraftArea[]): string[] {
  return keptFaces(template, areas).map((f) => f.label);
}

export function templateLayoutLabel(id: TemplateId): string {
  return LAYOUTS[TEMPLATES[id].layout].label;
}
