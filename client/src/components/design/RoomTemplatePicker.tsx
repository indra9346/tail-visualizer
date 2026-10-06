import { cn } from "@/lib/cn";
import { chosenTiles, type DraftArea } from "@/lib/designDraft";
import { TEMPLATES, TEMPLATE_IDS, areaOfFace, type FaceSpec, type RoomTemplate, type TemplateId } from "@/lib/roomTemplates";
import { RoomScene3D, type SceneFace } from "./RoomScene3D";

interface Props {
  templateId: TemplateId;
  areas: DraftArea[];
  onTemplateChange: (next: TemplateId) => void;
  /** Switch a face on (tile it) or off (keep it as in the photo). */
  onToggleFace: (faceKey: string) => void;
  /** Clicking a face in the 3D box: switch it on if needed, then choose its tile. */
  onPickFace: (faceKey: string) => void;
  /** The area being edited; its face is outlined in the 3D box. */
  activeAreaKey?: string | null;
}

/** Short tag drawn on the 3D picture. */
const tagOf = (face: FaceSpec) => (face.wall ? face.wall : face.label);

function sceneFaces(template: RoomTemplate, areas: DraftArea[], onPick: (key: string) => void, activeAreaKey?: string | null): SceneFace[] {
  return template.faces.map((face) => {
    const area = areaOfFace(areas, face);
    const tiles = area ? chosenTiles(area) : [];
    return {
      role: face.role,
      tag: tagOf(face),
      label: face.label,
      state: !area ? "keep" : tiles.length === 0 ? "empty" : "tiled",
      tile: tiles[0] ?? null,
      selected: Boolean(area && area.key === activeAreaKey),
      onClick: () => onPick(face.key),
    };
  });
}

/**
 * "What are you designing?": ready-made room templates (washroom, kitchen, any room) drawn as a 3D CAD box. Each surface of
 * the box is switched on (it gets a tile design below) or off (it stays exactly as it is in the customer's photo).
 */
export function RoomTemplatePicker({ templateId, areas, onTemplateChange, onToggleFace, onPickFace, activeAreaKey }: Props) {
  const template = TEMPLATES[templateId];
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft" aria-label="Room template and surfaces">
      <h2 className="font-display text-lg text-stone-900">What are you designing?</h2>
      <p className="mt-1 text-sm text-stone-600">Pick a room template. Then switch on only the surfaces you want tiled: every surface you leave off stays exactly as it is in the photo.</p>

      <div role="radiogroup" aria-label="Room template" className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {TEMPLATE_IDS.map((id) => {
          const t = TEMPLATES[id];
          const active = id === templateId;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && onTemplateChange(id)}
              className={cn(
                "flex flex-col rounded-xl border p-2.5 text-left transition-colors",
                active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-700 hover:border-stone-500 hover:bg-stone-50",
              )}
            >
              {t.scene === "none" ? (
                <span className={cn("flex h-[88px] items-center justify-center rounded-lg text-xs", active ? "bg-white/10 text-white/80" : "bg-stone-100 text-stone-500")}>Any room, name areas yourself</span>
              ) : (
                <span className="block h-[88px] overflow-hidden rounded-lg bg-stone-100">
                  <RoomScene3D scene={t.scene} preview faces={[]} className="!max-w-[132px]" />
                </span>
              )}
              <span className="mt-2 text-sm font-semibold leading-tight">{t.label}</span>
              <span className={cn("text-[11px] leading-snug", active ? "text-white/70" : "text-stone-500")}>{t.blurb}</span>
            </button>
          );
        })}
      </div>

      {template.scene === "none" ? (
        <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2.5 text-xs text-stone-600">
          Free naming: add an area for each wall or surface you want tiled and name it. A wall you do not add stays as it is in the photo.
        </p>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,360px)_1fr] md:items-center">
          <div>
            <RoomScene3D scene={template.scene} faces={sceneFaces(template, areas, onPickFace, activeAreaKey)} />
            <p className="mt-2 text-center text-[11px] text-stone-500">Drag to rotate through 360°. Click a surface to edit it.</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Surfaces (walls numbered left to right as in your photo)</p>
            <ul className="mt-2 space-y-2">
              {template.faces.map((face) => {
                const area = areaOfFace(areas, face);
                const on = Boolean(area);
                const tile = area ? chosenTiles(area)[0] : undefined;
                return (
                  <li key={face.key}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${face.label}: ${on ? "tiled" : "kept as in the photo"}`}
                      onClick={() => onToggleFace(face.key)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
                        on ? "border-clay-300 bg-clay-50" : "border-stone-200 bg-stone-50 hover:border-stone-400",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-stone-900">{face.label}</span>
                        <span className="block truncate text-xs text-stone-500">{on ? (tile ? `Tile: ${tile.name}` : "Gets a tile design below") : "Kept exactly as it is in the photo"}</span>
                      </span>
                      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-clay-600" : "bg-stone-300")} aria-hidden="true">
                        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[1.375rem]" : "left-0.5")} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-stone-500">Where a tiled wall meets a surface you keep, the tile stops exactly at the corner. Each surface has its own tile and pattern.</p>
          </div>
        </div>
      )}
    </section>
  );
}
