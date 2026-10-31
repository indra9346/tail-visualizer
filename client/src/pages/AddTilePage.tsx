import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClientError, friendlyErrorMessage } from "@/api/client";
import { validateRoomImageFile } from "@/api/rooms";
import { createMyTile } from "@/api/tiles";
import type { TileCategory } from "@/api/types";
import { Icon, type IconName } from "@/components/simple/Icon";
import { ActionBar, IconLink, Screen, bigButton } from "@/components/simple/Flow";
import { cn } from "@/lib/cn";

/** Common tile sizes in mm, as printed on the box. Saved as "600x600", which the size reader understands. */
const SIZES = ["300×300", "300×450", "300×600", "600×600", "600×1200", "800×1600"] as const;
const OTHER = "Other";

const PLACES: { id: TileCategory; label: string; icon: IconName }[] = [
  { id: "floor", label: "Floor", icon: "floor" },
  { id: "wall", label: "Wall", icon: "wall" },
  { id: "both", label: "Both", icon: "room" },
];

const FINISHES = ["Glossy", "Matt", "Satin", "Wood look", "Marble look", "Stone look"] as const;

/** A plain sentence for the owner: the server's own words for a clear problem, never a technical one. */
function plainError(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError && (err.status >= 500 || err.code === "UNKNOWN_ERROR")) return fallback;
  return friendlyErrorMessage(err, fallback);
}

const chip = (on: boolean) =>
  cn(
    "h-12 rounded-full border-2 px-4 text-[15px] font-bold transition-colors",
    on ? "border-stone-900 bg-stone-900 text-white" : "border-[#C9D2C6] bg-white text-ink hover:border-[#8E9A8F]",
  );

const pickButton =
  "flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-[14px] border-2 border-[#C9D2C6] bg-white px-3 text-[15px] font-extrabold text-ink hover:border-[#8E9A8F] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-champagne-500";

const question = "mb-1.5 block text-base font-extrabold leading-5 text-ink";
const field = "h-[52px] w-full rounded-[14px] border-[1.5px] border-[#C9D2C6] bg-white px-3.5 text-[17px] font-semibold text-ink outline-none focus:border-stone-900";

/** Add one tile to the showroom: photo, name, size, where it goes. Finish and price are optional. */
export function AddTilePage() {
  const navigate = useNavigate();
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [size, setSize] = useState<string | null>(null);
  const [otherSize, setOtherSize] = useState("");
  const [place, setPlace] = useState<TileCategory | null>(null);
  const [finish, setFinish] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function pickImage(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = ""; // the same photo can be picked again after a problem
    if (!file) return;
    const problem = validateRoomImageFile(file);
    if (problem) {
      setError(problem.message);
      return;
    }
    setError(null);
    setImage(file);
  }

  const sizeValue = size === OTHER ? otherSize.trim() : size ? size.replace("×", "x") : "";
  const missing = [!image && "photo", !name.trim() && "name", !sizeValue && "size", !place && "where it goes"].filter(Boolean) as string[];
  const ready = missing.length === 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!ready || !image || !place || saving) return;
    const priceText = price.trim();
    const priceNumber = priceText === "" ? null : Number(priceText);
    if (priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 0)) {
      setError("Write the price as a number, like 70.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await createMyTile({
        name: name.trim(),
        category: place,
        sizeMm: sizeValue,
        ...(finish ? { finish } : {}),
        pricePerSqft: priceNumber,
        suitableRooms: [], // any room
        image,
      });
      navigate("/tiles", { state: { added: name.trim() } });
    } catch (err) {
      setError(plainError(err, "Could not save the tile. Check the internet and try again."));
      setSaving(false);
    }
  }

  return (
    <Screen className="pt-3.5 sm:pt-5">
      <header className="flex items-center gap-3 pb-2.5">
        <IconLink to="/tiles" label="Back" />
        <h1 className="min-w-0 flex-1 font-display text-2xl font-semibold leading-[30px] text-ink">Add a tile</h1>
      </header>

      <form onSubmit={save} noValidate className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <div className="relative h-[124px] w-[124px] shrink-0 overflow-hidden rounded-2xl bg-white">
            {preview ? (
              <>
                <img src={preview} alt="Photo of the new tile" className="block h-full w-full object-cover" />
                <span className="pointer-events-none absolute inset-2 rounded-[10px] border-2 border-dashed border-white/90" aria-hidden="true" />
              </>
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#C9D2C6] text-[13px] font-bold text-[#5B665D]">
                <Icon name="image" className="h-8 w-8" strokeWidth={1.8} />
                No photo yet
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-[15px] leading-5 text-[#3F4A42]">Take a straight photo of one tile, close up, in good light.</p>
            <label className={pickButton}>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickImage(e.currentTarget)} />
              <Icon name="camera" className="h-5 w-5" />
              Take photo
            </label>
            <label className={pickButton}>
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickImage(e.currentTarget)} />
              <Icon name="image" className="h-5 w-5" />
              Choose photo
            </label>
          </div>
        </div>

        <div>
          <label className={question} htmlFor="tile-name">
            Tile name
          </label>
          <input id="tile-name" className={field} type="text" value={name} maxLength={200} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <p id="size-q" className={question}>
            Size <span className="font-medium text-[#5B665D]">(mm)</span>
          </p>
          <div role="radiogroup" aria-labelledby="size-q" className="flex flex-wrap gap-2">
            {[...SIZES, OTHER].map((s) => (
              <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => setSize(s)} className={chip(size === s)}>
                {s}
              </button>
            ))}
          </div>
          {size === OTHER && (
            <div className="mt-2">
              <label className="sr-only" htmlFor="other-size">
                Other size
              </label>
              <input
                id="other-size"
                className={field}
                type="text"
                value={otherSize}
                maxLength={40}
                placeholder="Like 250×375"
                autoComplete="off"
                onChange={(e) => setOtherSize(e.target.value)}
              />
            </div>
          )}
        </div>

        <div>
          <p id="place-q" className={question}>
            Where does it go?
          </p>
          <div role="radiogroup" aria-labelledby="place-q" className="flex gap-2">
            {PLACES.map((p) => {
              const on = place === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPlace(p.id)}
                  className={cn(
                    "flex h-[76px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[15px] font-extrabold text-ink transition-colors",
                    on ? "border-[2.5px] border-stone-900 bg-sage-200" : "border-2 border-[#C9D2C6] bg-white hover:border-[#8E9A8F]",
                  )}
                >
                  <Icon name={p.icon} className="h-7 w-7" strokeWidth={1.8} />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p id="finish-q" className={question}>
            Finish <span className="font-medium text-[#5B665D]">(optional)</span>
          </p>
          <div role="group" aria-labelledby="finish-q" className="flex flex-wrap gap-2">
            {FINISHES.map((f) => (
              <button key={f} type="button" aria-pressed={finish === f} onClick={() => setFinish((cur) => (cur === f ? null : f))} className={chip(finish === f)}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="sm:max-w-xs">
          <label className={question} htmlFor="tile-price">
            Price / sq ft <span className="font-medium text-[#5B665D]">(optional)</span>
          </label>
          <div className="flex h-[52px] items-center gap-1.5 rounded-[14px] border-[1.5px] border-[#C9D2C6] bg-white px-3 focus-within:border-stone-900">
            <span className="text-[17px] font-bold text-[#5B665D]" aria-hidden="true">
              ₹
            </span>
            <input
              id="tile-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full min-w-0 bg-transparent text-[17px] font-semibold text-ink outline-none"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-[#FBEDEA] px-3.5 py-3 text-[15px] font-semibold text-[#8C2F21]">
            <Icon name="alert" className="h-5 w-5" />
            {error}
          </p>
        )}

        <ActionBar className="mt-2">
          <button type="submit" disabled={!ready || saving} aria-busy={saving} className={bigButton("primary")}>
            <Icon name="check" strokeWidth={2.6} />
            {saving ? "Saving…" : "Save tile"}
          </button>
          {!ready && <p className="mt-2 text-center text-[15px] text-[#5B665D]">Still needed: {missing.join(", ")}</p>}
        </ActionBar>
      </form>
    </Screen>
  );
}
