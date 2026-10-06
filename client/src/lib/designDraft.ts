import type { SurfaceType, Tile } from "../api/types";
import { PATTERNS, SURFACES, isValidLabel, type DesignPattern } from "./designPatterns";
import { LAYOUTS, ROOM_LAYOUTS, coversAllWalls, wallInfo, type RoomLayout, type WallId } from "./roomLayouts";

export const MAX_AREAS = 6;
export const MAX_DISTINCT_TILES = 8;

/** One editable area in the Design Studio. `slots[i]` fills role i of the pattern (null = not chosen yet). */
export interface DraftArea {
  key: string;
  surface: SurfaceType;
  location: string;
  /** Set only for a numbered wall of an L / C layout; its `location` is then that wall's fixed label. */
  wall?: WallId;
  pattern: DesignPattern;
  patternNote: string;
  slots: Array<Tile | null>;
}

let counter = 0;
export function newKey(): string {
  counter += 1;
  return `area-${Date.now().toString(36)}-${counter}`;
}

export function emptySlots(pattern: DesignPattern): Array<Tile | null> {
  return Array.from({ length: PATTERNS[pattern].max }, () => null);
}

export function newArea(surface: SurfaceType, location?: string): DraftArea {
  return {
    key: newKey(),
    surface,
    location: location ?? SURFACES[surface].defaultLocation,
    pattern: "single",
    patternNote: "",
    slots: emptySlots("single"),
  };
}

/** A wall area of an L / C layout. `template` (another wall's design) is copied so the same tile can be reused in one tap. */
export function newWallArea(layout: RoomLayout, wallId: WallId, template?: DraftArea): DraftArea {
  const info = wallInfo(layout, wallId);
  const base = newArea("wall", info?.label ?? wallId);
  const pattern = template?.pattern ?? base.pattern;
  return {
    ...base,
    wall: wallId,
    pattern,
    patternNote: template?.patternNote ?? "",
    slots: emptySlots(pattern).map((_, i) => template?.slots[i] ?? null),
  };
}

const isWallSurface = (a: DraftArea) => a.surface === "wall";

/**
 * Switching the room layout. Existing WALL areas are replaced by the new layout's walls (one area per
 * wall, all selected), each starting from the design of the first wall area that has tiles, so choosing
 * "C-shape" on a finished "All walls" design immediately gives C1, C2 and C3 with that same design.
 * Non-wall areas (floor, steps, ...) are untouched. Switching back to free naming collapses to one "All walls" area.
 */
export function applyLayout(areas: DraftArea[], next: RoomLayout): DraftArea[] {
  const wallAreas = areas.filter(isWallSurface);
  const template = wallAreas.find((a) => chosenTiles(a).length > 0) ?? wallAreas[0];
  const firstWallIndex = areas.findIndex(isWallSurface);
  const others = areas.filter((a) => !isWallSurface(a));
  const insertAt = firstWallIndex === -1 ? others.length : areas.slice(0, firstWallIndex).filter((a) => !isWallSurface(a)).length;
  const replacement =
    next === "open"
      ? wallAreas.length > 0
        ? [{ ...newArea("wall", SURFACES.wall.defaultLocation), pattern: template!.pattern, patternNote: template!.patternNote, slots: template!.slots.map((t) => t) }]
        : []
      : LAYOUTS[next].walls.map((w) => newWallArea(next, w.id, template));
  return [...others.slice(0, insertAt), ...replacement, ...others.slice(insertAt)];
}

/** Turn one numbered wall on (tile it) or off (keep it as it is). A new wall starts from another wall's design. */
export function toggleWall(areas: DraftArea[], layout: RoomLayout, wallId: WallId): DraftArea[] {
  if (layout === "open") return areas;
  if (areas.some((a) => a.wall === wallId)) return areas.filter((a) => a.wall !== wallId);
  const order = LAYOUTS[layout].walls.map((w) => w.id);
  const added = newWallArea(layout, wallId, areas.find((a) => a.wall && chosenTiles(a).length > 0));
  // Keep the walls in left-to-right order: place it after the last earlier wall, else before the first later wall, else at the end.
  const idx = order.indexOf(wallId);
  let insertAfter = -1;
  let insertBefore = -1;
  areas.forEach((a, i) => {
    const w = a.wall ? order.indexOf(a.wall) : -1;
    if (w === -1) return;
    if (w < idx) insertAfter = i;
    else if (insertBefore === -1) insertBefore = i;
  });
  const at = insertAfter !== -1 ? insertAfter + 1 : insertBefore !== -1 ? insertBefore : areas.length;
  return [...areas.slice(0, at), added, ...areas.slice(at)];
}

/** Switching pattern keeps the tiles already chosen (in order) and resizes the slot list. */
export function withPattern(area: DraftArea, pattern: DesignPattern): DraftArea {
  const chosen = area.slots.filter((t): t is Tile => t !== null);
  const slots = emptySlots(pattern).map((_, i) => chosen[i] ?? null);
  return { ...area, pattern, slots };
}

export function tileFitsSurface(tile: Tile, surface: SurfaceType): boolean {
  return tile.category === "both" || tile.category === SURFACES[surface].kind;
}

export function chosenTiles(area: DraftArea): Tile[] {
  return area.slots.filter((t): t is Tile => t !== null);
}

export function distinctTileCount(areas: DraftArea[]): number {
  return new Set(areas.flatMap((a) => chosenTiles(a).map((t) => t.id))).size;
}

/** Human-readable problems per area key, plus design-wide problems under "_". Empty object = ready to generate. */
export function validateDraft(areas: DraftArea[], layout: RoomLayout = "open"): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  const add = (key: string, message: string) => {
    (issues[key] ??= []).push(message);
  };

  if (areas.length === 0) add("_", layout === "open" ? "Add at least one area to design." : "Select at least one wall (or add another area) to finish.");

  // Connected-wall rules (mirrored on the server): in an L / C layout every wall area is one numbered wall,
  // each at most once; with free naming no numbered wall may exist and "All walls" cannot share the design with another wall area.
  const wallAreas = areas.filter(isWallSurface);
  const usedWalls = new Set<WallId>();
  for (const area of areas) {
    if (layout === "open") {
      if (area.wall) add(area.key, `Wall ${area.wall} needs an L-shape or C-shape room layout.`);
      else if (isWallSurface(area) && wallAreas.length > 1 && coversAllWalls(area.location)) {
        add(area.key, `"${area.location}" already covers every wall, so it can't be combined with another wall area. Remove it or name specific walls.`);
      }
      continue;
    }
    if (!isWallSurface(area)) {
      if (area.wall) add(area.key, "Only a wall area can be a numbered wall.");
      continue;
    }
    if (!area.wall || !wallInfo(layout, area.wall)) {
      add(area.key, `Pick one of the ${LAYOUTS[layout].short} walls: ${LAYOUTS[layout].walls.map((w) => w.label).join(", ")}.`);
    } else if (usedWalls.has(area.wall)) {
      add(area.key, `Wall ${area.wall} appears twice.`);
    } else {
      usedWalls.add(area.wall);
    }
  }
  if (areas.length > MAX_AREAS) add("_", `A design can have at most ${MAX_AREAS} areas.`);
  if (distinctTileCount(areas) > MAX_DISTINCT_TILES) add("_", `A design can use at most ${MAX_DISTINCT_TILES} different tiles.`);

  const seen = new Set<string>();
  for (const area of areas) {
    const spec = PATTERNS[area.pattern];
    const tiles = chosenTiles(area);

    if (!isValidLabel(area.location, 80)) add(area.key, "Name the location with letters, numbers and simple punctuation (up to 80 characters).");
    if (area.patternNote.trim() !== "" && !isValidLabel(area.patternNote, 160)) add(area.key, "The pattern note may only use letters, numbers and simple punctuation (up to 160 characters).");

    const firstGap = area.slots.findIndex((t) => t === null);
    if (tiles.length < spec.min) {
      const missing = spec.roles.slice(0, spec.min).filter((_, i) => area.slots[i] === null);
      add(area.key, `Choose ${missing.length === 1 ? "the" : "all"} required tile${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
    } else if (firstGap !== -1 && area.slots.slice(firstGap).some((t) => t !== null)) {
      add(area.key, "Fill the tile slots in order, without leaving a gap.");
    }
    if (new Set(tiles.map((t) => t.id)).size !== tiles.length) add(area.key, "Use a different tile in each slot of the same area.");
    for (const tile of tiles) {
      if (!tileFitsSurface(tile, area.surface)) add(area.key, `"${tile.name}" is a ${tile.category} tile and can't go on ${SURFACES[area.surface].label.toLowerCase()}.`);
      if (!tile.isActive) add(area.key, `"${tile.name}" is hidden in your catalog. Show it again or pick another tile.`);
    }

    const dupKey = `${area.surface}|${area.location.trim().toLowerCase()}`;
    if (seen.has(dupKey)) add(area.key, "Another area already has the same surface and location.");
    seen.add(dupKey);
  }
  return issues;
}

export function toPayload(areas: DraftArea[], layout: RoomLayout = "open") {
  return {
    ...(layout !== "open" ? { layout } : {}),
    areas: areas.map((a) => ({
      surface: a.surface,
      location: a.location.replace(/\s+/g, " ").trim(),
      ...(a.wall ? { wall: a.wall } : {}),
      pattern: a.pattern,
      ...(a.patternNote.trim() !== "" ? { patternNote: a.patternNote.replace(/\s+/g, " ").trim() } : {}),
      tileIds: chosenTiles(a).map((t) => t.id),
    })),
  };
}

const storageKey = (roomId: string) => `tile-visualizer:design:${roomId}`;

// Typed through globalThis so this module also type-checks in the server-side Jest project (no DOM lib there).
interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const store = (): KeyValueStore | undefined => (globalThis as { sessionStorage?: KeyValueStore }).sessionStorage;

/** The unfinished design survives a refresh. Only public catalog data and the owner's own choices are stored. */
export function saveDraft(roomId: string, areas: DraftArea[], layout: RoomLayout = "open"): void {
  try {
    store()?.setItem(storageKey(roomId), JSON.stringify({ layout, areas }));
  } catch {
    /* best effort */
  }
}

export interface LoadedDraft {
  layout: RoomLayout;
  areas: DraftArea[];
}

/** Reads a saved draft. Accepts the earlier format (a bare array of areas) as free naming. */
export function loadDraft(roomId: string): LoadedDraft | null {
  try {
    const raw = store()?.getItem(storageKey(roomId));
    if (!raw) return null;
    const parsedRaw = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsedRaw) ? parsedRaw : (parsedRaw as { areas?: unknown })?.areas;
    if (!Array.isArray(list)) return null;
    const saved = Array.isArray(parsedRaw) ? undefined : (parsedRaw as { layout?: string }).layout;
    const layout: RoomLayout = (ROOM_LAYOUTS as readonly string[]).includes(saved ?? "") ? (saved as RoomLayout) : "open";
    const areas = (list as DraftArea[])
      .filter((a) => a && a.surface in SURFACES && a.pattern in PATTERNS && Array.isArray(a.slots))
      // A numbered wall only makes sense inside a layout that has it; anything else falls back to a plain wall area.
      .map((a) => ({
        ...a,
        wall: layout !== "open" && a.wall && wallInfo(layout, a.wall) ? a.wall : undefined,
        key: newKey(),
        slots: emptySlots(a.pattern).map((_, i) => a.slots[i] ?? null),
      }))
      .map(({ wall, ...rest }) => (wall ? { ...rest, wall } : rest));
    return { layout, areas };
  } catch {
    return null;
  }
}
