import { useId, type ReactNode } from "react";
import type { DesignPattern } from "@/lib/designPatterns";

export interface DemoFill {
  /** Shown when there is no photo (or while it loads / if it fails). */
  color: string;
  /** Tile photo, repeated to fill the cell. */
  image?: string;
}

/** Neutral colours used until the owner has chosen real tiles. */
export const DEMO_COLORS = ["#d6cfc7", "#8f8a85", "#ead9c4", "#a9bdb8"];

const VW = 120;
const VH = 90;
const U = 15; // cell size: 8 columns x 6 rows
const COLS = VW / U;
const ROWS = VH / U;
const GROUT = "rgba(255,255,255,.8)";

interface Props {
  pattern: DesignPattern;
  /** One entry per tile role; fewer than the pattern needs are cycled. */
  fills: DemoFill[];
  className?: string;
  label?: string;
}

/** A small deterministic generator so "random mix" always looks the same. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * A flat drawing of how a layout looks on a wall: the same pattern the model is asked to lay. Where the owner has chosen real
 * tiles their photos are used, so the demo previews the actual combination.
 */
export function PatternDemo({ pattern, fills, className, label }: Props) {
  const uid = useId().replace(/:/g, "");
  const n = Math.max(1, fills.length);
  const fill = (i: number) => fills[((i % n) + n) % n]!;
  const ref = (i: number) => (fill(i).image ? `url(#${uid}-f${((i % n) + n) % n})` : fill(i).color);

  const cell = (key: string, x: number, y: number, w: number, h: number, i: number): ReactNode => (
    <rect key={key} x={x} y={y} width={w} height={h} fill={fill(i).color} stroke={GROUT} strokeWidth={0.6} />
  );
  // Photo layer on top of the colour (so a photo that fails to load still shows the colour).
  const cellWithPhoto = (key: string, x: number, y: number, w: number, h: number, i: number): ReactNode =>
    fill(i).image ? (
      <g key={key}>
        <rect x={x} y={y} width={w} height={h} fill={fill(i).color} />
        <rect x={x} y={y} width={w} height={h} fill={ref(i)} stroke={GROUT} strokeWidth={0.6} />
      </g>
    ) : (
      cell(key, x, y, w, h, i)
    );
  const c = cellWithPhoto;

  const grid = (pick: (col: number, row: number) => number): ReactNode[] => {
    const out: ReactNode[] = [];
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) out.push(c(`${col}-${r}`, col * U, r * U, U, U, pick(col, r)));
    return out;
  };

  let body: ReactNode;
  switch (pattern) {
    case "single":
      body = grid(() => 0);
      break;
    case "checkerboard":
      body = grid((col, r) => (col + r) % 2);
      break;
    case "horizontal_bands":
      body = grid((_col, r) => ROWS - 1 - r);
      break;
    case "vertical_stripes":
      body = grid((col) => col);
      break;
    case "dado":
      body = (
        <>
          {grid((_col, r) => (r >= ROWS / 2 ? 0 : 1))}
          <line x1={0} x2={VW} y1={VH / 2} y2={VH / 2} stroke="#303B33" strokeWidth={1.4} />
        </>
      );
      break;
    case "highlighter_strip": {
      const hasUpper = n >= 3;
      body = grid((_col, r) => (r === 3 ? 1 : r < 3 && hasUpper ? 2 : 0));
      break;
    }
    case "border_frame":
      body = grid((col, r) => (col === 0 || col === COLS - 1 || r === 0 || r === ROWS - 1 ? 1 : 0));
      break;
    case "feature_panel":
      body = grid((col, r) => (col >= 3 && col <= 5 && r >= 2 ? 1 : 0));
      break;
    case "herringbone": {
      // Planks of 2 x 1 units: a horizontal plank and a vertical plank alternate along a diagonal chain, chains repeat every 4 units.
      const u = 6;
      const planks: ReactNode[] = [];
      for (let k = -2; k <= 16; k++) {
        for (let j = -5; j <= 7; j++) {
          const hx = k + 4 * j;
          if (hx < -3 || hx > 21) continue;
          planks.push(c(`h${k}-${j}`, hx * u, k * u, 2 * u, u, 0));
          planks.push(c(`v${k}-${j}`, (hx + 2) * u, (k - 1) * u, u, 2 * u, n > 1 ? 1 : 0));
        }
      }
      body = planks;
      break;
    }
    case "diagonal": {
      const out: ReactNode[] = [];
      for (let r = -4; r < 12; r++) for (let col = -4; col < 12; col++) out.push(c(`${col}-${r}`, col * U, r * U, U, U, n > 1 ? (col + r) & 1 : 0));
      body = <g transform={`rotate(45 ${VW / 2} ${VH / 2})`}>{out}</g>;
      break;
    }
    case "random_mix": {
      const rnd = lcg(7);
      const picked: number[][] = [];
      const out: ReactNode[] = [];
      for (let r = 0; r < ROWS; r++) {
        picked[r] = [];
        for (let col = 0; col < COLS; col++) {
          let v = Math.floor(rnd() * n);
          // Avoid two identical tiles touching where possible.
          for (let tries = 0; tries < 4 && n > 1 && (picked[r]![col - 1] === v || picked[r - 1]?.[col] === v); tries++) v = (v + 1) % n;
          picked[r]![col] = v;
          out.push(c(`${col}-${r}`, col * U, r * U, U, U, v));
        }
      }
      body = out;
      break;
    }
  }

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className={className} role="img" aria-label={label ?? `${pattern} layout demo`} preserveAspectRatio="xMidYMid meet">
      <defs>
        {fills.map((f, i) =>
          f.image ? (
            <pattern key={i} id={`${uid}-f${i}`} patternUnits="userSpaceOnUse" width={U * 2} height={U * 2}>
              <image href={f.image} width={U * 2} height={U * 2} preserveAspectRatio="xMidYMid slice" />
            </pattern>
          ) : null,
        )}
        <clipPath id={`${uid}-clip`}>
          <rect x={0} y={0} width={VW} height={VH} rx={3} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-clip)`}>{body}</g>
      <rect x={0.5} y={0.5} width={VW - 1} height={VH - 1} rx={3} fill="none" stroke="#303B33" strokeOpacity={0.55} strokeWidth={1} />
    </svg>
  );
}
