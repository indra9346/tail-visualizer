import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ActionBar, GroupLabel, IconLink, Screen, bigButton } from "@/components/simple/Flow";
import { Icon } from "@/components/simple/Icon";
import { getVisualization } from "@/api/visualizations";
import { cn } from "@/lib/cn";
import { SQFT_PER_M2, TILE_PRESETS, calculate } from "@/lib/tileCalc";
import { parseTileSizeMm } from "@/lib/fitRecommend";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { imageFile, saveFile, shareToWhatsApp } from "@/lib/share";
import type { Tile } from "@/api/types";

const SIZES = TILE_PRESETS.slice(0, 6).map((p) => ({ w: p.w, h: p.h, perBox: p.perBox, label: `${p.w}×${p.h}` }));
const WASTES = [5, 10, 15];
const num = (v: string) => {
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Pieces in one box for a size, from the usual Indian box counts (the owner can change it). */
function boxCount(w: number, h: number): number {
  return TILE_PRESETS.find((p) => (p.w === w && p.h === h) || (p.w === h && p.h === w))?.perBox ?? 4;
}

/**
 * How many boxes, and what they cost: the tile comes from the photo just made (size and price already known); the
 * owner only types each wall or floor in feet. Sent on WhatsApp with the photo.
 */
export function QuotePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const vizId = params.get("viz");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [tileIndex, setTileIndex] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: 600 });
  const [perBox, setPerBox] = useState("4");
  const [price, setPrice] = useState("");
  const [areas, setAreas] = useState<Array<{ l: string; h: string }>>([{ l: "", h: "" }]);
  const [waste, setWaste] = useState(10);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const photoFile = useRef<File | null>(null);

  useEffect(() => {
    if (!vizId) return;
    getVisualization(vizId)
      .then((viz) => {
        const ids = viz.design?.areas.flatMap((a) => a.tileIds) ?? [];
        const list = ids.map((id) => viz.designTiles?.find((t) => t.id === id)).filter((t): t is Tile => Boolean(t));
        const unique = list.filter((t, i) => list.findIndex((o) => o.id === t.id) === i);
        setTiles(unique.length > 0 ? unique : viz.tile ? [viz.tile] : []);
        if (viz.status === "completed" && viz.resultImageUrl) setPhotoUrl(viz.resultImageUrl);
      })
      .catch(() => undefined);
  }, [vizId]);

  const tile = tiles[tileIndex] ?? null;
  // A tile brings its own size and price.
  useEffect(() => {
    if (!tile) return;
    const parsed = parseTileSizeMm(tile.sizeMm);
    if (parsed) {
      setSize({ w: parsed.w, h: parsed.h });
      setPerBox(String(boxCount(parsed.w, parsed.h)));
    }
    setPrice(tile.pricePerSqft != null ? String(tile.pricePerSqft) : "");
  }, [tile]);

  useEffect(() => {
    if (!photoUrl) return;
    imageFile(photoUrl, "sds-tiles-design")
      .then((f) => (photoFile.current = f))
      .catch(() => undefined);
  }, [photoUrl]);

  const pieces = Math.round(num(perBox));
  const boxSqft = ((size.w * size.h) / 1_000_000) * SQFT_PER_M2 * pieces;
  const pricePerSqft = num(price);
  const filled = areas.filter((a) => num(a.l) > 0 && num(a.h) > 0);
  const outcome =
    filled.length === 0 || pieces < 1
        ? null
        : calculate({
            unit: "ft",
            areas: filled.map((a, i) => ({ id: `a${i}`, label: `Part ${i + 1}`, length: num(a.l), width: num(a.h), openings: 0 })),
            tileWidthMm: size.w,
            tileHeightMm: size.h,
            tileThicknessMm: 9,
            jointMm: 2,
            wastePct: waste,
            piecesPerBox: pieces,
            pricePerBox: pricePerSqft > 0 ? pricePerSqft * boxSqft : null,
            adhesiveKgPerM2: 5,
            adhesiveBagKg: 20,
            groutBagKg: 5,
          });
  const result = outcome?.ok ? outcome.result : null;

  const tileLabel = tile ? `${tile.name} ${size.w}×${size.h}` : `${size.w}×${size.h} tiles`;
  const message = result
    ? `SDS Tiles & Ceramics: ${tileLabel}. ${result.boxes} boxes (${result.tilesPurchased} tiles) for ${Math.round(result.netAreaSqFt)} sq ft${result.totalCost != null ? ` · tile cost ${rupees(result.totalCost)}` : ""}.`
    : "";

  async function send() {
    if (!result) return;
    setSending(true);
    setNotice(null);
    try {
      const files = photoFile.current ? [photoFile.current] : [];
      const outcome = await shareToWhatsApp(files, message);
      if (outcome === "message-only" && files.length > 0) {
        saveFile(files[0]!);
        setNotice("The photo is saved on this phone. In WhatsApp, pick the customer and attach it.");
      }
    } finally {
      setSending(false);
    }
  }

  const setArea = (i: number, key: "l" | "h", value: string) => setAreas((prev) => prev.map((a, j) => (j === i ? { ...a, [key]: value } : a)));

  return (
    <Screen>
      <header className="flex items-center gap-3 pb-3">
        <IconLink onClick={() => navigate(-1)} label="Back" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-semibold leading-7 text-ink">How many boxes?</h1>
          <p className="text-sm text-ink-secondary">Type the size of each wall or floor in feet</p>
        </div>
      </header>

      <div className="space-y-4">
        {tiles.length > 1 && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which tile">
            {tiles.map((t, i) => (
              <button key={t.id} type="button" role="radio" aria-checked={i === tileIndex} onClick={() => setTileIndex(i)} className={cn("h-11 rounded-full px-4 text-[15px] font-bold", i === tileIndex ? "bg-stone-900 text-white" : "border-[1.5px] border-[#C9D2C6] bg-white")}>
                {t.name}
              </button>
            ))}
          </div>
        )}
        {tile && (
          <div className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-hairline bg-white p-2">
            <img src={getPublicTileImageUrl(tile.storagePath)} alt="" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
            <span className="min-w-0 flex-1 text-[15px] leading-5">
              <b className="block truncate">{tile.name}</b>
              <span className="text-ink-secondary">{[tile.sizeMm, tile.pricePerSqft != null ? `₹${tile.pricePerSqft}/sq ft` : null].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
        )}

        {!tile && (
          <section aria-labelledby="size-title">
            <GroupLabel id="size-title">Tile size (mm)</GroupLabel>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Tile size">
              {SIZES.map((s) => {
                const on = s.w === size.w && s.h === size.h;
                return (
                  <button
                    key={s.label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setSize({ w: s.w, h: s.h });
                      setPerBox(String(s.perBox));
                    }}
                    className={cn("h-11 rounded-full px-4 text-[15px] font-bold", on ? "bg-stone-900 text-white" : "border-[1.5px] border-[#C9D2C6] bg-white")}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section aria-labelledby="areas-title">
          <GroupLabel id="areas-title">Size in feet</GroupLabel>
          <div className="mt-2 space-y-2">
            {areas.map((a, i) => (
              <div key={i} className="flex items-center gap-2 rounded-2xl border-[1.5px] border-hairline bg-white px-2.5 py-1.5">
                <span className="w-14 shrink-0 text-[15px] font-extrabold">Part {i + 1}</span>
                <input type="number" inputMode="decimal" min="0" value={a.l} onChange={(e) => setArea(i, "l", e.target.value)} aria-label={`Part ${i + 1} length in feet`} placeholder="Length" className="h-12 w-[4.75rem] rounded-xl border-[1.5px] border-[#C9D2C6] text-center text-lg font-bold" />
                <span className="text-lg text-ink-secondary" aria-hidden="true">
                  ×
                </span>
                <input type="number" inputMode="decimal" min="0" value={a.h} onChange={(e) => setArea(i, "h", e.target.value)} aria-label={`Part ${i + 1} width or height in feet`} placeholder="Width" className="h-12 w-[4.75rem] rounded-xl border-[1.5px] border-[#C9D2C6] text-center text-lg font-bold" />
                <span className="flex-1 text-right text-[15px] font-bold text-[#3F4A42]">{num(a.l) * num(a.h) > 0 ? `${Math.round(num(a.l) * num(a.h) * 10) / 10} sq ft` : ""}</span>
                {areas.length > 1 && (
                  <button type="button" onClick={() => setAreas((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove part ${i + 1}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:bg-red-50 hover:text-[#A23B2A]">
                    <Icon name="close" className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {areas.length < 8 && (
            <button type="button" onClick={() => setAreas((prev) => [...prev, { l: "", h: "" }])} className="mt-2 h-11 w-full rounded-xl border-[1.5px] border-dashed border-[#8E9A8F] text-[15px] font-extrabold">
              + Add another wall or floor
            </button>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="per-box" className="mb-1.5 block text-[15px] font-extrabold">
              Tiles in one box
            </label>
            <input id="per-box" type="number" inputMode="numeric" min="1" value={perBox} onChange={(e) => setPerBox(e.target.value)} className="h-12 w-full rounded-xl border-[1.5px] border-[#C9D2C6] bg-white px-3 text-lg font-bold" />
          </div>
          <div>
            <label htmlFor="price" className="mb-1.5 block text-[15px] font-extrabold">
              Price / sq ft <span className="font-medium text-ink-secondary">(optional)</span>
            </label>
            <div className="flex h-12 items-center gap-1.5 rounded-xl border-[1.5px] border-[#C9D2C6] bg-white px-3">
              <span className="text-lg font-bold text-ink-secondary">₹</span>
              <input id="price" type="number" inputMode="decimal" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full min-w-0 border-0 bg-transparent text-lg font-bold outline-none" />
            </div>
          </div>
        </div>

        <section aria-labelledby="extra-title" className="flex items-center gap-2">
          <h2 id="extra-title" className="flex-1 font-sans text-[15px] font-extrabold">
            Extra for cutting
          </h2>
          {WASTES.map((w) => (
            <button key={w} type="button" aria-pressed={w === waste} onClick={() => setWaste(w)} className={cn("h-11 rounded-xl px-3.5 text-[15px] font-extrabold", w === waste ? "bg-stone-900 text-white" : "border-2 border-[#C9D2C6] bg-white")}>
              {w}%
            </button>
          ))}
        </section>

        {result ? (
          <div className="flex items-center gap-4 rounded-[20px] bg-stone-900 px-5 py-4 text-white" role="status" aria-live="polite">
            <div className="flex-1">
              <p className="text-[13px] font-extrabold tracking-[0.08em] text-champagne-400">YOU NEED</p>
              <p className="font-display text-[40px] font-semibold leading-[46px] text-white">
                {result.boxes} box{result.boxes === 1 ? "" : "es"}
              </p>
              <p className="text-sm text-sage-300">
                {result.tilesPurchased} tiles · {Math.round(result.netAreaSqFt)} sq ft + {waste}%
              </p>
            </div>
            {result.totalCost != null && (
              <div className="text-right">
                <p className="text-[13px] text-sage-300">Tile cost</p>
                <p className="text-2xl font-extrabold">{rupees(result.totalCost)}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-sage-200 px-4 py-3 text-[15px]">{outcome && !outcome.ok ? outcome.errors[0] : "Type the size of at least one wall or floor to see the boxes."}</p>
        )}
        {notice && (
          <p className="rounded-2xl bg-sage-200 px-3 py-2.5 text-[15px]" role="status">
            {notice}
          </p>
        )}
      </div>

      <ActionBar>
        <button type="button" onClick={send} disabled={!result || sending} className={bigButton("whatsapp", "disabled:opacity-50")}>
          <Icon name="whatsapp" />
          {sending ? "Opening WhatsApp…" : photoUrl ? "Send photo + price on WhatsApp" : "Send on WhatsApp"}
        </button>
      </ActionBar>
    </Screen>
  );
}
