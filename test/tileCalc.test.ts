import { DEFAULT_INPUT, SQFT_PER_M2, calculate, validateInput, type CalcInput } from "../client/src/lib/tileCalc";
import { clearHistory, defaultName, historyKey, loadHistory, MAX_ENTRIES, removeEntry, saveEntry, summarize, type CalcEntry } from "../client/src/lib/calcHistory";
import { groupByDate, visualizationSubtitle, visualizationTitle } from "../client/src/lib/history";

const base = (over: Partial<CalcInput> = {}): CalcInput => ({
  ...DEFAULT_INPUT,
  unit: "m",
  areas: [{ id: "a", label: "Floor", length: 4, width: 3, openings: 0 }],
  tileWidthMm: 600,
  tileHeightMm: 600,
  tileThicknessMm: 10,
  jointMm: 0,
  wastePct: 0,
  piecesPerBox: 4,
  ...over,
});

function ok(input: CalcInput) {
  const out = calculate(input);
  if (!out.ok) throw new Error(out.errors.join("; "));
  return out.result;
}

describe("tile calculator", () => {
  test("4 m x 3 m with 600 mm tiles, no joint, no waste: 33.3 tiles round up to 34, 9 boxes of 4", () => {
    const r = ok(base());
    expect(r.netAreaM2).toBe(12);
    expect(r.tilesExact).toBe(33.3);
    expect(r.tilesNeeded).toBe(34);
    expect(r.boxes).toBe(9);
    expect(r.tilesPurchased).toBe(36);
    expect(r.spareTiles).toBe(2);
  });

  test("10 ft x 12 ft floor, 600 mm tiles, 3 mm joint, 5 percent waste: 33 tiles, 9 boxes", () => {
    const r = ok(base({ unit: "ft", areas: [{ id: "a", label: "Floor", length: 10, width: 12, openings: 0 }], jointMm: 3, wastePct: 5 }));
    expect(r.netAreaSqFt).toBe(120);
    expect(r.tilesNeeded).toBe(33);
    expect(r.boxes).toBe(9);
  });

  test("an exact fit does not buy an extra tile (floating point safe)", () => {
    const r = ok(base({ areas: [{ id: "a", label: "Floor", length: 1.2, width: 1.2, openings: 0 }], piecesPerBox: 4 }));
    expect(r.tilesNeeded).toBe(4);
    expect(r.boxes).toBe(1);
  });

  test("openings are subtracted", () => {
    const r = ok(base({ areas: [{ id: "a", label: "Wall", length: 4, width: 3, openings: 2 }] }));
    expect(r.netAreaM2).toBe(10);
  });

  test("several areas add up, with a per-area breakdown", () => {
    const r = ok(
      base({
        areas: [
          { id: "a", label: "Floor", length: 4, width: 3, openings: 0 },
          { id: "b", label: "Wall", length: 3, width: 2.5, openings: 1.5 },
        ],
      }),
    );
    expect(r.netAreaM2).toBe(18);
    expect(r.perArea.map((a) => a.label)).toEqual(["Floor", "Wall"]);
    expect(r.perArea[1]?.netAreaM2).toBe(6);
  });

  test("grout and adhesive follow the standard formulas", () => {
    // 600x600x10 mm tile, 3 mm joint: (1200 / 360000) x 3 x 10 = 0.1 L per m2, x 1.7 = 0.17 kg per m2
    const r = ok(base({ jointMm: 3 }));
    expect(r.groutKg).toBe(2.04);
    expect(r.groutBags).toBe(1);
    expect(r.adhesiveKg).toBe(60);
    expect(r.adhesiveBags).toBe(3);
  });

  test("cost is boxes times price; no price gives no total", () => {
    expect(ok(base({ pricePerBox: 1200 })).totalCost).toBe(10800);
    expect(ok(base({ pricePerBox: null })).totalCost).toBeNull();
  });

  test("more waste never reduces the tiles needed", () => {
    expect(ok(base({ wastePct: 15 })).tilesNeeded).toBeGreaterThanOrEqual(ok(base({ wastePct: 5 })).tilesNeeded);
  });

  test("a wider joint means each tile covers more, so fewer tiles", () => {
    expect(ok(base({ jointMm: 10 })).tilesExact).toBeLessThan(ok(base({ jointMm: 0 })).tilesExact);
  });

  test("feet and metres agree", () => {
    const m = ok(base({ areas: [{ id: "a", label: "F", length: 3, width: 3, openings: 0 }] }));
    const side = 3 * 3.280839895;
    const ft = ok(base({ unit: "ft", areas: [{ id: "a", label: "F", length: side, width: side, openings: 0 }] }));
    expect(Math.abs(ft.netAreaM2 - m.netAreaM2)).toBeLessThan(0.01);
    expect(m.netAreaSqFt).toBeCloseTo(9 * SQFT_PER_M2, 1);
  });

  test.each([
    ["zero length", base({ areas: [{ id: "a", label: "F", length: 0, width: 3, openings: 0 }] })],
    ["negative width", base({ areas: [{ id: "a", label: "F", length: 3, width: -1, openings: 0 }] })],
    ["NaN length", base({ areas: [{ id: "a", label: "F", length: NaN, width: 3, openings: 0 }] })],
    ["openings as big as the area", base({ areas: [{ id: "a", label: "F", length: 2, width: 2, openings: 4 }] })],
    ["no areas", base({ areas: [] })],
    ["tiny tile", base({ tileWidthMm: 2 })],
    ["huge joint", base({ jointMm: 50 })],
    ["wastage over 50", base({ wastePct: 80 })],
    ["fractional pieces per box", base({ piecesPerBox: 2.5 })],
    ["zero pieces per box", base({ piecesPerBox: 0 })],
    ["negative price", base({ pricePerBox: -5 })],
  ])("rejects %s with a message instead of a wrong answer", (_name, input) => {
    expect(validateInput(input).length).toBeGreaterThan(0);
    expect(calculate(input).ok).toBe(false);
  });
});

describe("calculator history", () => {
  const mem: Record<string, string> = {};
  beforeAll(() => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (k in mem ? mem[k] : null),
      setItem: (k: string, v: string) => void (mem[k] = v),
      removeItem: (k: string) => void delete mem[k],
    };
  });
  beforeEach(() => Object.keys(mem).forEach((k) => delete mem[k]));

  const entry = (id: string): CalcEntry => ({ id, createdAt: "2026-10-03T10:00:00Z", name: id, input: base(), summary: summarize(base()) });

  test("saves, reloads, updates in place and deletes", () => {
    let list = saveEntry("u1", [], entry("a"));
    list = saveEntry("u1", list, entry("b"));
    expect(loadHistory("u1").map((e) => e.id)).toEqual(["b", "a"]);
    list = saveEntry("u1", list, { ...entry("a"), name: "renamed" });
    expect(loadHistory("u1").map((e) => e.name)).toEqual(["renamed", "b"]);
    list = removeEntry("u1", list, "b");
    expect(loadHistory("u1").map((e) => e.id)).toEqual(["a"]);
    expect(clearHistory("u1")).toEqual([]);
    expect(loadHistory("u1")).toEqual([]);
  });

  test("each user has a separate history", () => {
    saveEntry("u1", [], entry("a"));
    expect(loadHistory("u2")).toEqual([]);
    expect(historyKey("u1")).not.toBe(historyKey(null));
  });

  test("keeps at most MAX_ENTRIES and ignores corrupt data", () => {
    let list: CalcEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES + 5; i++) list = saveEntry("u1", list, entry(`e${i}`));
    expect(loadHistory("u1")).toHaveLength(MAX_ENTRIES);
    mem[historyKey("u3")] = "{not json";
    expect(loadHistory("u3")).toEqual([]);
    mem[historyKey("u4")] = JSON.stringify([{ id: 1 }, entry("ok")]);
    expect(loadHistory("u4").map((e) => e.id)).toEqual(["ok"]);
  });

  test("summaries and default names are readable", () => {
    expect(summarize(base())).toContain("34 tiles");
    expect(summarize(base({ areas: [] }))).toBe("Incomplete");
    expect(defaultName(base())).toBe("Floor · 600x600");
  });
});

describe("visualization history helpers", () => {
  const now = new Date("2026-10-03T12:00:00");
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

  test("groups into chat-style sections, newest first, dropping empty ones", () => {
    const groups = groupByDate([{ createdAt: at(0) }, { createdAt: at(1) }, { createdAt: at(3) }, { createdAt: at(20) }, { createdAt: at(90) }, { createdAt: at(0.01) }], now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"]);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groupByDate([{ createdAt: at(0) }], now).map((g) => g.label)).toEqual(["Today"]);
    expect(groupByDate([], now)).toEqual([]);
  });

  test("titles come from the design, falling back to tile and surfaces", () => {
    const design = {
      areas: [
        { surface: "wall" as const, location: "Left wall", pattern: "dado" as const, patternNote: null, tileIds: ["x", "y"] },
        { surface: "floor" as const, location: "Entire floor", pattern: "single" as const, patternNote: null, tileIds: ["z"] },
      ],
    };
    expect(visualizationTitle({ design, tile: null, appliedSurfaces: ["wall", "floor"] })).toBe("Left wall + 1 more area");
    expect(visualizationSubtitle({ design, appliedSurfaces: [] })).toBe("Dado (lower + upper), Single tile (plain)");
    expect(visualizationTitle({ design: null, tile: { name: "Marble" } as never, appliedSurfaces: ["floor"] })).toBe("Marble · Floor");
    expect(visualizationTitle({ design: null, tile: null, appliedSurfaces: [] })).toBe("Visualization");
  });
});
