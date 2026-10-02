/**
 * Layout patterns a showroom can apply to ONE area (e.g. "back wall") using one
 * or several tiles. The `prompt` text is trusted, server-controlled wording that
 * is placed into the generation prompt; customers only ever choose a pattern id,
 * never write this text. Tiles are consumed in the order listed under `roles`.
 *
 * client/src/lib/designPatterns.ts mirrors id / label / min / max / roles for the
 * UI (the client cannot import server code); test/designPatterns.test.ts fails if
 * the two ever drift apart.
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

export interface PatternSpec {
  label: string;
  min: number;
  max: number;
  roles: string[];
  prompt: string;
}

export const PATTERN_SPECS: Record<DesignPattern, PatternSpec> = {
  single: {
    label: "Single tile (plain)",
    min: 1,
    max: 1,
    roles: ["main tile"],
    prompt: "Cover the whole area uniformly with the tile, laid in a regular straight grid with even grout lines.",
  },
  checkerboard: {
    label: "Checkerboard",
    min: 2,
    max: 2,
    roles: ["first tile", "second tile"],
    prompt:
      "Lay the two tiles alternately like a chessboard: every tile of one design is surrounded on its four sides by tiles of the other design, in both directions.",
  },
  horizontal_bands: {
    label: "Horizontal bands",
    min: 2,
    max: 4,
    roles: ["bottom band", "second band", "third band", "top band"],
    prompt:
      "Lay full-width horizontal bands (rows). Repeat the listed tiles in order from the bottom of the area upward, each band one tile row high, keeping the grout lines continuous.",
  },
  vertical_stripes: {
    label: "Vertical stripes",
    min: 2,
    max: 4,
    roles: ["first stripe", "second stripe", "third stripe", "fourth stripe"],
    prompt:
      "Lay full-height vertical stripes (columns). Repeat the listed tiles in order from left to right, each stripe one tile wide, keeping the grout lines continuous.",
  },
  dado: {
    label: "Dado (lower + upper)",
    min: 2,
    max: 2,
    roles: ["lower section (dado)", "upper section"],
    prompt:
      "Split the area horizontally in two. The lower section (dado) uses the first tile up to a typical dado height of about one metre (about 3 ft) unless the pattern note gives another height; the upper section above it uses the second tile. Finish the join with a clean, straight transition line.",
  },
  highlighter_strip: {
    label: "Highlighter strip",
    min: 2,
    max: 3,
    roles: ["main field", "highlighter strip", "upper field (optional)"],
    prompt:
      "Cover the area with the first tile and run ONE continuous horizontal highlighter strip, a single tile row high, of the second tile across the full width at roughly mid-height unless the pattern note says otherwise. If a third tile is given, use it for the field above the strip.",
  },
  border_frame: {
    label: "Border frame",
    min: 2,
    max: 2,
    roles: ["field", "border"],
    prompt:
      "Cover the inside of the area with the first tile and frame it with a continuous border, one tile wide, of the second tile along the edges of the area.",
  },
  feature_panel: {
    label: "Feature panel",
    min: 2,
    max: 2,
    roles: ["field", "feature panel"],
    prompt:
      "Cover the area with the first tile and create one neat rectangular feature panel of the second tile, centred on the area and about one third of its width, from near the floor line (or bottom edge) up to about two thirds of its height unless the pattern note says otherwise.",
  },
  herringbone: {
    label: "Herringbone",
    min: 1,
    max: 2,
    roles: ["main tile", "alternate tile (optional)"],
    prompt:
      "Lay the tile in a herringbone arrangement (rectangular tiles interlocking at right angles in a zig-zag). If a second tile is given, alternate the two by plank.",
  },
  diagonal: {
    label: "Diagonal (45°)",
    min: 1,
    max: 2,
    roles: ["main tile", "alternate tile (optional)"],
    prompt:
      "Lay the tile on the diagonal at 45 degrees to the walls, with straight even grout lines. If a second tile is given, alternate the two like a diagonal checkerboard.",
  },
  random_mix: {
    label: "Random mix",
    min: 2,
    max: 4,
    roles: ["tile 1", "tile 2", "tile 3", "tile 4"],
    prompt:
      "Mix the listed tiles in a pleasing random arrangement in roughly equal proportions, avoiding two identical tiles touching where possible.",
  },
};

export function isDesignPattern(value: string): value is DesignPattern {
  return Object.prototype.hasOwnProperty.call(PATTERN_SPECS, value);
}
