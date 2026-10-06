import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { PATTERNS, SURFACES, SURFACE_ORDER } from "@/lib/designPatterns";
import { chosenTiles, withPattern, type DraftArea } from "@/lib/designDraft";
import { recommendPatterns, sizeToDimensions } from "@/lib/fitRecommend";
import type { RoomType, SurfaceType, Tile } from "@/api/types";
import { AreaSizeAssist } from "./AreaSizeAssist";
import { PatternPicker } from "./PatternPicker";
import { TileThumb } from "./TileThumb";

interface Props {
  index: number;
  area: DraftArea;
  issues: string[];
  onChange: (next: DraftArea) => void;
  onRemove: () => void;
  onPickTile: (slotIndex: number) => void;
  /** Set for a surface that belongs to a room template: its surface and name are fixed, and this explains what it covers. */
  lockedNote?: string;
  /** Only the active surface is open; the others show a one-line summary. */
  open: boolean;
  onToggleOpen: () => void;
  roomType?: RoomType;
  /** The showroom's tiles, for the optional best-fit suggestions. */
  catalog: Tile[];
  recommendedIds: Set<string>;
}

const field = "w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900";
const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-clay-100 text-[11px] text-clay-800">{n}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

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
        {tile ? <TileThumb tile={tile} /> : "+"}
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

/**
 * One surface of the room (e.g. "C1 left wall"). Three clear steps: (1) optional size and suggestions, (2) pick a layout by
 * looking at it, (3) choose the tiles. Only the active surface is open, so a long design stays easy to scan.
 */
export function AreaCard({ index, area, issues, onChange, onRemove, onPickTile, lockedNote, open, onToggleOpen, roomType, catalog, recommendedIds }: Props) {
  const spec = PATTERNS[area.pattern];
  const surface = SURFACES[area.surface];
  const idBase = `area-${area.key}`;
  const tiles = chosenTiles(area);
  const suggestions = recommendPatterns(area.surface, sizeToDimensions(area.size), roomType);
  const locked = Boolean(area.wall || lockedNote);

  function setSurface(next: SurfaceType) {
    const nextInfo = SURFACES[next];
    // Keep the typed location only if the user changed it; otherwise follow the new surface's default.
    const wasPreset = SURFACES[area.surface].locations.includes(area.location);
    onChange({ ...area, surface: next, location: wasPreset ? nextInfo.defaultLocation : area.location });
  }

  const ready = tiles.length >= spec.min;

  return (
    <section
      id={idBase}
      className={cn("scroll-mt-24 rounded-2xl border bg-white shadow-soft", open ? "p-5" : "p-3", issues.length > 0 ? "border-amber-300" : open ? "border-stone-300" : "border-stone-200")}
      aria-label={`Area ${index + 1}: ${area.location}`}
    >
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onToggleOpen} aria-expanded={open} aria-controls={`${idBase}-body`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm text-white">{index + 1}</span>
          <span className="min-w-0">
            <span className="block truncate font-display text-lg leading-tight text-stone-900">{area.location || "New area"}</span>
            {!open && (
              <span className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                <span className="truncate">{spec.label}</span>
                <span className="flex -space-x-1.5">
                  {tiles.slice(0, 4).map((t, i) => (
                    <span key={`${t.id}-${i}`} className="inline-block h-5 w-5 overflow-hidden rounded-full border-2 border-white">
                      <TileThumb tile={t} />
                    </span>
                  ))}
                </span>
                <span className={cn("font-medium", ready ? "text-emerald-700" : "text-amber-700")}>{ready ? "Ready" : "Needs a tile"}</span>
              </span>
            )}
          </span>
          <span className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-clay-700">{open ? "Collapse ▴" : "Edit ▾"}</span>
        </button>
        {open && (
          <button type="button" onClick={onRemove} className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm text-stone-500 hover:bg-red-50 hover:text-red-700">
            {locked ? "Keep this surface as is" : "Remove area"}
          </button>
        )}
      </div>

      {open && (
        <div id={`${idBase}-body`}>
          {locked ? (
            // A surface of a room template (or a numbered wall of an L / C layout): its name and surface are fixed so it can never overlap another.
            <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
              {area.wall ? (
                <>
                  Connected wall <strong className="text-stone-900">{area.wall}</strong> (numbered left to right in your photo). Its tile stops at the corner with any surface you keep.
                </>
              ) : (
                lockedNote
              )}
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

          <AreaSizeAssist area={area} roomType={roomType} catalog={catalog} recommendedIds={recommendedIds} suggestions={suggestions} onChange={onChange} />

          <Step n={1} title="Choose a layout (look at the demo)">
            <PatternPicker pattern={area.pattern} tiles={tiles} suggestions={suggestions} onChange={(p) => onChange(withPattern(area, p))} />
          </Step>

          <Step n={2} title="Choose the tiles">
            <div className="grid gap-2.5 sm:grid-cols-2">
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
          </Step>

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
