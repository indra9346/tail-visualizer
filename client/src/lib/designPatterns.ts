import type { SurfaceType } from "../api/types";

/**
 * UI mirror of server/ai/designPatterns.ts (the client cannot import server code).
 * id / min / max / roles / floorRoles / surfaces MUST match the server;
 * test/designStudio.test.ts fails if they drift. `hint` / `floorHint` are UI-only help text.
 */
export const DESIGN_PATTERNS = [
  "single",
  "checkerboard",
  "horizontal_bands",
  "vertical_stripes",
  "dado",
  "highlighter_strip",
  "border_frame",
  "feature_panel",
  "herringbone",
  "diagonal",
  "random_mix",
] as const;
export type DesignPattern = (typeof DESIGN_PATTERNS)[number];

export interface PatternInfo {
  label: string;
  min: number;
  max: number;
  roles: string[];
  hint: string;
  /** Surfaces this layout can be laid on (a dado or an eye-level strip has no meaning on a floor). */
  surfaces: readonly SurfaceType[];
  /** Role names on a flat surface (floor, stair tread) when they differ from the wall ones. */
  floorRoles?: string[];
  floorHint?: string;
}

const ALL_SURFACES: readonly SurfaceType[] = ["floor", "wall", "backsplash", "shower_wall", "step_tread", "step_riser"];
/** Large flat or upright fields; not the narrow face of a stair step. */
const FIELD_SURFACES: readonly SurfaceType[] = ["floor", "wall", "backsplash", "shower_wall"];

export const PATTERNS: Record<DesignPattern, PatternInfo> = {
  single: { label: "Single tile (plain)", min: 1, max: 1, roles: ["main tile"], hint: "One tile, laid evenly across the area.", surfaces: ALL_SURFACES },
  checkerboard: { label: "Checkerboard", min: 2, max: 2, roles: ["first tile", "second tile"], hint: "Two tiles alternating like a chessboard.", surfaces: ALL_SURFACES },
  horizontal_bands: {
    label: "Horizontal bands",
    min: 2,
    max: 4,
    roles: ["bottom band", "second band", "third band", "top band"],
    hint: "Rows of different tiles stacked from the bottom up.",
    surfaces: FIELD_SURFACES,
    floorRoles: ["front band (nearest the camera)", "second band", "third band", "back band"],
    floorHint: "Bands across the floor, from the front (nearest the camera) to the back.",
  },
  vertical_stripes: {
    label: "Vertical stripes",
    min: 2,
    max: 4,
    roles: ["first stripe", "second stripe", "third stripe", "fourth stripe"],
    hint: "Columns of different tiles from left to right.",
    surfaces: ALL_SURFACES,
    floorHint: "Stripes running away from the camera, repeated from left to right.",
  },
  dado: { label: "Dado (lower + upper)", min: 2, max: 2, roles: ["lower section (dado)", "upper section"], hint: "One tile below, another above. Add a height in the note, e.g. 4 ft.", surfaces: ["wall", "shower_wall"] },
  highlighter_strip: {
    label: "Highlighter strip",
    min: 2,
    max: 3,
    roles: ["main field", "highlighter strip", "upper field (optional)"],
    hint: "A single decorative row across the wall.",
    surfaces: ["wall", "backsplash", "shower_wall"],
  },
  border_frame: {
    label: "Border frame",
    min: 2,
    max: 2,
    roles: ["field", "border"],
    hint: "A tile framed by a border of another tile.",
    surfaces: FIELD_SURFACES,
    floorHint: "A border of the second tile along the edges of the floor.",
  },
  feature_panel: {
    label: "Feature panel",
    min: 2,
    max: 2,
    roles: ["field", "feature panel"],
    hint: "A centred accent panel, e.g. behind the basin or mirror.",
    surfaces: FIELD_SURFACES,
    floorHint: "A centred inset of the second tile, like a rug.",
  },
  herringbone: { label: "Herringbone", min: 1, max: 2, roles: ["main tile", "alternate tile (optional)"], hint: "Interlocking zig-zag laying.", surfaces: ALL_SURFACES },
  diagonal: { label: "Diagonal (45°)", min: 1, max: 2, roles: ["main tile", "alternate tile (optional)"], hint: "Tiles turned 45° to the walls.", surfaces: ALL_SURFACES },
  random_mix: { label: "Random mix", min: 2, max: 4, roles: ["tile 1", "tile 2", "tile 3", "tile 4"], hint: "A pleasing random blend of several tiles.", surfaces: ALL_SURFACES },
};

export interface SurfaceInfo {
  label: string;
  /** Which tile category the surface needs. */
  kind: "floor" | "wall";
  /** One-tap location names shown as chips; the user can also type their own. */
  locations: string[];
  defaultLocation: string;
}

export const SURFACES: Record<SurfaceType, SurfaceInfo> = {
  floor: { label: "Floor", kind: "floor", locations: ["Entire floor", "Floor near entrance", "Shower floor area"], defaultLocation: "Entire floor" },
  wall: {
    label: "Wall",
    kind: "wall",
    locations: ["All walls", "Back wall", "Left wall", "Right wall", "Front wall", "Wall behind toilet", "Wall behind basin", "Accent wall"],
    defaultLocation: "All walls",
  },
  backsplash: { label: "Backsplash", kind: "wall", locations: ["Kitchen backsplash"], defaultLocation: "Kitchen backsplash" },
  shower_wall: { label: "Shower wall", kind: "wall", locations: ["Shower walls", "Shower back wall"], defaultLocation: "Shower walls" },
  step_tread: { label: "Step treads", kind: "floor", locations: ["All stair treads"], defaultLocation: "All stair treads" },
  step_riser: { label: "Step risers", kind: "wall", locations: ["All stair risers"], defaultLocation: "All stair risers" },
};

export const SURFACE_ORDER = Object.keys(SURFACES) as SurfaceType[];

export function patternFitsSurface(pattern: DesignPattern, surface: SurfaceType): boolean {
  return PATTERNS[pattern].surfaces.includes(surface);
}

/** The layouts offered for a surface, in library order. */
export function patternsFor(surface: SurfaceType): DesignPattern[] {
  return DESIGN_PATTERNS.filter((p) => patternFitsSurface(p, surface));
}

/** Role names in tile order for this surface (floors name their bands front to back). */
export function rolesFor(pattern: DesignPattern, surface: SurfaceType): string[] {
  const spec = PATTERNS[pattern];
  return SURFACES[surface].kind === "floor" && spec.floorRoles ? spec.floorRoles : spec.roles;
}

export function hintFor(pattern: DesignPattern, surface: SurfaceType): string {
  const spec = PATTERNS[pattern];
  return SURFACES[surface].kind === "floor" && spec.floorHint ? spec.floorHint : spec.hint;
}

/** Mirrors the server's label rule so the form can warn before submitting. */
export const LABEL_PATTERN = /^[\p{L}\p{N} .,'&()/+-]+$/u;
export function isValidLabel(value: string, max: number): boolean {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length >= 1 && v.length <= max && LABEL_PATTERN.test(v) && !/-{3,}/.test(v);
}
