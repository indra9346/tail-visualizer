import type { SurfaceType } from "../api/types";
import { LAYOUTS, type RoomLayout, type WallId } from "./roomLayouts";
import { applyLayout, newArea, toggleWall, type DraftArea } from "./designDraft";

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
export const TEMPLATE_IDS = ["washroom", "washroom_corner", "kitchen", "three_walls", "corner", "free"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Where a face sits in the 3D box. */
export type FaceRole = "floor" | "left" | "back" | "right" | "backsplash";
export type SceneKind = "box" | "corner" | "kitchen" | "none";

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
 * Choosing a template. Wall areas become the template's numbered walls (each starting from the first
 * wall design that has tiles); the floor / backsplash faces are added when missing. Everything starts
 * switched on - the owner then switches off whatever must stay as it is. Extra areas are untouched, except the
 * surfaces of the PREVIOUS template that the new one does not have (e.g. the kitchen backsplash when moving to a
 * washroom): they would otherwise stay behind as stray areas still needing a tile.
 */
export function applyTemplate(areas: DraftArea[], id: TemplateId, previous?: TemplateId): DraftArea[] {
  const template = TEMPLATES[id];
  const before = previous && previous !== id ? TEMPLATES[previous] : undefined;
  const kept =
    before && template.faces.length > 0
      ? areas.filter((a) => a.wall || !faceOfArea(before, a) || faceOfArea(template, a))
      : areas;
  let next = applyLayout(kept, template.layout);
  for (const face of template.faces) {
    if (face.wall || areaOfFace(next, face)) continue;
    next = [...next, newArea(face.surface, face.location)];
  }
  return next;
}

/** Switch one face on (add its area) or off (remove it: the surface is kept as in the photo). */
export function toggleFace(areas: DraftArea[], id: TemplateId, faceKey: string): DraftArea[] {
  const template = TEMPLATES[id];
  const face = template.faces.find((f) => f.key === faceKey);
  if (!face) return areas;
  if (face.wall) return toggleWall(areas, template.layout, face.wall);
  const existing = areaOfFace(areas, face);
  return existing ? areas.filter((a) => a.key !== existing.key) : [...areas, newArea(face.surface, face.location)];
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
