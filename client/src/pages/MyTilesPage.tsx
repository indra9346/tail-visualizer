import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageBanner } from "@/components/ui/PageBanner";
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
      <PageBanner
        scene="hex"
        badge="Craftsmanship • Showroom Inventory"
        title="Curate Your Tile Inventory"
        subtitle="List the tiles your showroom offers. These products are mapped to customer room trials for realistic in-situ visualizations."
        actions={
          <>
            <Link to="/tiles">
              <Button size="lg" className="bg-clay-500 hover:bg-clay-400 text-stone-950 font-semibold shadow-md">
                View Public Catalog →
              </Button>
            </Link>
            <Link to="/upload">
              <Button size="lg" variant="outline" className="border-stone-300 bg-white/80 text-stone-900 hover:bg-white">
                Try in a Room
              </Button>
            </Link>
          </>
        }
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[420px_1fr]">
        <Card className="h-fit shadow-md border-stone-200">
          <CardBody>
            <h2 className="font-display text-xl text-stone-900">Add a New Tile</h2>
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
                <label className={label} htmlFor="name">
                  Product name *
                </label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Calacatta Gold Slab" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="brand">
                    Brand / Manufacturer
                  </label>
                  <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Kajaria, Somany" />
                </div>
                <div>
                  <label className={label} htmlFor="sku">
                    SKU / Article #
                  </label>
                  <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. KJR-8012" />
                </div>
              </div>

              <div>
                <span className={label}>Category *</span>
                <div className="flex gap-4">
                  {(["floor", "wall", "both"] as TileCategory[]).map((cat) => (
                    <label key={cat} className="flex items-center gap-2 text-sm text-stone-700 capitalize">
                      <input type="radio" name="category" checked={category === cat} onChange={() => setCategory(cat)} />
                      {cat}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="material">
                    Material
                  </label>
                  <Input id="material" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. Glazed Vitrified" />
                </div>
                <div>
                  <label className={label} htmlFor="finish">
                    Finish
                  </label>
                  <Input id="finish" value={finish} onChange={(e) => setFinish(e.target.value)} placeholder="e.g. High Gloss, Matte" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={label} htmlFor="color">
                    Color family
                  </label>
                  <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. White" />
                </div>
                <div>
                  <label className={label} htmlFor="size">
                    Size
                  </label>
                  <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 600x1200" />
                </div>
                <div>
                  <label className={label} htmlFor="price">
                    Price / sq ft
                  </label>
                  <Input id="price" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 85" />
                </div>
              </div>

              <fieldset>
                <legend className={label}>Suitable spaces</legend>
                <div className="grid grid-cols-2 gap-2">
                  {ROOMS.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 text-sm text-stone-700">
                      <input
                        type="checkbox"
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
                {saving ? "Saving to Catalog…" : "Add Tile to Showroom"}
              </Button>
            </form>
          </CardBody>
        </Card>

        <div>
          <h2 className="font-display text-xl text-stone-900">Your Showroom Catalog{tiles ? ` (${tiles.length})` : ""}</h2>
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
                      <Card className="overflow-hidden shadow-soft hover:shadow-md transition">
                        <div className="aspect-square bg-stone-100">
                          <img src={getPublicTileImageUrl(tile.storagePath)} alt={tile.name} className="h-full w-full object-cover" loading="lazy" />
                        </div>
                        <div className="space-y-1.5 p-3">
                          <p className="font-display leading-tight text-stone-900 font-semibold">{tile.name}</p>
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
