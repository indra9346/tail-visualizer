import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TileGrid } from "@/components/tiles/TileGrid";
import { cn } from "@/lib/cn";
import { createMyTile, searchTiles } from "@/api/tiles";
import { friendlyErrorMessage } from "@/api/client";
import { validateRoomImageFile } from "@/api/rooms";
import { SURFACES } from "@/lib/designPatterns";
import { tileFitsSurface } from "@/lib/designDraft";
import type { SurfaceType, Tile, TileCategory } from "@/api/types";

interface Props {
  open: boolean;
  onClose: () => void;
  surface: SurfaceType;
  /** What the slot is for, e.g. "Back wall: lower section (dado)". */
  slotLabel: string;
  recommendedIds: Set<string>;
  reasons: Record<string, string>;
  onPick: (tile: Tile) => void;
}

const label = "mb-1.5 block text-sm font-medium text-stone-700";

/** Choose an existing catalog tile for one slot, or add a brand-new custom tile on the spot. */
export function TilePickerModal({ open, onClose, surface, slotLabel, recommendedIds, reasons, onPick }: Props) {
  const [tab, setTab] = useState<"catalog" | "custom">("catalog");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyRecommended, setOnlyRecommended] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("catalog");
    setLoading(true);
    setError(null);
    searchTiles({ page: 1, pageSize: 50 })
      .then((res) => setTiles(res.tiles))
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load your catalog.")))
      .finally(() => setLoading(false));
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tiles
      .filter((t) => tileFitsSurface(t, surface))
      .filter((t) => !onlyRecommended || recommendedIds.has(t.id))
      .filter((t) => q === "" || [t.name, t.brand, t.material, t.colorFamily, t.finish, t.sku].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => Number(recommendedIds.has(b.id)) - Number(recommendedIds.has(a.id)));
  }, [tiles, surface, query, onlyRecommended, recommendedIds]);

  const hiddenByFit = tiles.filter((t) => !tileFitsSurface(t, surface)).length;

  return (
    <Modal open={open} onClose={onClose} title={`Choose a tile: ${slotLabel}`}>
      <div className="mb-5 flex gap-2" role="tablist" aria-label="Tile source">
        {(
          [
            ["catalog", "From my catalog"],
            ["custom", "+ Add a custom tile"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              tab === id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600 hover:bg-stone-100",
            )}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "catalog" ? (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-xs"
              placeholder="Search name, brand, colour…"
              aria-label="Search tiles"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {recommendedIds.size > 0 && (
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={onlyRecommended} onChange={(e) => setOnlyRecommended(e.target.checked)} />
                Recommended only
              </label>
            )}
          </div>
          <p className="mt-3 text-xs text-stone-500">
            Showing {SURFACES[surface].kind === "floor" ? "floor" : "wall"} tiles{hiddenByFit > 0 ? ` (${hiddenByFit} tile${hiddenByFit === 1 ? "" : "s"} for the other surface hidden)` : ""}. Recommended tiles for this
            room come first.
          </p>
          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          ) : (
            <div className="mt-4">
              <TileGrid
                tiles={shown}
                reasons={reasons}
                onSelect={onPick}
                loading={loading}
                emptyTitle="No matching tiles"
                emptyDescription="Nothing in your catalog fits this surface and search yet. Add a custom tile with the tab above."
                showAddTileCta={false}
              />
            </div>
          )}
        </div>
      ) : (
        <CustomTileForm
          surface={surface}
          onCreated={(tile) => {
            setTiles((prev) => [tile, ...prev]);
            onPick(tile);
          }}
        />
      )}
    </Modal>
  );
}

function CustomTileForm({ surface, onCreated }: { surface: SurfaceType; onCreated: (tile: Tile) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TileCategory>(SURFACES[surface].kind);
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");
  const [finish, setFinish] = useState("");
  const [color, setColor] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!image) return setPreview(null);
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function pickImage(file: File | undefined) {
    if (!file) return;
    const problem = validateRoomImageFile(file);
    if (problem) return setError(problem.message);
    setError(null);
    setImage(file);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!image) return setError("Please add a clear photo of the tile.");
    setSaving(true);
    setError(null);
    try {
      const tile = await createMyTile({ name, category, brand, sizeMm: size, material, finish, colorFamily: color, suitableRooms: [], image });
      onCreated(tile);
    } catch (err) {
      setError(friendlyErrorMessage(err, "We couldn't save this tile. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 md:grid-cols-[240px_1fr]">
      <div>
        <span className={label}>Tile photo *</span>
        <label className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 text-center text-sm text-stone-500 hover:border-clay-400">
          {preview ? (
            <img src={preview} alt="Preview of the custom tile" className="h-full w-full object-cover" />
          ) : (
            <span className="px-4">Click to choose a clear, straight-on photo of the tile</span>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} />
        </label>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Need a tile that isn't in your catalog yet? Add it now. It is saved to your catalog and used for this slot straight away.
        </p>
        <div>
          <label htmlFor="ct-name" className={label}>Name *</label>
          <Input id="ct-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Customer-picked Blue Floral" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ct-cat" className={label}>Use on *</label>
            <select id="ct-cat" className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value as TileCategory)}>
              <option value="floor">Floor</option>
              <option value="wall">Wall</option>
              <option value="both">Floor and wall</option>
            </select>
          </div>
          <div>
            <label htmlFor="ct-size" className={label}>Size (mm)</label>
            <Input id="ct-size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="300x600" />
          </div>
          <div>
            <label htmlFor="ct-brand" className={label}>Brand</label>
            <Input id="ct-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ct-mat" className={label}>Material</label>
            <Input id="ct-mat" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="ceramic" />
          </div>
          <div>
            <label htmlFor="ct-fin" className={label}>Finish</label>
            <Input id="ct-fin" value={finish} onChange={(e) => setFinish(e.target.value)} placeholder="glossy / matte" />
          </div>
          <div>
            <label htmlFor="ct-col" className={label}>Colour</label>
            <Input id="ct-col" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={saving}>
          {saving ? "Saving…" : "Save tile and use it here"}
        </Button>
      </div>
    </form>
  );
}
