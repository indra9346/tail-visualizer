import type { Design, SurfaceType, Tile } from "../api/types";
import { DESIGN_PATTERNS, PATTERNS, SURFACES, patternFitsSurface, rolesFor, type DesignPattern } from "./designPatterns";
import { decodeMask, encodeMask, fitMask, masksOverlap, paintedCount, type AreaMask } from "./areaMask";
import { MAX_AREAS, MAX_DISTINCT_TILES, emptySlots, newKey, tileFitsSurface } from "./designDraft";

/**
 * The easy visualizer: the owner says WHAT to tile (floor, walls, ...), MARKS where it is by painting on the photo,
 * and PICKS a tile. Each area is sent to the server as an ordinary design area plus its painted mask, which the
 * server draws onto a guide image for the AI. No room templates, numbered walls or naming are needed.
 */
export interface QuickArea {
  key: string;
  surface: SurfaceType;
  /** Where the area is on the photo; null = not marked (then it covers the whole surface, e.g. the entire floor). */
  mask: AreaMask | null;
  pattern: DesignPattern;
  /** slots[i] fills role i of the pattern; null = not chosen yet. */
  slots: Array<Tile | null>;
}

/** What the owner can choose to tile, in the order shown, with words anyone can follow. */
export const QUICK_SURFACES: Array<{ surface: SurfaceType; title: string; hint: string }> = [
  { surface: "floor", title: "Floor", hint: "The ground you walk on" },
  { surface: "wall", title: "Wall", hint: "Any wall of the room" },
  { surface: "backsplash", title: "Kitchen wall", hint: "Behind the stove and counter" },
  { surface: "shower_wall", title: "Bathroom wall", hint: "Inside the shower / wet area" },
  { surface: "step_tread", title: "Steps (top)", hint: "Where you put your foot" },
  { surface: "step_riser", title: "Steps (front)", hint: "The upright face of each step" },
];

export const surfaceTitle = (surface: SurfaceType) => QUICK_SURFACES.find((s) => s.surface === surface)?.title ?? SURFACES[surface].label;

export function newQuickArea(surface: SurfaceType): QuickArea {
  return { key: newKey(), surface, mask: null, pattern: "single", slots: emptySlots("single") };
}

export const isMarked = (area: QuickArea) => area.mask !== null && paintedCount(area.mask) > 0;

export function chosen(area: QuickArea): Tile[] {
  return area.slots.filter((t): t is Tile => t !== null);
}

/** Switching the laying style keeps the tiles already chosen, in order. */
export function withQuickPattern(area: QuickArea, pattern: DesignPattern): QuickArea {
  const tiles = chosen(area);
  return { ...area, pattern, slots: emptySlots(pattern).map((_, i) => tiles[i] ?? null) };
}

/** The tile goes into `slot`; the same tile is never in two slots of one area (it moves instead). */
export function withTile(area: QuickArea, slot: number, tile: Tile): QuickArea {
  const slots = area.slots.map((t, i) => (i === slot ? tile : t?.id === tile.id ? null : t));
  return { ...area, slots };
}

/**
 * The name the server and the result page show for an area. A marked area is found by its paint, so its name only
 * has to be unique ("Marked wall", "Marked wall 2"); an unmarked one covers the whole surface ("Entire floor").
 */
export function quickLocation(areas: QuickArea[], area: QuickArea): string {
  if (!isMarked(area)) return SURFACES[area.surface].defaultLocation;
  const sameKind = areas.filter((a) => a.surface === area.surface && isMarked(a));
  const n = sameKind.findIndex((a) => a.key === area.key) + 1;
  const base = `Marked ${surfaceTitle(area.surface).toLowerCase()}`;
  return n > 1 ? `${base} ${n}` : base;
}

/** Plain-language problems per area key, plus design-wide ones under "_". Empty = ready to make the real photo. */
export function quickIssues(areas: QuickArea[]): Record<string, string[]> {
  const issues: Record<string, string[]> = {};
  const add = (key: string, message: string) => (issues[key] ??= []).push(message);
  if (areas.length === 0) add("_", "Choose what you want to tile.");
  if (areas.length > MAX_AREAS) add("_", `You can tile at most ${MAX_AREAS} areas in one photo.`);
  const distinct = new Set(areas.flatMap((a) => chosen(a).map((t) => t.id)));
  if (distinct.size > MAX_DISTINCT_TILES) add("_", `Use at most ${MAX_DISTINCT_TILES} different tiles in one photo.`);

  for (const area of areas) {
    const title = surfaceTitle(area.surface).toLowerCase();
    const sameSurface = areas.filter((a) => a.surface === area.surface).length;
    // Two areas of one surface can only be told apart by where they are painted.
    if (sameSurface > 1 && !isMarked(area)) add(area.key, `You have more than one ${title} area: paint where this one is on the photo.`);
    const spec = PATTERNS[area.pattern];
    if (!patternFitsSurface(area.pattern, area.surface)) add(area.key, `"${spec.label}" can't be used on a ${title}. Choose another style.`);
    const tiles = chosen(area);
    const firstGap = area.slots.findIndex((t) => t === null);
    if (tiles.length < spec.min) {
      add(area.key, spec.min === 1 ? `Pick a tile for the ${title}.` : `Pick ${spec.min} tiles for the ${title} (${rolesFor(area.pattern, area.surface).slice(0, spec.min).join(", ")}).`);
    } else if (firstGap !== -1 && area.slots.slice(firstGap).some((t) => t !== null)) {
      add(area.key, `Pick the ${rolesFor(area.pattern, area.surface)[firstGap] ?? "missing"} tile first.`);
    }
    for (const tile of tiles) {
      if (!tileFitsSurface(tile, area.surface)) add(area.key, `"${tile.name}" is a ${tile.category} tile: it can't go on a ${title}.`);
      if (!tile.isActive) add(area.key, `"${tile.name}" is hidden in your catalog. Pick another tile.`);
    }
    for (const other of areas) {
      if (other.key === area.key) break;
      if (area.mask && other.mask && masksOverlap(area.mask, other.mask)) add(area.key, "This area is painted on the same spot as another one. Paint it again.");
    }
  }
  return issues;
}

export function toQuickPayload(areas: QuickArea[]) {
  return {
    areas: areas.map((a) => ({
      surface: a.surface,
      location: quickLocation(areas, a),
      pattern: a.pattern,
      tileIds: chosen(a).map((t) => t.id),
      ...(isMarked(a) ? { mask: encodeMask(fitMask(a.mask!)) } : {}),
    })),
  };
}

/** True for a design the easy visualizer made (it has painted areas): "Edit" reopens it there, not in the Advanced studio. */
export function isQuickDesign(design: Design | null | undefined): boolean {
  return Boolean(design && !design.layout && design.areas.some((a) => a.mask));
}

/** Where "Edit / Try another tile" on a result or in History takes the owner. */
export function editPathFor(design: Design | null | undefined, roomId: string): string {
  return isQuickDesign(design) ? `/visualize/${roomId}` : `/tiles/${roomId}`;
}

/** Rebuilds the easy visualizer's areas from a generated design. A tile no longer in the catalog leaves its slot empty. */
export function quickFromDesign(design: Design, tiles: Tile[]): QuickArea[] | null {
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const areas = design.areas
    .filter((a) => a.surface in SURFACES && (DESIGN_PATTERNS as readonly string[]).includes(a.pattern) && !a.wall)
    .map((a): QuickArea => {
      const pattern = a.pattern as DesignPattern;
      return {
        key: newKey(),
        surface: a.surface,
        mask: a.mask ? decodeMask(a.mask) : null,
        pattern,
        slots: emptySlots(pattern).map((_, i) => (a.tileIds[i] ? (byId.get(a.tileIds[i]!) ?? null) : null)),
      };
    });
  return areas.length > 0 ? areas.slice(0, MAX_AREAS) : null;
}

// ---------- the unfinished design survives a refresh ----------

const draftKey = (roomId: string) => `tile-visualizer:quick:${roomId}`;

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
// Typed through globalThis so this module also type-checks in the server-side Jest project (no DOM lib there).
const store = (): KeyValueStore | undefined => (globalThis as { sessionStorage?: KeyValueStore }).sessionStorage;

interface StoredArea {
  surface: SurfaceType;
  mask: string | null;
  pattern: DesignPattern;
  slots: Array<Tile | null>;
}

export interface QuickDraft {
  areas: QuickArea[];
  note: string;
}

export function saveQuickDraft(roomId: string, draft: QuickDraft): void {
  try {
    const areas: StoredArea[] = draft.areas.map((a) => ({ surface: a.surface, mask: isMarked(a) ? encodeMask(a.mask!) : null, pattern: a.pattern, slots: a.slots }));
    store()?.setItem(draftKey(roomId), JSON.stringify({ areas, note: draft.note }));
  } catch {
    /* best effort: the design still works, it just will not survive a refresh */
  }
}

export function loadQuickDraft(roomId: string): QuickDraft | null {
  try {
    const raw = store()?.getItem(draftKey(roomId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { areas?: unknown; note?: unknown };
    if (!Array.isArray(parsed.areas)) return null;
    const areas = (parsed.areas as StoredArea[])
      .filter((a) => a && a.surface in SURFACES && a.pattern in PATTERNS && Array.isArray(a.slots))
      .slice(0, MAX_AREAS)
      .map((a): QuickArea => ({
        key: newKey(),
        surface: a.surface,
        mask: typeof a.mask === "string" ? decodeMask(a.mask) : null,
        pattern: a.pattern,
        slots: emptySlots(a.pattern).map((_, i) => a.slots[i] ?? null),
      }));
    return { areas, note: typeof parsed.note === "string" ? parsed.note : "" };
  } catch {
    return null;
  }
}

export function clearQuickDraft(roomId: string): void {
  try {
    store()?.removeItem(draftKey(roomId));
  } catch {
    /* ignore */
  }
}
