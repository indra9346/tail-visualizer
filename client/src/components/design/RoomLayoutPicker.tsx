import { cn } from "@/lib/cn";
import { LAYOUTS, ROOM_LAYOUTS, type RoomLayout, type WallId } from "@/lib/roomLayouts";

interface Props {
  layout: RoomLayout;
  /** Walls that currently have a design (tiled). Every other wall of the layout is kept as it is. */
  tiledWalls: Set<WallId>;
  onLayoutChange: (next: RoomLayout) => void;
  onToggleWall: (id: WallId) => void;
}

/** Top-down plan of each layout, camera at the bottom looking at the walls. Coordinates are in a 220 x 140 box. */
const PLAN: Record<Exclude<RoomLayout, "open">, Array<{ id: WallId; from: [number, number]; to: [number, number]; badge: [number, number] }>> = {
  l_shape: [
    { id: "L1", from: [46, 108], to: [110, 38], badge: [62, 62] },
    { id: "L2", from: [110, 38], to: [174, 108], badge: [158, 62] },
  ],
  c_shape: [
    { id: "C1", from: [42, 112], to: [42, 36], badge: [22, 74] },
    { id: "C2", from: [42, 36], to: [178, 36], badge: [110, 18] },
    { id: "C3", from: [178, 36], to: [178, 112], badge: [198, 74] },
  ],
};

/** The room plan: finished walls are drawn solid, kept walls dashed and grey. */
export function RoomLayoutDiagram({ layout, tiledWalls, compact = false }: { layout: RoomLayout; tiledWalls: Set<WallId>; compact?: boolean }) {
  if (layout === "open") {
    return (
      <svg viewBox="0 0 220 140" className={compact ? "h-9 w-12" : "h-32 w-48"} role="img" aria-label="Any room: name each area yourself">
        <rect x="46" y="30" width="128" height="78" rx="6" fill="none" stroke="currentColor" strokeWidth={compact ? 10 : 8} strokeLinejoin="round" opacity="0.55" />
      </svg>
    );
  }
  const plan = PLAN[layout];
  return (
    <svg viewBox="0 0 220 140" className={compact ? "h-9 w-12" : "h-36 w-56"} role="img" aria-label={`${LAYOUTS[layout].label}: finished walls solid, kept walls dashed`}>
      {plan.map((w) => {
        const tiled = tiledWalls.has(w.id);
        return (
          <g key={w.id}>
            <line
              x1={w.from[0]}
              y1={w.from[1]}
              x2={w.to[0]}
              y2={w.to[1]}
              strokeLinecap="round"
              strokeWidth={compact ? 12 : 10}
              strokeDasharray={tiled ? undefined : compact ? "2 14" : "1 15"}
              className={tiled ? "stroke-clay-600" : "stroke-stone-400"}
            />
            {!compact && (
              <>
                <circle cx={w.badge[0]} cy={w.badge[1]} r="13" className={tiled ? "fill-stone-900" : "fill-white stroke-stone-300"} strokeWidth="1.5" />
                <text x={w.badge[0]} y={w.badge[1] + 4} textAnchor="middle" className={cn("text-[11px] font-semibold", tiled ? "fill-white" : "fill-stone-500")}>
                  {w.id}
                </text>
              </>
            )}
          </g>
        );
      })}
      {!compact && (
        <g className="fill-stone-400">
          <path d="M100 128 l10 -12 l10 12 z" />
          <text x="110" y="138" textAnchor="middle" className="text-[9px]">
            your photo
          </text>
        </g>
      )}
    </svg>
  );
}

/**
 * Room shape + per-wall choice. For an L or C room every connected wall is its own area: switch a wall on to give it
 * a tile (or a combo pattern), switch it off to keep it exactly as it is in the photo.
 */
export function RoomLayoutPicker({ layout, tiledWalls, onLayoutChange, onToggleWall }: Props) {
  const info = LAYOUTS[layout];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft" aria-label="Room shape and connected walls">
      <h2 className="font-display text-lg text-stone-900">Room shape</h2>
      <p className="mt-1 text-sm text-stone-600">Are the walls in the photo connected (an L or a C)? Then choose which of them get tiles and which stay as they are.</p>

      <div role="radiogroup" aria-label="Room shape" className="mt-4 grid grid-cols-3 gap-2">
        {ROOM_LAYOUTS.map((id) => {
          const active = id === layout;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && onLayoutChange(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors",
                active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700 hover:border-stone-500 hover:bg-stone-50",
              )}
            >
              <RoomLayoutDiagram layout={id} tiledWalls={new Set(LAYOUTS[id].walls.map((w) => w.id))} compact />
              <span className="text-xs font-semibold">{LAYOUTS[id].short}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-stone-500">{info.hint}</p>

      {layout !== "open" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex justify-center text-stone-500">
            <RoomLayoutDiagram layout={layout} tiledWalls={tiledWalls} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Walls, numbered left to right as in your photo</p>
            <ul className="mt-2 space-y-2">
              {info.walls.map((w) => {
                const on = tiledWalls.has(w.id);
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${w.label}: ${on ? "tiled" : "kept as in the photo"}`}
                      onClick={() => onToggleWall(w.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        on ? "border-clay-300 bg-clay-50" : "border-stone-200 bg-stone-50 hover:border-stone-400",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-medium text-stone-900">{w.label}</span>
                        <span className="block text-xs text-stone-500">{on ? "Gets a tile design below" : "Kept exactly as it is in the photo"}</span>
                      </span>
                      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-clay-600" : "bg-stone-300")} aria-hidden="true">
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[1.375rem]" : "left-0.5")} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-stone-500">Where a tiled wall meets a wall you keep, the tile stops exactly at the corner. Each tiled wall has its own tile and pattern.</p>
          </div>
        </div>
      )}
    </section>
  );
}
