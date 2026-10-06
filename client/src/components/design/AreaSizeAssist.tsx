import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { PATTERNS } from "@/lib/designPatterns";
import { chosenTiles, tileFitsSurface, withPattern, type DraftArea } from "@/lib/designDraft";
import { MM_PER_UNIT, emptySize, rankTiles, sizeToDimensions, type AreaSize, type DimUnit, type PatternSuggestion } from "@/lib/fitRecommend";
import type { RoomType, Tile } from "@/api/types";
import { TileThumb } from "./TileThumb";

interface Props {
  area: DraftArea;
  roomType?: RoomType;
  catalog: Tile[];
  /** Tiles the room analysis recommended. */
  recommendedIds: Set<string>;
  suggestions: PatternSuggestion[];
  onChange: (next: DraftArea) => void;
  /** Called after a suggestion has been applied, so the card can bring the chosen tiles into view. */
  onApplied?: () => void;
}

const SQFT_PER_M2 = 10.763910416709722;
const box = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900";

/** Put a tile into the first empty slot (or replace the first slot when all are filled). Returns the new area and the slot used; null when the tile is already in the area. */
export function placeTile(area: DraftArea, tile: Tile): { area: DraftArea; slot: number } | null {
  if (area.slots.some((t) => t?.id === tile.id)) return null;
  const empty = area.slots.findIndex((t) => t === null);
  const at = empty === -1 ? 0 : empty;
  return { area: { ...area, slots: area.slots.map((t, i) => (i === at ? tile : t)) }, slot: at };
}

/**
 * The next suggested design: the layout at `index` (wrapping around the suggestions) with its required slots filled by the
 * best-fitting tiles, the pool rotated by `index` so that asking again gives a different combination. Replaces the
 * area's pattern and tiles on purpose: the owner asked for a suggestion. Returns what changed so the UI can say so.
 */
export function suggestDesignFor(area: DraftArea, suggestions: PatternSuggestion[], pool: Tile[], index: number): { area: DraftArea; pattern: PatternSuggestion["pattern"]; tiles: Tile[] } | null {
  if (pool.length === 0) return null;
  const pattern = suggestions.length > 0 ? suggestions[index % suggestions.length]!.pattern : area.pattern;
  const need = PATTERNS[pattern].min;
  const start = pool.length > 1 ? index % pool.length : 0;
  const rotated = [...pool.slice(start), ...pool.slice(0, start)];
  const tiles = rotated.slice(0, need);
  if (tiles.length < need) return null;
  const base = withPattern({ ...area, slots: area.slots.map(() => null) }, pattern);
  return { area: { ...base, slots: base.slots.map((_, i) => tiles[i] ?? null) }, pattern, tiles };
}

/**
 * Optional helper for one area. The owner may type the size of the wall / floor; the tiles that fit it with the least
 * cutting are then suggested, with the layouts that usually suit it. Nothing is applied until a button is tapped, every
 * tap says what it did (and can be undone), and a design is complete without any of this.
 */
export function AreaSizeAssist({ area, roomType, catalog, recommendedIds, suggestions, onChange, onApplied }: Props) {
  const size = area.size ?? emptySize();
  const flat = area.surface === "floor" || area.surface === "step_tread";
  const dims = sizeToDimensions(area.size);
  const fits = dims ? rankTiles(catalog, area.surface, dims.widthMm, dims.heightMm, { roomType, recommendedIds, limit: 3 }) : [];
  const aiPicks = dims ? [] : catalog.filter((t) => t.isActive && recommendedIds.has(t.id) && tileFitsSurface(t, area.surface)).slice(0, 3);
  const m2 = dims ? (dims.widthMm * dims.heightMm) / 1_000_000 : 0;
  const [suggestIndex, setSuggestIndex] = useState(0);
  // What the last tap did, with the area as it was before so it can be undone.
  const [note, setNote] = useState<{ text: string; before: DraftArea } | null>(null);

  const setSize = (next: AreaSize) => onChange({ ...area, size: next });
  function changeUnit(unit: DimUnit) {
    if (unit === size.unit) return;
    // Keep what the owner typed the same physical length: 10 ft becomes 3.05 m.
    const conv = (v: string) => {
      const n = Number(v.replace(",", "."));
      return v.trim() === "" || !Number.isFinite(n) ? v : String(Math.round(((n * MM_PER_UNIT[size.unit]) / MM_PER_UNIT[unit]) * 100) / 100);
    };
    setSize({ width: conv(size.width), height: conv(size.height), unit });
  }

  const roleOf = (slot: number) => PATTERNS[area.pattern].roles[slot] ?? `tile ${slot + 1}`;

  function useTile(tile: Tile) {
    const placed = placeTile(area, tile);
    if (!placed) {
      // Already in this area: say so and show where it is, instead of silently doing nothing.
      setNote({ text: `"${tile.name}" is already one of the tiles for this surface (see "Choose the tiles" below).`, before: area });
      onApplied?.();
      return;
    }
    setNote({ text: `Added "${tile.name}" as ${roleOf(placed.slot)}.`, before: area });
    onChange(placed.area);
    onApplied?.();
  }

  // "Suggest a design for me": the best layouts for this surface one after another, each with the best-fitting tiles.
  const pool = (fits.length > 0 ? fits.map((f) => f.tile) : aiPicks).concat(catalog.filter((t) => t.isActive && tileFitsSurface(t, area.surface)));
  const distinctPool = pool.filter((t, i) => pool.findIndex((o) => o.id === t.id) === i);
  function suggestDesign() {
    // If the next suggestion would leave the design exactly as it is, move on to the one after it.
    let idx = suggestIndex;
    let result = suggestDesignFor(area, suggestions, distinctPool, idx);
    const same = (r: NonNullable<typeof result>) => r.area.pattern === area.pattern && r.tiles.every((t, i) => area.slots[i]?.id === t.id);
    for (let tries = 0; result && same(result) && tries < Math.max(suggestions.length, distinctPool.length, 1) * 2; tries++) {
      idx += 1;
      result = suggestDesignFor(area, suggestions, distinctPool, idx);
    }
    setSuggestIndex(idx + 1);
    if (!result) {
      setNote({ text: "There are not enough tiles in your catalog for this surface yet. Add tiles in My Tiles first.", before: area });
      return;
    }
    setNote({ text: `Applied "${PATTERNS[result.pattern].label}" with ${result.tiles.map((t) => `"${t.name}"`).join(" and ")}. Change anything below, or tap again for another suggestion.`, before: area });
    onChange(result.area);
    onApplied?.();
  }

  return (
    <details className="group mt-4 rounded-xl border border-stone-200 bg-stone-50/70 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-medium text-stone-800">
        <span>
          Size and suggestions <span className="ml-1 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-600">Optional</span>
        </span>
        <span className="text-xs text-stone-500 group-open:hidden">Tell us the size to see the best-fit tiles</span>
      </summary>

      <div className="space-y-4 border-t border-stone-200 px-3.5 pb-4 pt-3">
        <div>
          <p className="text-xs text-stone-500">Measure the area to be tiled. Add it if you like: we then suggest the tiles that fit with the least cutting.</p>
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              {flat ? "Length" : "Width"}
              <Input className={cn(box, "mt-1 font-normal normal-case")} inputMode="decimal" value={size.width} onChange={(e) => setSize({ ...size, width: e.target.value })} placeholder={size.unit === "ft" ? "e.g. 10" : "e.g. 3"} />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
              {flat ? "Depth" : "Height"}
              <Input className={cn(box, "mt-1 font-normal normal-case")} inputMode="decimal" value={size.height} onChange={(e) => setSize({ ...size, height: e.target.value })} placeholder={size.unit === "ft" ? "e.g. 8" : "e.g. 2.4"} />
            </label>
            <div role="radiogroup" aria-label="Unit" className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
              {(["ft", "m"] as const).map((u) => (
                <button key={u} type="button" role="radio" aria-checked={size.unit === u} onClick={() => changeUnit(u)} className={cn("px-3 py-2 font-medium", size.unit === u ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-100")}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          {dims && (
            <p className="mt-2 text-xs text-stone-600">
              About <strong className="text-stone-900">{Math.round(m2 * SQFT_PER_M2)} sq ft</strong> ({m2.toFixed(1)} m²).
            </p>
          )}
        </div>

        {(fits.length > 0 || aiPicks.length > 0) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{dims ? "Best-fit tiles for this size" : "Recommended for your room"}</p>
            <ul className="mt-2 space-y-2">
              {(fits.length > 0 ? fits.map((f) => ({ tile: f.tile, note: f.label })) : aiPicks.map((t) => ({ tile: t, note: "Matched to your room by the AI" }))).map(({ tile, note: detail }, i) => {
                const inUse = chosenTiles(area).some((t) => t.id === tile.id);
                return (
                  <li key={tile.id} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2">
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-stone-200">
                      <TileThumb tile={tile} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-stone-900">
                        {i === 0 && dims && <span className="mr-1 text-clay-700">★ Best fit</span>}
                        {tile.name}
                      </span>
                      <span className="block truncate text-xs text-stone-500">{detail}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => useTile(tile)}
                      className={cn("shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium", inUse ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-clay-300 text-clay-700 hover:bg-clay-50")}
                    >
                      {inUse ? "✓ In use" : "Use"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {dims && fits.length === 0 && <p className="text-xs text-stone-500">None of your catalog tiles have a size we can match to this area. Add the tile size (e.g. 600x600) in My Tiles to see best-fit suggestions.</p>}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-clay-50 px-3 py-2.5">
            <p className="min-w-0 text-xs text-clay-900">
              <strong>{PATTERNS[suggestions[suggestIndex % suggestions.length]!.pattern].label}</strong>: {suggestions[suggestIndex % suggestions.length]!.reason}
            </p>
            <button type="button" disabled={distinctPool.length === 0} onClick={suggestDesign} className="shrink-0 rounded-lg bg-clay-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-clay-800 disabled:opacity-50">
              {suggestIndex === 0 ? "Suggest a design for me" : "Try another suggestion"}
            </button>
          </div>
        )}

        {note && (
          <div role="status" className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span>{note.text}</span>
            <button
              type="button"
              className="shrink-0 font-semibold underline"
              onClick={() => {
                onChange(note.before);
                setNote(null);
              }}
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
