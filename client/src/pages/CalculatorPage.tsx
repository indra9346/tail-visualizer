import { useEffect, useMemo, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/cn";
import { groupByDate } from "@/lib/history";
import {
  DEFAULT_INPUT,
  LAYOUT_WASTE,
  TILE_PRESETS,
  calculate,
  type CalcArea,
  type CalcInput,
  type Layout,
} from "@/lib/tileCalc";
import { clearHistory, defaultName, loadHistory, removeEntry, saveEntry, summarize, type CalcEntry } from "@/lib/calcHistory";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const field = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500";
const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500";

// Text boxes hold what the person is typing; empty means "not entered yet", never a silent zero.
const toNum = (text: string) => (text.trim() === "" ? NaN : Number(text));
const fmt = (n: number, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits });
const bags = (n: number) => `${n} ${n === 1 ? "bag" : "bags"}`;
const money = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 });

interface AreaText {
  id: string;
  label: string;
  length: string;
  width: string;
  openings: string;
}

const emptyArea = (name: string): AreaText => ({ id: newId(), label: name, length: "", width: "", openings: "" });
const textToArea = (a: AreaText): CalcArea => ({ id: a.id, label: a.label, length: toNum(a.length), width: toNum(a.width), openings: a.openings.trim() === "" ? 0 : Number(a.openings) });
const areaToText = (a: CalcArea): AreaText => ({ id: a.id, label: a.label, length: Number.isFinite(a.length) && a.length > 0 ? String(a.length) : "", width: Number.isFinite(a.width) && a.width > 0 ? String(a.width) : "", openings: a.openings > 0 ? String(a.openings) : "" });

export function CalculatorPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [unit, setUnit] = useState<CalcInput["unit"]>(DEFAULT_INPUT.unit);
  const [areas, setAreas] = useState<AreaText[]>([emptyArea("Floor")]);
  const [tileW, setTileW] = useState("600");
  const [tileH, setTileH] = useState("600");
  const [thickness, setThickness] = useState("9");
  const [joint, setJoint] = useState("3");
  const [layout, setLayout] = useState<Layout>("straight");
  const [waste, setWaste] = useState(String(LAYOUT_WASTE.straight.pct));
  const [perBox, setPerBox] = useState("4");
  const [price, setPrice] = useState("");
  const [adhesiveRate, setAdhesiveRate] = useState("5");

  const [history, setHistory] = useState<CalcEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showHistoryOnPhone, setShowHistoryOnPhone] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<CalcEntry | null>(null);

  useEffect(() => {
    setHistory(loadHistory(userId));
    setActiveId(null);
  }, [userId]);

  const input: CalcInput = useMemo(
    () => ({
      unit,
      areas: areas.map(textToArea),
      tileWidthMm: toNum(tileW),
      tileHeightMm: toNum(tileH),
      tileThicknessMm: toNum(thickness),
      jointMm: toNum(joint),
      wastePct: toNum(waste),
      piecesPerBox: toNum(perBox),
      pricePerBox: price.trim() === "" ? null : Number(price),
      adhesiveKgPerM2: toNum(adhesiveRate),
      adhesiveBagKg: DEFAULT_INPUT.adhesiveBagKg,
      groutBagKg: DEFAULT_INPUT.groutBagKg,
    }),
    [unit, areas, tileW, tileH, thickness, joint, waste, perBox, price, adhesiveRate],
  );

  // Real-time: the answer is recalculated on every keystroke.
  const outcome = useMemo(() => calculate(input), [input]);

  function loadInput(i: CalcInput) {
    setUnit(i.unit);
    setAreas(i.areas.length > 0 ? i.areas.map(areaToText) : [emptyArea("Floor")]);
    setTileW(String(i.tileWidthMm));
    setTileH(String(i.tileHeightMm));
    setThickness(String(i.tileThicknessMm));
    setJoint(String(i.jointMm));
    setWaste(String(i.wastePct));
    setPerBox(String(i.piecesPerBox));
    setPrice(i.pricePerBox === null ? "" : String(i.pricePerBox));
    setAdhesiveRate(String(i.adhesiveKgPerM2));
  }

  function openEntry(entry: CalcEntry) {
    loadInput(entry.input);
    setActiveId(entry.id);
    setSaved(false);
    setShowHistoryOnPhone(false);
  }

  function startNew() {
    loadInput({ ...DEFAULT_INPUT, areas: [{ id: newId(), label: "Floor", length: 0, width: 0, openings: 0 }] });
    setActiveId(null);
    setSaved(false);
    setShowHistoryOnPhone(false);
  }

  function save() {
    if (!outcome.ok) return;
    const id = activeId ?? newId();
    const existing = history.find((e) => e.id === id);
    const entry: CalcEntry = {
      id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      name: existing?.name ?? defaultName(input),
      input,
      summary: summarize(input),
    };
    setHistory(saveEntry(userId, history, entry));
    setActiveId(id);
    setSaved(true);
  }

  function pickLayout(next: Layout) {
    setLayout(next);
    setWaste(String(LAYOUT_WASTE[next].pct));
    setSaved(false);
  }

  function updateArea(id: string, patch: Partial<AreaText>) {
    setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setSaved(false);
  }

  const groups = groupByDate(history);
  const result = outcome.ok ? outcome.result : null;
  const unitLabel = unit === "ft" ? "ft" : "m";

  return (
    <PageContainer className="max-w-7xl" compact>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* History */}
        <aside className={cn("flex min-h-0 flex-col rounded-2xl border border-stone-200 bg-white shadow-soft lg:h-[calc(100vh-11rem)]", !showHistoryOnPhone && "hidden lg:flex")} aria-label="Calculation history">
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 p-4">
            <h2 className="font-display text-xl text-stone-900">History</h2>
            <Button size="sm" onClick={startNew}>
              + New
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {history.length === 0 ? (
              <p className="p-4 text-sm text-stone-500">Saved calculations appear here. Fill in a job and press Save.</p>
            ) : (
              groups.map((group) => (
                <section key={group.label} className="mb-3">
                  <h3 className="sticky top-0 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">{group.label}</h3>
                  <ul>
                    {group.items.map((entry) => (
                      <li key={entry.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => openEntry(entry)}
                          aria-current={entry.id === activeId ? "true" : undefined}
                          className={cn("w-full rounded-xl px-3 py-2.5 pr-10 text-left transition-colors", entry.id === activeId ? "bg-clay-100" : "hover:bg-stone-100")}
                        >
                          <span className="block truncate text-sm font-medium text-stone-900">{entry.name}</span>
                          <span className="block truncate text-xs text-stone-500">{entry.summary}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingRemove(entry)}
                          aria-label={`Delete ${entry.name}`}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
          {history.length > 0 && (
            <div className="border-t border-stone-200 p-3">
              <button type="button" onClick={() => setConfirmClear(true)} className="w-full rounded-lg px-3 py-2 text-sm text-stone-500 hover:bg-red-50 hover:text-red-700">
                Clear all history
              </button>
            </div>
          )}
        </aside>

        {/* Calculator */}
        <section className={cn("min-w-0", showHistoryOnPhone && "hidden lg:block")}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl text-stone-900">Tile calculator</h1>
              <p className="mt-1 text-sm text-stone-600">How many tiles, boxes, grout and adhesive a job needs. The answer updates as you type.</p>
            </div>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowHistoryOnPhone(true)}>
              History ({history.length})
            </Button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              {/* Areas */}
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-lg text-stone-900">Areas to tile</h2>
                  <div className="inline-flex rounded-lg border border-stone-300 p-0.5" role="group" aria-label="Measurement unit">
                    {(["ft", "m"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          setUnit(u);
                          setSaved(false);
                        }}
                        aria-pressed={unit === u}
                        className={cn("rounded-md px-3 py-1.5 text-sm font-medium", unit === u ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100")}
                      >
                        {u === "ft" ? "Feet" : "Metres"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {areas.map((a, i) => (
                    <div key={a.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3.5">
                      <div className="flex items-center gap-2">
                        <input aria-label={`Name of area ${i + 1}`} className={cn(field, "font-medium")} value={a.label} maxLength={40} onChange={(e) => updateArea(a.id, { label: e.target.value })} placeholder="e.g. Bathroom floor" />
                        {areas.length > 1 && (
                          <button type="button" onClick={() => setAreas((prev) => prev.filter((x) => x.id !== a.id))} aria-label={`Remove ${a.label || `area ${i + 1}`}`} className="rounded-lg px-2.5 py-2 text-stone-500 hover:bg-red-50 hover:text-red-700">
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <div>
                          <label className={label} htmlFor={`len-${a.id}`}>Length ({unitLabel})</label>
                          <input id={`len-${a.id}`} inputMode="decimal" className={field} value={a.length} onChange={(e) => updateArea(a.id, { length: e.target.value })} placeholder="0" />
                        </div>
                        <div>
                          <label className={label} htmlFor={`wid-${a.id}`}>Width / height ({unitLabel})</label>
                          <input id={`wid-${a.id}`} inputMode="decimal" className={field} value={a.width} onChange={(e) => updateArea(a.id, { width: e.target.value })} placeholder="0" />
                        </div>
                        <div>
                          <label className={label} htmlFor={`op-${a.id}`}>Doors / windows ({unitLabel}²)</label>
                          <input id={`op-${a.id}`} inputMode="decimal" className={field} value={a.openings} onChange={(e) => updateArea(a.id, { openings: e.target.value })} placeholder="0" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAreas((prev) => [...prev, emptyArea(`Area ${prev.length + 1}`)]);
                    setSaved(false);
                  }}
                  disabled={areas.length >= 12}
                  className="mt-3 rounded-lg border border-dashed border-stone-300 px-3.5 py-2 text-sm font-medium text-clay-700 hover:bg-clay-50 disabled:opacity-50"
                >
                  + Add another area
                </button>
              </div>

              {/* Tile */}
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-soft">
                <h2 className="font-display text-lg text-stone-900">Tile</h2>
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Common sizes">
                  {TILE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setTileW(String(p.w));
                        setTileH(String(p.h));
                        setPerBox(String(p.perBox));
                        setSaved(false);
                      }}
                      className={cn("rounded-full border px-2.5 py-1 text-xs", tileW === String(p.w) && tileH === String(p.h) ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 text-stone-600 hover:bg-stone-100")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <NumberField id="tw" text="Width (mm)" value={tileW} onChange={(v) => { setTileW(v); setSaved(false); }} />
                  <NumberField id="th" text="Height (mm)" value={tileH} onChange={(v) => { setTileH(v); setSaved(false); }} />
                  <NumberField id="tt" text="Thickness (mm)" value={thickness} onChange={(v) => { setThickness(v); setSaved(false); }} />
                  <NumberField id="tj" text="Grout joint (mm)" value={joint} onChange={(v) => { setJoint(v); setSaved(false); }} />
                  <NumberField id="pb" text="Pieces per box" value={perBox} onChange={(v) => { setPerBox(v); setSaved(false); }} />
                  <NumberField id="pr" text="Price per box (Rs.)" value={price} placeholder="optional" onChange={(v) => { setPrice(v); setSaved(false); }} />
                  <NumberField id="ar" text="Adhesive (kg per m²)" value={adhesiveRate} onChange={(v) => { setAdhesiveRate(v); setSaved(false); }} />
                </div>

                <div className="mt-5">
                  <label className={label} htmlFor="layout">Laying pattern (sets the wastage)</label>
                  <select id="layout" className={field} value={layout} onChange={(e) => pickLayout(e.target.value as Layout)}>
                    {(Object.keys(LAYOUT_WASTE) as Layout[]).map((k) => (
                      <option key={k} value={k}>
                        {LAYOUT_WASTE[k].label} · {LAYOUT_WASTE[k].pct}%
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-stone-500">{LAYOUT_WASTE[layout].hint}</p>
                  <div className="mt-3 max-w-[12rem]">
                    <NumberField id="wp" text="Wastage (%)" value={waste} onChange={(v) => { setWaste(v); setSaved(false); }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Result */}
            <div id="calc-result" className="scroll-mt-24 xl:sticky xl:top-24 xl:self-start">
              <div className="rounded-2xl border border-teal-400/40 bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 p-5 text-white shadow-xl" aria-live="polite">
                <h2 className="font-display text-lg">You need</h2>
                {result ? (
                  <>
                    <p className="mt-3 text-5xl font-semibold tabular-nums">{result.boxes}</p>
                    <p className="text-sm text-teal-50">boxes of {input.piecesPerBox} tiles</p>

                    <dl className="mt-5 space-y-2.5 text-sm">
                      <Row k="Area to tile" v={`${fmt(result.netAreaSqFt)} sq ft (${fmt(result.netAreaM2)} m²)`} />
                      <Row k="Tiles needed (with wastage)" v={fmt(result.tilesNeeded, 0)} />
                      <Row k="Tiles you buy" v={`${fmt(result.tilesPurchased, 0)} (${fmt(result.spareTiles, 0)} spare)`} />
                      <Row k="Boxes cover" v={`${fmt(result.purchasedCoverageSqFt)} sq ft`} />
                      <Row k="Adhesive" v={`${fmt(result.adhesiveKg)} kg · ${bags(result.adhesiveBags)} of ${input.adhesiveBagKg} kg`} />
                      <Row k="Grout" v={`${fmt(result.groutKg)} kg · ${bags(result.groutBags)} of ${input.groutBagKg} kg`} />
                      {result.totalCost !== null && <Row k="Tile cost" v={money(result.totalCost)} strong />}
                    </dl>

                    {result.perArea.length > 1 && (
                      <ul className="mt-4 space-y-1 border-t border-white/25 pt-3 text-xs text-teal-50">
                        {result.perArea.map((a) => (
                          <li key={a.id} className="flex justify-between gap-3">
                            <span className="truncate">{a.label}</span>
                            <span className="tabular-nums">{fmt(a.netAreaSqFt)} sq ft</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-sm text-amber-100">
                    {outcome.ok ? null : outcome.errors.slice(0, 4).map((e) => <li key={e}>• {e}</li>)}
                  </ul>
                )}

                <Button className="mt-5 w-full bg-white text-stone-900 hover:bg-stone-200" onClick={save} disabled={!result}>
                  {saved ? "Saved to history ✓" : activeId ? "Update saved calculation" : "Save to history"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-stone-500">
                Estimates follow standard shop practice. Round up, keep spare boxes from the same batch (colour can vary between batches), and confirm measurements on site. History is saved on this device for your account.
              </p>
            </div>
          </div>
        </section>
      </div>

      {result && !showHistoryOnPhone && (
        <button
          type="button"
          onClick={() => document.getElementById("calc-result")?.scrollIntoView({ behavior: "smooth" })}
          className="fixed inset-x-4 bottom-4 z-30 rounded-2xl bg-gradient-to-r from-teal-600 to-cyan-700 px-5 py-3.5 text-left text-white shadow-2xl xl:hidden"
        >
          <span className="text-lg font-semibold tabular-nums">{result.boxes} boxes</span>
          <span className="ml-2 text-sm text-teal-50">· {fmt(result.tilesNeeded, 0)} tiles · tap for details</span>
        </button>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Delete calculation?"
        message={pendingRemove ? `Delete "${pendingRemove.name}" from your history?` : ""}
        onConfirm={async () => {
          if (!pendingRemove) return;
          setHistory(removeEntry(userId, history, pendingRemove.id));
          if (activeId === pendingRemove.id) setActiveId(null);
        }}
        onClose={() => setPendingRemove(null)}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Clear all history?"
        message="This removes every saved calculation on this device."
        confirmLabel="Clear all"
        onConfirm={async () => {
          setHistory(clearHistory(userId));
          setActiveId(null);
        }}
        onClose={() => setConfirmClear(false)}
      />
    </PageContainer>
  );
}

function NumberField({ id, text, value, onChange, placeholder }: { id: string; text: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className={label} htmlFor={id}>
        {text}
      </label>
      <input id={id} inputMode="decimal" className={field} value={value} placeholder={placeholder ?? "0"} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-teal-100">{k}</dt>
      <dd className={cn("text-right tabular-nums", strong ? "text-base font-semibold" : "font-medium")}>{v}</dd>
    </div>
  );
}
