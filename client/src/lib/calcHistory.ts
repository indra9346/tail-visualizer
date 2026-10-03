import { calculate, type CalcInput } from "./tileCalc";

export interface CalcEntry {
  id: string;
  createdAt: string;
  name: string;
  input: CalcInput;
  /** Short summary shown in the list, e.g. "42 tiles · 11 boxes". */
  summary: string;
}

export const MAX_ENTRIES = 50;

// Typed through globalThis so this module also type-checks in the server-side Jest project (no DOM lib there).
interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
const store = (): KeyValueStore | undefined => (globalThis as { localStorage?: KeyValueStore }).localStorage;

/** History is kept per signed-in user on this device, so two staff members on one computer never see each other's. */
export const historyKey = (userId: string | null | undefined) => `tile-visualizer:calc-history:${userId ?? "guest"}`;

function isEntry(value: unknown): value is CalcEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.createdAt === "string" &&
    typeof e.name === "string" &&
    typeof e.summary === "string" &&
    !!e.input &&
    typeof e.input === "object" &&
    Array.isArray((e.input as Record<string, unknown>).areas)
  );
}

export function loadHistory(userId: string | null | undefined): CalcEntry[] {
  try {
    const raw = store()?.getItem(historyKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function persist(userId: string | null | undefined, entries: CalcEntry[]): void {
  try {
    store()?.setItem(historyKey(userId), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* storage full or blocked: the on-screen list still works for this visit */
  }
}

export function summarize(input: CalcInput): string {
  const outcome = calculate(input);
  if (!outcome.ok) return "Incomplete";
  const r = outcome.result;
  return `${r.netAreaSqFt} sq ft · ${r.tilesNeeded} tiles · ${r.boxes} boxes`;
}

export function defaultName(input: CalcInput): string {
  const labels = input.areas.map((a) => a.label.trim()).filter(Boolean);
  const base = labels.length > 0 ? labels.slice(0, 2).join(" + ") + (labels.length > 2 ? ` +${labels.length - 2}` : "") : "Calculation";
  return `${base} · ${input.tileWidthMm}x${input.tileHeightMm}`;
}

/** Saves a calculation at the top of the list. Saving the same entry id again updates it in place. */
export function saveEntry(userId: string | null | undefined, entries: CalcEntry[], entry: CalcEntry): CalcEntry[] {
  const next = [entry, ...entries.filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
  persist(userId, next);
  return next;
}

export function removeEntry(userId: string | null | undefined, entries: CalcEntry[], id: string): CalcEntry[] {
  const next = entries.filter((e) => e.id !== id);
  persist(userId, next);
  return next;
}

export function clearHistory(userId: string | null | undefined): CalcEntry[] {
  try {
    store()?.removeItem(historyKey(userId));
  } catch {
    /* best effort */
  }
  return [];
}
