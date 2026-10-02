import type { SurfaceType, Tile } from "../api/types";
import { PATTERNS, SURFACES, isValidLabel, type DesignPattern } from "./designPatterns";

export const MAX_AREAS = 6;
export const MAX_DISTINCT_TILES = 8;

/** One editable area in the Design Studio. `slots[i]` fills role i of the pattern (null = not chosen yet). */
export interface DraftArea {
  key: string;
  surface: SurfaceType;
  location: string;
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
export function validateDraft(areas: DraftArea[]): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  const add = (key: string, message: string) => {
    (issues[key] ??= []).push(message);
  };

  if (areas.length === 0) add("_", "Add at least one area to design.");
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

export function toPayload(areas: DraftArea[]) {
  return {
    areas: areas.map((a) => ({
      surface: a.surface,
      location: a.location.replace(/\s+/g, " ").trim(),
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
export function saveDraft(roomId: string, areas: DraftArea[]): void {
  try {
    store()?.setItem(storageKey(roomId), JSON.stringify(areas));
  } catch {
    /* best effort */
  }
}

export function loadDraft(roomId: string): DraftArea[] | null {
  try {
    const raw = store()?.getItem(storageKey(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftArea[];
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((a) => a && a.surface in SURFACES && a.pattern in PATTERNS && Array.isArray(a.slots))
      .map((a) => ({ ...a, key: newKey(), slots: emptySlots(a.pattern).map((_, i) => a.slots[i] ?? null) }));
  } catch {
    return null;
  }
}
