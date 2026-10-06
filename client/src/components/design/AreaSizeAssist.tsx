import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { PATTERNS } from "@/lib/designPatterns";
import { tileFitsSurface, withPattern, type DraftArea } from "@/lib/designDraft";
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
}

const SQFT_PER_M2 = 10.763910416709722;
const box = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900";

/** Put a tile into the first empty slot (or replace the first slot when all are filled). A tile already in the area is left alone. */
function withTile(area: DraftArea, tile: Tile): DraftArea {
  if (area.slots.some((t) => t?.id === tile.id)) return area;
  const empty = area.slots.findIndex((t) => t === null);
  const at = empty === -1 ? 0 : empty;
  return { ...area, slots: area.slots.map((t, i) => (i === at ? tile : t)) };
}

/**
 * Optional helper for one area. The owner may type the size of the wall / floor; the tiles that fit it with the least
 * cutting are then suggested, with the layouts that usually suit it. Nothing is applied until a button is tapped, and a
 * design is complete without any of this.
 */
export function AreaSizeAssist({ area, roomType, catalog, recommendedIds, suggestions, onChange }: Props) {
  const size = area.size ?? emptySize();
  const flat = area.surface === "floor" || area.surface === "step_tread";
  const dims = sizeToDimensions(area.size);
  const fits = dims ? rankTiles(catalog, area.surface, dims.widthMm, dims.heightMm, { roomType, recommendedIds, limit: 3 }) : [];
  const aiPicks = dims ? [] : catalog.filter((t) => t.isActive && recommendedIds.has(t.id) && tileFitsSurface(t, area.surface)).slice(0, 3);
  const m2 = dims ? (dims.widthMm * dims.heightMm) / 1_000_000 : 0;

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

  // "Suggest a design for me": the best layout for this surface with the best-fitting tiles in its first slots. Optional, undoable by editing.
  const pool = (fits.length > 0 ? fits.map((f) => f.tile) : aiPicks).concat(
    catalog.filter((t) => t.isActive && tileFitsSurface(t, area.surface)),
  );
  const distinctPool = pool.filter((t, i) => pool.findIndex((o) => o.id === t.id) === i);
  function suggestDesign() {
    const pattern = suggestions[0]?.pattern ?? area.pattern;
    let next = withPattern(area, pattern);
    const need = PATTERNS[pattern].min;
    for (const tile of distinctPool) {
      if (next.slots.slice(0, need).every((t) => t !== null)) break;
      next = withTile(next, tile);
    }
    onChange(next);
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
              {(fits.length > 0 ? fits.map((f) => ({ tile: f.tile, note: f.label })) : aiPicks.map((t) => ({ tile: t, note: "Matched to your room by the AI" }))).map(({ tile, note }, i) => (
                <li key={tile.id} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2">
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-stone-200">
                    <TileThumb tile={tile} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-stone-900">
                      {i === 0 && dims && <span className="mr-1 text-clay-700">★ Best fit</span>}
                      {tile.name}
                    </span>
                    <span className="block truncate text-xs text-stone-500">{note}</span>
                  </span>
                  <button type="button" onClick={() => onChange(withTile(area, tile))} className="shrink-0 rounded-md border border-clay-300 px-2.5 py-1 text-xs font-medium text-clay-700 hover:bg-clay-50">
                    Use
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dims && fits.length === 0 && <p className="text-xs text-stone-500">None of your catalog tiles have a size we can match to this area. Add the tile size (e.g. 600x600) in My Tiles to see best-fit suggestions.</p>}

        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-clay-50 px-3 py-2.5">
            <p className="min-w-0 text-xs text-clay-900">
              <strong>{PATTERNS[suggestions[0]!.pattern].label}</strong>: {suggestions[0]!.reason}
            </p>
            <button type="button" disabled={distinctPool.length === 0} onClick={suggestDesign} className="shrink-0 rounded-lg bg-clay-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-clay-800 disabled:opacity-50">
              Suggest a design for me
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
