import { cn } from "@/lib/cn";
import { PATTERNS, hintFor, patternsFor, type DesignPattern } from "@/lib/designPatterns";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import type { SurfaceType, Tile } from "@/api/types";
import { DEMO_COLORS, PatternDemo } from "@/components/design/PatternDemo";

interface Props {
  surface: SurfaceType;
  pattern: DesignPattern;
  tiles: Tile[];
  onChange: (pattern: DesignPattern) => void;
}

/** Short names anyone understands; the full name and hint are on the selected card. */
const SHORT: Record<DesignPattern, string> = {
  single: "Plain",
  checkerboard: "Chess board",
  horizontal_bands: "Bands",
  vertical_stripes: "Stripes",
  dado: "Two halves",
  highlighter_strip: "With a strip",
  border_frame: "With border",
  feature_panel: "Centre panel",
  herringbone: "Zig-zag",
  diagonal: "Diagonal",
  random_mix: "Mixed",
};

/** How the tiles are laid, picked by looking at small drawings (with the owner's own tiles once chosen). */
export function StylePicker({ surface, pattern, tiles, onChange }: Props) {
  const fills = (id: DesignPattern) => {
    const spec = PATTERNS[id];
    const n = tiles.length === 0 ? Math.max(1, spec.max) : Math.min(spec.max, Math.max(tiles.length, spec.min));
    return Array.from({ length: n }, (_, i) => (tiles[i] ? { color: DEMO_COLORS[i % 4]!, image: getPublicTileImageUrl(tiles[i]!.storagePath) } : { color: DEMO_COLORS[i % 4]! }));
  };
  return (
    <div>
      <div role="radiogroup" aria-label="Laying style" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {patternsFor(surface).map((id) => {
          const spec = PATTERNS[id];
          const active = id === pattern;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${SHORT[id]} (${spec.min === spec.max ? spec.min : `${spec.min}-${spec.max}`} tile${spec.max === 1 ? "" : "s"})`}
              onClick={() => onChange(id)}
              className={cn("w-[5.5rem] shrink-0 snap-start rounded-xl border-2 p-1 text-center transition-colors", active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-400")}
            >
              <PatternDemo pattern={id} fills={fills(id)} className="w-full rounded-lg bg-stone-100" />
              <span className="mt-1 block text-[11px] font-semibold leading-tight">{SHORT[id]}</span>
              <span className={cn("block text-[10px]", active ? "text-white/70" : "text-stone-400")}>{spec.min === spec.max ? spec.min : `${spec.min}-${spec.max}`} tile{spec.max === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-stone-500">{hintFor(pattern, surface)}</p>
    </div>
  );
}
