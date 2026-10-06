/**
 * UI mirror of server/ai/roomLayouts.ts (the client cannot import server code).
 * Layout ids, wall ids and wall labels MUST match the server; test/roomLayouts.test.ts
 * fails if they drift. `hint` / `position` are UI-only help text.
 *
 * Connected walls (L = 2 walls, C = 3 walls) are numbered LEFT TO RIGHT as they appear
 * in the customer's photo. Each wall is its own area: it gets its own tile / combo
 * pattern, or it is kept exactly as it is in the photo.
 */
export const ROOM_LAYOUTS = ["open", "l_shape", "c_shape"] as const;
export type RoomLayout = (typeof ROOM_LAYOUTS)[number];

export const WALL_IDS = ["L1", "L2", "C1", "C2", "C3"] as const;
export type WallId = (typeof WALL_IDS)[number];

export interface WallInfo {
  id: WallId;
  label: string;
  /** Short place name shown in the UI. */
  place: string;
}

export interface LayoutInfo {
  label: string;
  short: string;
  hint: string;
  walls: WallInfo[];
}

export const LAYOUTS: Record<RoomLayout, LayoutInfo> = {
  open: {
    label: "Free naming (any room)",
    short: "Any room",
    hint: "Name each area yourself, for example Back wall or Wall behind basin.",
    walls: [],
  },
  l_shape: {
    label: "L-shape (2 connected walls)",
    short: "L-shape",
    hint: "Two walls that meet at one corner. Tile both, or only one and keep the other as it is.",
    walls: [
      { id: "L1", label: "L1 (left wall)", place: "Left wall" },
      { id: "L2", label: "L2 (right wall)", place: "Right wall" },
    ],
  },
  c_shape: {
    label: "C-shape (3 connected walls)",
    short: "C-shape",
    hint: "Three walls in a row, like a C. For example tile C1 and C3 and keep the middle wall C2 as it is.",
    walls: [
      { id: "C1", label: "C1 (left wall)", place: "Left wall" },
      { id: "C2", label: "C2 (middle wall)", place: "Middle wall" },
      { id: "C3", label: "C3 (right wall)", place: "Right wall" },
    ],
  },
};

export function wallInfo(layout: RoomLayout, id: WallId): WallInfo | undefined {
  return LAYOUTS[layout].walls.find((w) => w.id === id);
}

/** Mirrors the server's rule: a free-form name that claims EVERY wall cannot sit next to another wall area. */
const ALL_WALLS = /^(all|every|entire|whole)\b.*\bwalls?\b/i;
export function coversAllWalls(location: string): boolean {
  return ALL_WALLS.test(location.replace(/\s+/g, " ").trim());
}

/** Walls of the layout with no area in the design: these stay exactly as in the photo. */
export function keptWalls(layout: RoomLayout, usedWalls: Array<WallId | undefined | null>): WallInfo[] {
  const used = new Set(usedWalls.filter((w): w is WallId => !!w));
  return LAYOUTS[layout].walls.filter((w) => !used.has(w.id));
}
