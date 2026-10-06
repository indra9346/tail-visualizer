/**
 * Connected-wall room layouts.
 *
 * In an L-shaped room (2 connected walls) or a C-shaped room (3 connected walls)
 * every wall is its own independent area: it gets its own tile / combo pattern,
 * or is explicitly KEPT as it is in the photo. The numbering is fixed and tied to
 * what the showroom owner can see in the customer's photo (left to right), so
 * "C2 (middle wall)" always means the same wall to the owner and to the model.
 *
 * `open` is the original free-naming behaviour (any room, areas named by hand)
 * and stays the default, so every existing design and request keeps working.
 *
 * client/src/lib/roomLayouts.ts mirrors this table for the UI (the client cannot
 * import server code); test/roomLayouts.test.ts fails if the two ever drift apart.
 * The wording in `shape` / `position` is trusted, server-controlled prompt text.
 */
export const ROOM_LAYOUTS = ["open", "l_shape", "c_shape"] as const;
export type RoomLayout = (typeof ROOM_LAYOUTS)[number];

export const WALL_IDS = ["L1", "L2", "C1", "C2", "C3"] as const;
export type WallId = (typeof WALL_IDS)[number];

export interface WallSpec {
  id: WallId;
  /** Canonical area name: always used as the area's location, so it cannot be mistyped or duplicated. */
  label: string;
  /** Where the wall is in the photo; used verbatim in the generation prompt. */
  position: string;
}

export interface LayoutSpec {
  label: string;
  /** How the walls are joined; used verbatim in the generation prompt. Empty for `open`. */
  shape: string;
  walls: WallSpec[];
}

export const LAYOUT_SPECS: Record<RoomLayout, LayoutSpec> = {
  open: { label: "Free naming (any room)", shape: "", walls: [] },
  l_shape: {
    label: "L-shape (2 connected walls)",
    shape: "an L shape: two walls that meet at one inside corner",
    walls: [
      { id: "L1", label: "L1 (left wall)", position: "the left-hand wall as seen in the photo" },
      { id: "L2", label: "L2 (right wall)", position: "the right-hand wall as seen in the photo; it meets L1 at the inside corner" },
    ],
  },
  c_shape: {
    label: "C-shape (3 connected walls)",
    shape: "a C shape (a U-shaped alcove): three connected walls in a row, joined by two inside corners",
    walls: [
      { id: "C1", label: "C1 (left wall)", position: "the left-most wall as seen in the photo" },
      { id: "C2", label: "C2 (middle wall)", position: "the middle wall between C1 and C3; it meets C1 and C3 at the two inside corners" },
      { id: "C3", label: "C3 (right wall)", position: "the right-most wall as seen in the photo" },
    ],
  },
};

export function isRoomLayout(value: string): value is RoomLayout {
  return Object.prototype.hasOwnProperty.call(LAYOUT_SPECS, value);
}

export function wallsOfLayout(layout: RoomLayout): WallSpec[] {
  return LAYOUT_SPECS[layout].walls;
}

export function wallSpec(layout: RoomLayout, id: WallId): WallSpec | undefined {
  return LAYOUT_SPECS[layout].walls.find((w) => w.id === id);
}

/**
 * Free-form wall names that claim EVERY wall ("All walls", "All four walls",
 * "Entire wall"...). Such an area overlaps any other wall area, so a design may
 * not combine them (the model would receive two contradictory instructions).
 */
const ALL_WALLS = /^(all|every|entire|whole)\b.*\bwalls?\b/i;
export function coversAllWalls(location: string): boolean {
  return ALL_WALLS.test(location.replace(/\s+/g, " ").trim());
}

/** Walls of the layout that have NO area in the design = walls to keep exactly as in the photo. */
export function keptWalls(layout: RoomLayout, usedWalls: Array<WallId | undefined>): WallSpec[] {
  const used = new Set(usedWalls.filter((w): w is WallId => w !== undefined));
  return wallsOfLayout(layout).filter((w) => !used.has(w.id));
}
