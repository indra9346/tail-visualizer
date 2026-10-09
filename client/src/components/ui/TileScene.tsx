import { memo, useId, useMemo, type CSSProperties, type ReactNode } from "react";

/**
 * A colourful, glossy tile floor that is "laid" piece by piece and then lifted again in a loop.
 * Each scene is a different real-world layout so every page can have its own look.
 * Pure SVG + CSS (see index.css, .tile-scene): no images, no scripts, and it stands still for people who prefer reduced motion.
 */
export type SceneId = "mosaic" | "checker" | "subway" | "hex" | "diamond" | "plank" | "terrazzo";

const W = 800;
const H = 320;
const GROUT = "#F1ECE3";

interface Shape {
  /** SVG path or points, drawn three times: shadow, glaze, highlight. */
  kind: "rect" | "poly";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rx?: number;
  points?: string;
  color: number;
  rank: number;
  rot: number;
  grain?: Array<[number, number, number]>;
  chips?: Array<{ x: number; y: number; s: number; color: number }>;
}

interface Scene {
  palette: string[];
  shapes: Shape[];
}

// Small seeded random generator so a scene looks the same on every visit and on every device.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

/** Tiles are laid from the top-left corner across to the bottom-right, like a fitter working across a room. */
function ranked(items: Array<Omit<Shape, "rank">>, cx: (s: Omit<Shape, "rank">) => number, cy: (s: Omit<Shape, "rank">) => number): Shape[] {
  const order = items.map((s, i) => ({ i, d: cx(s) + cy(s) * 1.6 })).sort((a, b) => a.d - b.d);
  const rankOf = new Map(order.map((o, r) => [o.i, r]));
  return items.map((s, i) => ({ ...s, rank: rankOf.get(i) ?? 0 }));
}

function buildScene(id: SceneId): Scene {
  const r = rng(id.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const rot = () => (r() - 0.5) * 36;

  switch (id) {
    case "mosaic": {
      const palette = ["#e76f51", "#f4a261", "#e9c46a", "#2a9d8f", "#3aa6d8", "#F1ECE3", "#d9577b"];
      const items: Array<Omit<Shape, "rank">> = [];
      for (let row = 0; row < 8; row++) for (let col = 0; col < 20; col++) items.push({ kind: "rect", x: col * 40 + 1.5, y: row * 40 + 1.5, w: 37, h: 37, rx: 3, color: Math.floor(r() * palette.length), rot: rot() });
      return { palette, shapes: ranked(items, (s) => s.x ?? 0, (s) => s.y ?? 0) };
    }
    case "checker": {
      const palette = ["#1f9e89", "#fff4dc", "#ff8a5b"];
      const items: Array<Omit<Shape, "rank">> = [];
      for (let row = 0; row < 5; row++) for (let col = 0; col < 13; col++) items.push({ kind: "rect", x: col * 64 + 2, y: row * 64 + 2, w: 60, h: 60, rx: 3, color: (row + col) % 2 === 0 ? 0 : 1, rot: rot() });
      // A few accent tiles, like a designer's inlay.
      for (let k = 0; k < 6; k++) items[Math.floor(r() * items.length)]!.color = 2;
      return { palette, shapes: ranked(items, (s) => s.x ?? 0, (s) => s.y ?? 0) };
    }
    case "subway": {
      const palette = ["#2f80ed", "#6bb7f0", "#a8dcf5", "#ffffff", "#ffb703"];
      const items: Array<Omit<Shape, "rank">> = [];
      for (let row = 0; row < 8; row++) for (let col = -1; col < 10; col++) {
        const x = col * 80 + (row % 2 ? -40 : 0);
        const accent = r() < 0.07;
        items.push({ kind: "rect", x: x + 1.5, y: row * 40 + 1.5, w: 77, h: 37, rx: 4, color: accent ? 4 : Math.floor(r() * 4), rot: rot() });
      }
      return { palette, shapes: ranked(items, (s) => s.x ?? 0, (s) => s.y ?? 0) };
    }
    case "hex": {
      const palette = ["#ff6b9d", "#ffb703", "#06d6a0", "#8d5cf6", "#4cc9f0", "#fff3d6"];
      const rad = 29;
      const wid = Math.sqrt(3) * rad;
      const items: Array<Omit<Shape, "rank">> = [];
      for (let row = -1; row < 9; row++) for (let col = -1; col < 18; col++) {
        const cx = col * wid + (row % 2 ? wid / 2 : 0);
        const cy = row * rad * 1.5;
        const pts = Array.from({ length: 6 }, (_, k) => {
          const a = (Math.PI / 180) * (60 * k - 30);
          return `${(cx + (rad - 1.6) * Math.cos(a)).toFixed(1)},${(cy + (rad - 1.6) * Math.sin(a)).toFixed(1)}`;
        }).join(" ");
        items.push({ kind: "poly", points: pts, x: cx, y: cy, color: Math.floor(r() * palette.length), rot: rot() });
      }
      return { palette, shapes: ranked(items, (s) => s.x ?? 0, (s) => s.y ?? 0) };
    }
    case "diamond": {
      const palette = ["#ef476f", "#ffe3a3", "#118ab2", "#06d6a0"];
      const d = 32;
      const items: Array<Omit<Shape, "rank">> = [];
      for (let row = -1; row < 12; row++) for (let col = -1; col < 14; col++) {
        const cx = col * d * 2 + (row % 2 ? d : 0);
        const cy = row * d;
        const k = d - 1.6;
        items.push({ kind: "poly", points: `${cx},${cy - k} ${cx + k},${cy} ${cx},${cy + k} ${cx - k},${cy}`, x: cx, y: cy, color: (col + (row % 2 ? 1 : 0) + Math.floor(row / 2)) % 2 === 0 ? 0 : r() < 0.18 ? 2 + (row % 2) : 1, rot: rot() });
      }
      return { palette, shapes: ranked(items, (s) => s.x ?? 0, (s) => s.y ?? 0) };
    }
    case "plank": {
      const palette = ["#c68642", "#deaa6e", "#a9714b", "#d19a5c", "#8d5a38"];
      const items: Array<Omit<Shape, "rank">> = [];
      for (let row = 0; row < 8; row++) {
        let x = -r() * 160;
        while (x < W) {
          const len = 150 + r() * 130;
          const grain: Array<[number, number, number]> = Array.from({ length: 4 }, () => [r() * len, 6 + r() * 26, 18 + r() * 60]);
          items.push({ kind: "rect", x: x + 1.5, y: row * 40 + 1.5, w: len - 3, h: 37, rx: 2, color: Math.floor(r() * palette.length), rot: rot() * 0.5, grain });
          x += len;
        }
      }
      return { palette, shapes: ranked(items, (s) => s.x ?? 0, (s) => s.y ?? 0) };
    }
    case "terrazzo": {
      const palette = ["#F1ECE3", "#f1dfc6", "#ee6c4d", "#3d5a80", "#2a9d8f", "#f2b134", "#d9577b"];
      const items: Array<Omit<Shape, "rank">> = [];
      for (let row = 0; row < 4; row++) for (let col = 0; col < 10; col++) {
        const chips = Array.from({ length: 11 }, () => ({ x: 6 + r() * 66, y: 6 + r() * 66, s: 2 + r() * 5, color: 2 + Math.floor(r() * 5) }));
        items.push({ kind: "rect", x: col * 80 + 2, y: row * 80 + 2, w: 76, h: 76, rx: 4, color: r() < 0.5 ? 0 : 1, rot: rot(), chips });
      }
      return { palette, shapes: ranked(items, (s) => s.x ?? 0, (s) => s.y ?? 0) };
    }
  }
}

const SCENES: Partial<Record<SceneId, Scene>> = {};
const sceneFor = (id: SceneId): Scene => (SCENES[id] ??= buildScene(id));

function TileSceneBase({ scene, className, children }: { scene: SceneId; className?: string; children?: ReactNode }) {
  const uid = useId().replace(/:/g, "");
  const data = useMemo(() => sceneFor(scene), [scene]);

  return (
    <svg className={`tile-scene ${className ?? ""}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        {data.palette.map((c, i) => (
          <linearGradient key={i} id={`${uid}-g${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={mix(c, 255, 0.22)} />
            <stop offset="0.55" stopColor={c} />
            <stop offset="1" stopColor={mix(c, 0, 0.18)} />
          </linearGradient>
        ))}
        <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill={GROUT} />

      {data.shapes.map((s, i) => {
        const style = { "--i": s.rank, "--r": `${s.rot.toFixed(1)}deg` } as CSSProperties;
        const fill = `url(#${uid}-g${s.color})`;
        const common = s.kind === "rect" ? { x: s.x, y: s.y, width: s.w, height: s.h, rx: s.rx } : { points: s.points };
        const Shape = s.kind === "rect" ? "rect" : "polygon";
        return (
          <g key={i} className="t" style={style}>
            <Shape {...common} transform="translate(0 2.2)" fill="rgba(70,45,20,0.28)" />
            <Shape {...common} fill={fill} stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
            {s.grain?.map(([gx, gy, gl], k) => (
              <line key={k} x1={(s.x ?? 0) + gx} y1={(s.y ?? 0) + gy} x2={(s.x ?? 0) + Math.min(gx + gl, (s.w ?? 0) - 4)} y2={(s.y ?? 0) + gy + 0.6} stroke="rgba(60,30,10,0.22)" strokeWidth="1" strokeLinecap="round" />
            ))}
            {s.chips?.map((c, k) => (
              <rect key={k} x={(s.x ?? 0) + c.x} y={(s.y ?? 0) + c.y} width={c.s * 1.4} height={c.s} rx="1" transform={`rotate(${(k * 47) % 90} ${(s.x ?? 0) + c.x} ${(s.y ?? 0) + c.y})`} fill={data.palette[c.color]} opacity="0.9" />
            ))}
            <Shape {...common} fill={`url(#${uid}-shine)`} />
          </g>
        );
      })}

      {/* A slow glint passing over the finished floor. */}
      <rect className="tile-sweep" x="-260" y="0" width="260" height={H} fill={`url(#${uid}-sweep)`} transform="skewX(-18)" />
      {children}
    </svg>
  );
}

export const TileScene = memo(TileSceneBase);
