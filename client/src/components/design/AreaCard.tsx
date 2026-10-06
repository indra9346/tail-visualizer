import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { DESIGN_PATTERNS, PATTERNS, SURFACES, SURFACE_ORDER, type DesignPattern } from "@/lib/designPatterns";
import { withPattern, type DraftArea } from "@/lib/designDraft";
import type { SurfaceType, Tile } from "@/api/types";

interface Props {
  index: number;
  area: DraftArea;
  issues: string[];
  onChange: (next: DraftArea) => void;
  onRemove: () => void;
  onPickTile: (slotIndex: number) => void;
}

const field = "w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900";
const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500";

function Slot({ role, required, tile, onPick, onClear }: { role: string; required: boolean; tile: Tile | null; onPick: () => void; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
      <button
        type="button"
        onClick={onPick}
        aria-label={tile ? `Change tile for ${role}` : `Choose tile for ${role}`}
        className={cn(
          "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border",
          tile ? "border-stone-300" : "border-dashed border-stone-400 bg-white text-2xl text-stone-400 hover:border-clay-500 hover:text-clay-600",
        )}
      >
        {tile ? <img src={getPublicTileImageUrl(tile.storagePath)} alt={tile.name} className="h-full w-full object-cover" /> : "+"}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {role}
          {!required && <span className="ml-1 font-normal normal-case text-stone-400">(optional)</span>}
        </p>
        {tile ? (
          <>
            <p className="truncate text-sm font-medium text-stone-900">{tile.name}</p>
            <p className="truncate text-xs text-stone-500">{[tile.brand, tile.sizeMm && `${tile.sizeMm} mm`, tile.finish].filter(Boolean).join(" · ") || "From your catalog"}</p>
            <button type="button" onClick={onPick} className="mt-1 rounded-md border border-clay-300 px-2 py-0.5 text-xs font-medium text-clay-700 hover:bg-clay-50">
              Change tile
            </button>
          </>
        ) : (
          <button type="button" onClick={onPick} className="text-sm font-medium text-clay-700 hover:underline">
            Choose a tile
          </button>
        )}
      </div>
      {tile && (
        <button type="button" onClick={onClear} className="rounded-full p-2 text-stone-400 hover:bg-stone-200 hover:text-stone-700" aria-label={`Remove tile from ${role}`} title="Remove this tile">
          ✕
        </button>
      )}
    </div>
  );
}

/** One area of the room (e.g. "Back wall"): surface, location name, layout pattern, and the tiles in that pattern. */
export function AreaCard({ index, area, issues, onChange, onRemove, onPickTile }: Props) {
  const spec = PATTERNS[area.pattern];
  const surface = SURFACES[area.surface];
  const idBase = `area-${area.key}`;

  function setSurface(next: SurfaceType) {
    const nextInfo = SURFACES[next];
    // Keep the typed location only if the user changed it; otherwise follow the new surface's default.
    const wasPreset = SURFACES[area.surface].locations.includes(area.location);
    onChange({ ...area, surface: next, location: wasPreset ? nextInfo.defaultLocation : area.location });
  }

  return (
    <section className={cn("rounded-2xl border bg-white p-5 shadow-soft", issues.length > 0 ? "border-amber-300" : "border-stone-200")} aria-label={`Area ${index + 1}: ${area.location}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg text-stone-900">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-sm text-white">{index + 1}</span>
          {area.location || "New area"}
        </h3>
        <button type="button" onClick={onRemove} className="rounded-lg px-2.5 py-1.5 text-sm text-stone-500 hover:bg-red-50 hover:text-red-700">
          {area.wall ? "Keep this wall as is" : "Remove area"}
        </button>
      </div>

      {area.wall ? (
        // A numbered wall of an L / C layout: its name and surface are fixed so it can never overlap another wall.
        <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
          Connected wall <strong className="text-stone-900">{area.wall}</strong> (numbered left to right in your photo). Its tile stops at the corner with any wall you keep.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idBase}-surface`} className={fieldLabel}>Surface</label>
              <select id={`${idBase}-surface`} className={field} value={area.surface} onChange={(e) => setSurface(e.target.value as SurfaceType)}>
                {SURFACE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {SURFACES[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${idBase}-location`} className={fieldLabel}>Which part? (name it)</label>
              <Input id={`${idBase}-location`} maxLength={80} value={area.location} onChange={(e) => onChange({ ...area, location: e.target.value })} placeholder="e.g. Wall behind basin" />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick location names">
            {surface.locations.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => onChange({ ...area, location: loc })}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  area.location === loc ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600 hover:bg-stone-100",
                )}
              >
                {loc}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-5">
        <label htmlFor={`${idBase}-pattern`} className={fieldLabel}>Layout pattern</label>
        <select
          id={`${idBase}-pattern`}
          className={field}
          value={area.pattern}
          onChange={(e) => onChange(withPattern(area, e.target.value as DesignPattern))}
        >
          {DESIGN_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {PATTERNS[p].label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-stone-500">{spec.hint}</p>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {area.slots.map((tile, i) => (
          <Slot
            key={i}
            role={spec.roles[i] ?? `tile ${i + 1}`}
            required={i < spec.min}
            tile={tile}
            onPick={() => onPickTile(i)}
            onClear={() => onChange({ ...area, slots: area.slots.map((t, j) => (j === i ? null : t)) })}
          />
        ))}
      </div>

      {spec.max > 1 && (
        <div className="mt-4">
          <label htmlFor={`${idBase}-note`} className={fieldLabel}>Pattern note (optional)</label>
          <Input
            id={`${idBase}-note`}
            maxLength={160}
            value={area.patternNote}
            onChange={(e) => onChange({ ...area, patternNote: e.target.value })}
            placeholder={area.pattern === "dado" ? "e.g. dado up to 4 ft" : area.pattern === "highlighter_strip" ? "e.g. strip at 5 ft height" : "e.g. strip two tiles wide"}
          />
        </div>
      )}

      {issues.length > 0 && (
        <ul role="alert" className="mt-4 space-y-1 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          {issues.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
