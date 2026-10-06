import { cn } from "@/lib/cn";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { DESIGN_PATTERNS, PATTERNS, type DesignPattern } from "@/lib/designPatterns";
import type { PatternSuggestion } from "@/lib/fitRecommend";
import type { Tile } from "@/api/types";
import { DEMO_COLORS, PatternDemo, type DemoFill } from "./PatternDemo";

interface Props {
  pattern: DesignPattern;
  /** The tiles chosen so far for this area: the demos use their photos, so the preview matches the real combination. */
  tiles: Tile[];
  suggestions: PatternSuggestion[];
  onChange: (pattern: DesignPattern) => void;
}

const tileCountText = (min: number, max: number) => (min === max ? `${min} tile${min === 1 ? "" : "s"}` : `${min} to ${max} tiles`);

/** Demo fills for a pattern: the owner's chosen tiles first, then neutral colours for the roles not chosen yet. */
function fillsFor(pattern: DesignPattern, tiles: Tile[]): DemoFill[] {
  const need = Math.max(1, PATTERNS[pattern].max);
  return Array.from({ length: need }, (_, i) => {
    const tile = tiles[i];
    return tile ? { color: DEMO_COLORS[i % DEMO_COLORS.length]!, image: getPublicTileImageUrl(tile.storagePath) } : { color: DEMO_COLORS[i % DEMO_COLORS.length]! };
  });
}

/**
 * Pick a layout by LOOKING at it: every pattern is drawn on a small wall (with the chosen tiles when there are any), and the
 * selected one is shown larger with what each tile slot does. Suggested layouts for the surface are starred, never forced.
 */
export function PatternPicker({ pattern, tiles, suggestions, onChange }: Props) {
  const spec = PATTERNS[pattern];
  const suggested = new Map(suggestions.map((s) => [s.pattern, s.reason]));
  return (
    <div>
      {suggestions.length > 0 && (
        <p className="mb-2 text-xs text-stone-600">
          <span className="font-semibold text-clay-700">Suggested for this surface:</span>{" "}
          {suggestions.map((s, i) => (
            <button
              key={s.pattern}
              type="button"
              onClick={() => onChange(s.pattern)}
              title={s.reason}
              className={cn("mr-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-clay-50", s.pattern === pattern ? "border-clay-600 bg-clay-50 text-clay-800" : "border-clay-300 text-clay-700")}
            >
              {i === 0 ? "★ " : ""}
              {PATTERNS[s.pattern].label}
            </button>
          ))}
        </p>
      )}

      <div role="radiogroup" aria-label="Layout pattern" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {DESIGN_PATTERNS.map((id) => {
          const p = PATTERNS[id];
          const active = id === pattern;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(id)}
              title={suggested.get(id) ?? p.hint}
              className={cn(
                "group relative flex flex-col rounded-xl border p-1.5 text-left transition-colors",
                active ? "border-stone-900 bg-stone-900 text-white shadow" : "border-stone-200 bg-white hover:border-stone-500",
              )}
            >
              <PatternDemo pattern={id} fills={fillsFor(id, tiles)} className="w-full rounded-lg bg-stone-100" label={`${p.label} demo`} />
              <span className="mt-1.5 px-0.5 text-[11px] font-semibold leading-tight">{p.label}</span>
              <span className={cn("px-0.5 text-[10px] leading-tight", active ? "text-white/70" : "text-stone-500")}>{tileCountText(p.min, p.max)}</span>
              {suggested.has(id) && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-clay-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white shadow">★ Suggested</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 sm:flex-row sm:items-center">
        <PatternDemo pattern={pattern} fills={fillsFor(pattern, tiles)} className="w-full max-w-[200px] shrink-0 self-center rounded-lg sm:self-auto" label={`${spec.label} large demo`} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-stone-900">{spec.label}</p>
          <p className="text-stone-600">{spec.hint}</p>
          {suggested.get(pattern) && <p className="mt-1 text-xs text-clay-800">★ {suggested.get(pattern)}</p>}
          <p className="mt-1.5 text-xs text-stone-500">
            Tiles: {spec.roles.slice(0, spec.max).map((role, i) => (
              <span key={role}>
                {i > 0 ? ", " : ""}
                <span className="font-medium text-stone-700">{i + 1}</span> {role}
                {i >= spec.min && !/optional/i.test(role) ? " (optional)" : ""}
              </span>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
