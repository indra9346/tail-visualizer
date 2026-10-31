import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { tileFitsSurface } from "@/lib/designDraft";
import type { SurfaceType, Tile } from "@/api/types";
import { TileThumb } from "@/components/design/TileThumb";

interface Props {
  tiles: Tile[];
  loading: boolean;
  surface: SurfaceType;
  recommendedIds: Set<string>;
  /** The tiles already chosen for this area, in slot order (to tick them). */
  chosenIds: string[];
  onPick: (tile: Tile) => void;
  onAddPhoto: () => void;
}

const PAGE = 24;

/** Big tile photos to tap. Tiles that suit the room come first; only tiles that can go on this surface are shown. */
export function TileChooser({ tiles, loading, surface, recommendedIds, chosenIds, onPick, onAddPhoto }: Props) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tiles
      .filter((t) => t.isActive && tileFitsSurface(t, surface))
      .filter((t) => q === "" || [t.name, t.brand, t.colorFamily, t.finish, t.material, t.sku, t.sizeMm].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => Number(recommendedIds.has(b.id)) - Number(recommendedIds.has(a.id)));
  }, [tiles, surface, query, recommendedIds]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search tiles</span>
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Tile name, size or colour"
            aria-label="Search tiles"
            className="h-12 w-full rounded-2xl border-[1.5px] border-[#C9D2C6] bg-white pl-9 pr-3 text-base text-ink"
          />
        </label>
        <button type="button" onClick={onAddPhoto} className="h-12 shrink-0 rounded-2xl border-[1.5px] border-dashed border-[#8E9A8F] bg-white px-3.5 text-[15px] font-bold text-ink hover:bg-sage-100">
          + Add tile
        </button>
      </div>

      {loading ? (
        <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-busy="true" aria-label="Loading tiles">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-stone-200" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-5 text-center text-sm text-stone-600">
          {query ? "No tile matches that search." : "There are no tiles for this surface in your catalog yet."}{" "}
          <button type="button" onClick={onAddPhoto} className="font-semibold text-clay-700 underline">
            Add a tile photo
          </button>
        </div>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Tiles">
            {list.slice(0, shown).map((tile) => {
              const slot = chosenIds.indexOf(tile.id);
              const picked = slot !== -1;
              return (
                <li key={tile.id}>
                  <button
                    type="button"
                    onClick={() => onPick(tile)}
                    aria-pressed={picked}
                    aria-label={`${tile.name}${tile.sizeMm ? `, ${tile.sizeMm} mm` : ""}${recommendedIds.has(tile.id) ? ", good for this room" : ""}`}
                    className={cn(
                      "group relative block w-full overflow-hidden rounded-2xl bg-white p-1 text-left transition-all",
                      picked ? "border-[3px] border-stone-900 shadow-md" : "border-[1.5px] border-hairline hover:border-[#8E9A8F]",
                    )}
                  >
                    <span className="block aspect-square overflow-hidden rounded-xl bg-stone-100">
                      <TileThumb tile={tile} />
                    </span>
                    <span className="block px-1 pb-0.5 pt-1.5">
                      <span className="line-clamp-2 text-[13px] font-extrabold leading-4 text-ink">{tile.name}</span>
                      <span className="block truncate text-xs text-ink-secondary">
                        {[tile.sizeMm, tile.pricePerSqft != null ? `₹${tile.pricePerSqft}/sq ft` : null].filter(Boolean).join(" · ") || " "}
                      </span>
                    </span>
                    {recommendedIds.has(tile.id) && <span className="absolute left-2 top-2 rounded-full bg-[#F1E4C8] px-2 py-0.5 text-[10px] font-extrabold text-[#6B5326] shadow-sm">GOOD FIT</span>}
                    {picked && (
                      <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white shadow ring-2 ring-white" aria-hidden="true">
                        {chosenIds.length > 1 ? slot + 1 : "✓"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {list.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 h-12 w-full rounded-2xl border-[1.5px] border-[#C9D2C6] bg-white text-[15px] font-bold text-ink hover:bg-sage-100">
              Show more tiles ({list.length - shown} more)
            </button>
          )}
        </>
      )}
    </div>
  );
}
