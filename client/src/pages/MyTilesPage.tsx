import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { createMyTile, listMyTiles, setMyTileActive } from "@/api/tiles";
import { friendlyErrorMessage } from "@/api/client";
import { validateRoomImageFile } from "@/api/rooms";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import type { RoomType, Tile, TileCategory } from "@/api/types";

const ROOMS: { value: RoomType; label: string }[] = [
  { value: "kitchen", label: "Kitchen" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "living_room", label: "Living room" },
  { value: "dining_room", label: "Dining room" },
  { value: "balcony", label: "Balcony" },
  { value: "corridor", label: "Corridor" },
  { value: "other", label: "Other" },
];

const label = "mb-1.5 block text-sm font-medium text-stone-700";

export function MyTilesPage() {
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState<TileCategory>("floor");
  const [material, setMaterial] = useState("");
  const [finish, setFinish] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function load() {
    setLoadError(null);
    listMyTiles()
      .then(setTiles)
      .catch((err) => setLoadError(friendlyErrorMessage(err, "We couldn't load your tiles.")));
  }
  useEffect(load, []);

  useEffect(() => {
    if (!image) return setPreview(null);
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function pickImage(file: File | undefined) {
    if (!file) return;
    const err = validateRoomImageFile(file);
    if (err) {
      setFormError(err.message);
      return;
    }
    setFormError(null);
    setImage(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!image) return setFormError("Please add a photo of the tile.");
    setFormError(null);
    setSaving(true);
    try {
      const tile = await createMyTile({
        name,
        brand,
        sku,
        category,
        material,
        finish,
        colorFamily: color,
        sizeMm: size,
        pricePerSqft: price.trim() === "" ? null : Number(price),
        suitableRooms: rooms,
        image,
      });
      setTiles((prev) => [tile, ...(prev ?? [])]);
      setJustAdded(tile.name);
      setName("");
      setBrand("");
      setSku("");
      setMaterial("");
      setFinish("");
      setColor("");
      setSize("");
      setPrice("");
      setRooms([]);
      setImage(null);
    } catch (err) {
      setFormError(friendlyErrorMessage(err, "We couldn't save this tile. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(tile: Tile) {
    try {
      const updated = await setMyTileActive(tile.id, !tile.isActive);
      setTiles((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev);
    } catch (err) {
      setLoadError(friendlyErrorMessage(err, "We couldn't update that tile."));
    }
  }

  return (
    <PageContainer>
      <h1 className="font-display text-3xl text-stone-900">My Tiles</h1>
      <p className="mt-2 max-w-2xl text-stone-600">
        List the tiles your showroom sells. Only these tiles are used for recommendations and room previews, and no other showroom can see them.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[420px_1fr]">
        <Card className="h-fit">
          <CardBody>
            <h2 className="font-display text-xl text-stone-900">Add a tile</h2>
            <form className="mt-5 space-y-4" onSubmit={onSubmit}>
              <div>
                <span className={label}>Tile photo *</span>
                <label className="flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 text-center text-sm text-stone-500 hover:border-clay-400">
                  {preview ? (
                    <img src={preview} alt="Preview of the tile you selected" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-4">Click to choose a clear, straight-on photo of the tile surface (JPEG, PNG or WebP)</span>
                  )}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0])} />
                </label>
              </div>

              <div>
                <label htmlFor="t-name" className={label}>Name *</label>
                <Input id="t-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grey Porcelain Floor Tile" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="t-brand" className={label}>Brand</label>
                  <Input id="t-brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="t-sku" className={label}>SKU / code</label>
                  <Input id="t-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="auto if empty" />
                </div>
              </div>
              <div>
                <label htmlFor="t-cat" className={label}>Use on *</label>
                <select id="t-cat" className="w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value as TileCategory)}>
                  <option value="floor">Floor</option>
                  <option value="wall">Wall</option>
                  <option value="both">Floor and wall</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="t-mat" className={label}>Material</label>
                  <Input id="t-mat" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="porcelain" />
                </div>
                <div>
                  <label htmlFor="t-fin" className={label}>Finish</label>
                  <Input id="t-fin" value={finish} onChange={(e) => setFinish(e.target.value)} placeholder="matte / glossy" />
                </div>
                <div>
                  <label htmlFor="t-col" className={label}>Colour</label>
                  <Input id="t-col" value={color} onChange={(e) => setColor(e.target.value)} placeholder="grey" />
                </div>
                <div>
                  <label htmlFor="t-size" className={label}>Size (mm)</label>
                  <Input id="t-size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="600x600" />
                </div>
              </div>
              <div>
                <label htmlFor="t-price" className={label}>Price per sq ft (INR)</label>
                <Input id="t-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <fieldset>
                <legend className={label}>Suitable rooms (optional)</legend>
                <div className="flex flex-wrap gap-2">
                  {ROOMS.map((r) => (
                    <label key={r.value} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${rooms.includes(r.value) ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600"}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={rooms.includes(r.value)}
                        onChange={() => setRooms((prev) => (prev.includes(r.value) ? prev.filter((x) => x !== r.value) : [...prev, r.value]))}
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-stone-400">Leave empty if the tile suits any room.</p>
              </fieldset>

              {formError && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {formError}
                </motion.p>
              )}
              <AnimatePresence>
                {justAdded && !formError && (
                  <motion.p
                    initial={{ opacity: 0, y: -6, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    role="status"
                    className="overflow-hidden rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
                  >
                    "{justAdded}" was added to your catalog.
                  </motion.p>
                )}
              </AnimatePresence>

              <Button type="submit" size="lg" className="w-full" loading={saving}>
                {saving ? "Saving…" : "Add tile"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <div>
          <h2 className="font-display text-xl text-stone-900">Your catalog{tiles ? ` (${tiles.length})` : ""}</h2>
          <div className="mt-4">
            {loadError ? (
              <ErrorState message={loadError} onRetry={load} />
            ) : tiles === null ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-full" />
                ))}
              </div>
            ) : tiles.length === 0 ? (
              <EmptyState title="No tiles yet" description="Add your first tile with a photo using the form. It appears here straight away." />
            ) : (
              <motion.div
                className="grid grid-cols-2 gap-4 sm:grid-cols-3"
                initial="hidden"
                animate="show"
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
              >
                <AnimatePresence>
                  {tiles.map((tile) => (
                    <motion.div
                      key={tile.id}
                      layout
                      variants={{ hidden: { opacity: 0, y: 12, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" } } }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={tile.isActive ? "" : "opacity-60 transition-opacity duration-300"}
                    >
                      <Card className="overflow-hidden">
                        <div className="aspect-square bg-stone-100">
                          <img src={getPublicTileImageUrl(tile.storagePath)} alt={tile.name} className="h-full w-full object-cover" loading="lazy" />
                        </div>
                        <div className="space-y-1.5 p-3">
                          <p className="font-display leading-tight text-stone-900">{tile.name}</p>
                          <p className="text-xs text-stone-500">{[tile.brand, tile.material, tile.sizeMm && `${tile.sizeMm} mm`].filter(Boolean).join(" · ")}</p>
                          <div className="flex items-center justify-between pt-1">
                            <Badge tone={tile.isActive ? "success" : "neutral"}>{tile.isActive ? "Active" : "Hidden"}</Badge>
                            <button type="button" onClick={() => toggle(tile)} className="text-xs font-medium text-clay-700 hover:underline">
                              {tile.isActive ? "Hide" : "Show"}
                            </button>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
