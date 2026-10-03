/**
 * Tile quantity calculator. Pure functions only, so every number can be unit-tested.
 *
 * Method (the one tile shops use):
 *  - net area = sum of (length x width - openings) for every area
 *  - one tile covers (tile width + joint) x (tile height + joint)
 *  - tiles = net area / that coverage, plus a wastage allowance for cuts and breakage, rounded up
 *  - boxes = tiles / pieces per box, rounded up (tiles are sold by the box)
 *  - grout (kg per m2) = (L + W) / (L x W) x joint x thickness x density, with L, W, joint and thickness in mm
 *  - adhesive = kg per m2 x net area
 */

export type Unit = "m" | "ft";
export type Layout = "straight" | "offset" | "diagonal" | "herringbone" | "mosaic";

export const SQFT_PER_M2 = 10.763910416709722;
const M2_PER_SQFT = 1 / SQFT_PER_M2;
/** Typical grout density in kg per litre of cured joint. */
const GROUT_DENSITY = 1.7;

export interface CalcArea {
  id: string;
  label: string;
  length: number;
  width: number;
  /** Doors, windows and other parts not tiled, in the same square unit as the area. */
  openings: number;
}

export interface CalcInput {
  unit: Unit;
  areas: CalcArea[];
  tileWidthMm: number;
  tileHeightMm: number;
  tileThicknessMm: number;
  jointMm: number;
  wastePct: number;
  piecesPerBox: number;
  /** Price of one box; null when the user has not entered it. */
  pricePerBox: number | null;
  adhesiveKgPerM2: number;
  adhesiveBagKg: number;
  groutBagKg: number;
}

export interface AreaBreakdown {
  id: string;
  label: string;
  netAreaM2: number;
  netAreaSqFt: number;
}

export interface CalcResult {
  netAreaM2: number;
  netAreaSqFt: number;
  /** Tiles needed before wastage (can be fractional). */
  tilesExact: number;
  /** Tiles needed including wastage, rounded up. */
  tilesNeeded: number;
  boxes: number;
  /** Tiles you actually buy (boxes x pieces per box). */
  tilesPurchased: number;
  /** Tiles left over after the job. */
  spareTiles: number;
  /** Floor area the purchased boxes can cover, before wastage. */
  purchasedCoverageM2: number;
  purchasedCoverageSqFt: number;
  totalCost: number | null;
  groutKg: number;
  groutBags: number;
  adhesiveKg: number;
  adhesiveBags: number;
  perArea: AreaBreakdown[];
}

export type CalcOutcome = { ok: true; result: CalcResult } | { ok: false; errors: string[] };

export const LAYOUT_WASTE: Record<Layout, { label: string; pct: number; hint: string }> = {
  straight: { label: "Straight (grid)", pct: 5, hint: "Simple rows and columns. Least waste." },
  offset: { label: "Brick / offset", pct: 8, hint: "Each row shifted by half a tile." },
  diagonal: { label: "Diagonal (45 degrees)", pct: 12, hint: "More edge cuts, so more waste." },
  herringbone: { label: "Herringbone", pct: 15, hint: "Lots of angled cuts. Highest waste." },
  mosaic: { label: "Mosaic / patterned", pct: 10, hint: "Small pieces and pattern matching." },
};

export const TILE_PRESETS: Array<{ label: string; w: number; h: number; perBox: number }> = [
  { label: "300 x 300 mm", w: 300, h: 300, perBox: 11 },
  { label: "300 x 450 mm", w: 300, h: 450, perBox: 8 },
  { label: "300 x 600 mm", w: 300, h: 600, perBox: 6 },
  { label: "600 x 600 mm", w: 600, h: 600, perBox: 4 },
  { label: "600 x 1200 mm", w: 600, h: 1200, perBox: 2 },
  { label: "800 x 800 mm", w: 800, h: 800, perBox: 3 },
  { label: "200 x 1200 mm (plank)", w: 200, h: 1200, perBox: 6 },
];

export const DEFAULT_INPUT: CalcInput = {
  unit: "ft",
  areas: [{ id: "a1", label: "Floor", length: 0, width: 0, openings: 0 }],
  tileWidthMm: 600,
  tileHeightMm: 600,
  tileThicknessMm: 9,
  jointMm: 3,
  wastePct: 5,
  piecesPerBox: 4,
  pricePerBox: null,
  adhesiveKgPerM2: 5,
  adhesiveBagKg: 20,
  groutBagKg: 5,
};

const toM2 = (value: number, unit: Unit) => (unit === "ft" ? value * M2_PER_SQFT : value);
const round = (n: number, places = 2) => {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
};
// Guards against 3.0000000001 rounding up to 4 after floating-point arithmetic.
const ceilClean = (n: number) => Math.ceil(round(n, 6));

/** Every problem with the inputs, in plain words. Empty when the numbers can be calculated. */
export function validateInput(input: CalcInput): string[] {
  const errors: string[] = [];
  const num = (v: number) => Number.isFinite(v);

  if (input.areas.length === 0) errors.push("Add at least one area to tile.");
  input.areas.forEach((a, i) => {
    const name = a.label.trim() || `Area ${i + 1}`;
    if (!num(a.length) || !num(a.width) || a.length <= 0 || a.width <= 0) {
      errors.push(`${name}: enter a length and width greater than zero.`);
      return;
    }
    if (!num(a.openings) || a.openings < 0) errors.push(`${name}: openings cannot be negative.`);
    else if (a.openings >= a.length * a.width) errors.push(`${name}: openings must be smaller than the area itself.`);
  });

  if (!num(input.tileWidthMm) || !num(input.tileHeightMm) || input.tileWidthMm < 10 || input.tileHeightMm < 10 || input.tileWidthMm > 3000 || input.tileHeightMm > 3000)
    errors.push("Tile size must be between 10 and 3000 mm on each side.");
  if (!num(input.tileThicknessMm) || input.tileThicknessMm < 3 || input.tileThicknessMm > 40) errors.push("Tile thickness must be between 3 and 40 mm.");
  if (!num(input.jointMm) || input.jointMm < 0 || input.jointMm > 20) errors.push("Grout joint must be between 0 and 20 mm.");
  if (!num(input.wastePct) || input.wastePct < 0 || input.wastePct > 50) errors.push("Wastage must be between 0 and 50 percent.");
  if (!Number.isInteger(input.piecesPerBox) || input.piecesPerBox < 1 || input.piecesPerBox > 200) errors.push("Pieces per box must be a whole number from 1 to 200.");
  if (input.pricePerBox !== null && (!num(input.pricePerBox) || input.pricePerBox < 0)) errors.push("Price cannot be negative.");
  if (!num(input.adhesiveKgPerM2) || input.adhesiveKgPerM2 < 0 || !num(input.adhesiveBagKg) || input.adhesiveBagKg <= 0) errors.push("Adhesive coverage and bag size must be positive numbers.");
  if (!num(input.groutBagKg) || input.groutBagKg <= 0) errors.push("Grout bag size must be a positive number.");
  return errors;
}

export function calculate(input: CalcInput): CalcOutcome {
  const errors = validateInput(input);
  if (errors.length > 0) return { ok: false, errors };

  const perArea: AreaBreakdown[] = input.areas.map((a, i) => {
    const netInUnit = a.length * a.width - a.openings;
    const netAreaM2 = toM2(netInUnit, input.unit);
    return {
      id: a.id,
      label: a.label.trim() || `Area ${i + 1}`,
      netAreaM2: round(netAreaM2, 4),
      netAreaSqFt: round(netAreaM2 * SQFT_PER_M2, 2),
    };
  });

  const netAreaM2 = perArea.reduce((sum, a) => sum + a.netAreaM2, 0);
  const coveragePerTileM2 = ((input.tileWidthMm + input.jointMm) * (input.tileHeightMm + input.jointMm)) / 1_000_000;
  const tilesExact = netAreaM2 / coveragePerTileM2;
  const tilesNeeded = ceilClean(tilesExact * (1 + input.wastePct / 100));
  const boxes = ceilClean(tilesNeeded / input.piecesPerBox);
  const tilesPurchased = boxes * input.piecesPerBox;

  const groutLitresPerM2 =
    ((input.tileWidthMm + input.tileHeightMm) / (input.tileWidthMm * input.tileHeightMm)) * input.jointMm * input.tileThicknessMm;
  const groutKg = groutLitresPerM2 * GROUT_DENSITY * netAreaM2;
  const adhesiveKg = input.adhesiveKgPerM2 * netAreaM2;
  const purchasedCoverageM2 = tilesPurchased * coveragePerTileM2;

  return {
    ok: true,
    result: {
      netAreaM2: round(netAreaM2, 2),
      netAreaSqFt: round(netAreaM2 * SQFT_PER_M2, 2),
      tilesExact: round(tilesExact, 1),
      tilesNeeded,
      boxes,
      tilesPurchased,
      spareTiles: tilesPurchased - tilesNeeded,
      purchasedCoverageM2: round(purchasedCoverageM2, 2),
      purchasedCoverageSqFt: round(purchasedCoverageM2 * SQFT_PER_M2, 2),
      totalCost: input.pricePerBox === null ? null : round(boxes * input.pricePerBox, 2),
      groutKg: round(groutKg, 2),
      groutBags: groutKg > 0 ? ceilClean(groutKg / input.groutBagKg) : 0,
      adhesiveKg: round(adhesiveKg, 2),
      adhesiveBags: adhesiveKg > 0 ? ceilClean(adhesiveKg / input.adhesiveBagKg) : 0,
      perArea,
    },
  };
}
