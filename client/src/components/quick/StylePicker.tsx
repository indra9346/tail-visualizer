import { cn } from "@/lib/cn";
import { PATTERNS, hintFor, patternsFor, type DesignPattern } from "@/lib/designPatterns";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import type { SurfaceType, Tile } from "@/api/types";
import { DEMO_COLORS, PatternDemo } from "@/components/design/PatternDemo";

/** Names anyone understands, said the way a tile shop says them. */
export const STYLE_NAMES: Record<DesignPattern, string> = {
  single: "One tile",
  checkerboard: "Checkerboard",
  horizontal_bands: "Bands",
  vertical_stripes: "Stripes",
  dado: "Dark below, light above",
  highlighter_strip: "Dark + strip + light",
  border_frame: "Border frame",
  feature_panel: "Centre panel",
  herringbone: "Zig-zag",
  diagonal: "Diagonal",
  random_mix: "Mixed",
};

/** The style most bathroom and kitchen walls in a showroom are sold as. */
const MOST_USED: Partial<Record<SurfaceType, DesignPattern>> = { wall: "highlighter_strip", shower_wall: "highlighter_strip", backsplash: "highlighter_strip" };

interface Props {
  surface: SurfaceType;
  pattern: DesignPattern;
  tiles: Tile[];
  onChange: (pattern: DesignPattern) => void;
}

/** How the tiles are laid, picked by looking at pictures (drawn with the owner's own tiles once chosen). */
export function StylePicker({ surface, pattern, tiles, onChange }: Props) {
  const fills = (id: DesignPattern) => {
    const spec = PATTERNS[id];
    const n = tiles.length === 0 ? Math.max(1, spec.max) : Math.min(spec.max, Math.max(tiles.length, spec.min));
    return Array.from({ length: n }, (_, i) => (tiles[i] ? { color: DEMO_COLORS[i % 4]!, image: getPublicTileImageUrl(tiles[i]!.storagePath) } : { color: DEMO_COLORS[i % 4]! }));
  };
  return (
    <div>
      <div role="radiogroup" aria-label="Laying style" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {patternsFor(surface).map((id) => {
          const spec = PATTERNS[id];
          const active = id === pattern;
          const count = spec.min === spec.max ? `${spec.min}` : `${spec.min}-${spec.max}`;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${STYLE_NAMES[id]} (${count} tile${spec.max === 1 ? "" : "s"})`}
              onClick={() => onChange(id)}
              className={cn("relative rounded-2xl bg-white p-1.5 text-center transition-colors", active ? "border-[3px] border-stone-900" : "border-[1.5px] border-hairline hover:border-[#8E9A8F]")}
            >
              <PatternDemo pattern={id} fills={fills(id)} className="w-full rounded-xl bg-stone-100" />
              {MOST_USED[surface] === id && <span className="absolute left-2.5 top-2.5 rounded-full bg-[#F1E4C8] px-1.5 py-0.5 text-[10px] font-extrabold text-[#6B5326]">MOST USED</span>}
              <span className="mt-1.5 block text-[13px] font-extrabold leading-4 text-ink">{STYLE_NAMES[id]}</span>
              <span className="block text-xs text-ink-secondary">
                {count} tile{spec.max === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-ink-secondary">{hintFor(pattern, surface)}</p>
    </div>
  );
}
