import type { SurfaceType } from "../api/types";

/**
 * UI mirror of server/ai/designPatterns.ts (the client cannot import server code).
 * id / min / max / roles MUST match the server; test/designPatterns.test.ts fails
 * if they drift. `hint` is UI-only help text.
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
}

export const PATTERNS: Record<DesignPattern, PatternInfo> = {
  single: { label: "Single tile (plain)", min: 1, max: 1, roles: ["main tile"], hint: "One tile, laid evenly across the area." },
  checkerboard: { label: "Checkerboard", min: 2, max: 2, roles: ["first tile", "second tile"], hint: "Two tiles alternating like a chessboard." },
  horizontal_bands: {
    label: "Horizontal bands",
    min: 2,
    max: 4,
    roles: ["bottom band", "second band", "third band", "top band"],
    hint: "Rows of different tiles stacked from the bottom up.",
  },
  vertical_stripes: {
    label: "Vertical stripes",
    min: 2,
    max: 4,
    roles: ["first stripe", "second stripe", "third stripe", "fourth stripe"],
    hint: "Columns of different tiles from left to right.",
  },
  dado: { label: "Dado (lower + upper)", min: 2, max: 2, roles: ["lower section (dado)", "upper section"], hint: "One tile below, another above. Add a height in the note, e.g. 4 ft." },
  highlighter_strip: {
    label: "Highlighter strip",
    min: 2,
    max: 3,
    roles: ["main field", "highlighter strip", "upper field (optional)"],
    hint: "A single decorative row across the wall.",
  },
  border_frame: { label: "Border frame", min: 2, max: 2, roles: ["field", "border"], hint: "A tile framed by a border of another tile." },
  feature_panel: { label: "Feature panel", min: 2, max: 2, roles: ["field", "feature panel"], hint: "A centred accent panel, e.g. behind the basin or mirror." },
  herringbone: { label: "Herringbone", min: 1, max: 2, roles: ["main tile", "alternate tile (optional)"], hint: "Interlocking zig-zag laying." },
  diagonal: { label: "Diagonal (45°)", min: 1, max: 2, roles: ["main tile", "alternate tile (optional)"], hint: "Tiles turned 45° to the walls." },
  random_mix: { label: "Random mix", min: 2, max: 4, roles: ["tile 1", "tile 2", "tile 3", "tile 4"], hint: "A pleasing random blend of several tiles." },
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

/** Mirrors the server's label rule so the form can warn before submitting. */
export const LABEL_PATTERN = /^[\p{L}\p{N} .,'&()/+-]+$/u;
export function isValidLabel(value: string, max: number): boolean {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length >= 1 && v.length <= max && LABEL_PATTERN.test(v) && !/-{3,}/.test(v);
}
