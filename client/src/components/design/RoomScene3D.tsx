import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Tile } from "@/api/types";
import type { FaceRole, SceneKind } from "@/lib/roomTemplates";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { cn } from "@/lib/cn";

/** What a face of the box shows: kept as in the photo, switched on but no tile yet, or tiled with a real tile photo. */
export type FaceState = "keep" | "empty" | "tiled";

export interface SceneFace {
  role: FaceRole;
  /** Short label drawn on the face (e.g. "C1", "Floor"). */
  tag: string;
  /** Full name, used for the accessible label. */
  label: string;
  state: FaceState;
  tile?: Tile | null;
  /** The face currently being edited. */
  selected?: boolean;
  onClick?: () => void;
}

interface Props {
  scene: Exclude<SceneKind, "none">;
  faces: SceneFace[];
  /** Static preview for the template cards: soft colours, no tiles, no clicks, no controls. */
  preview?: boolean;
  className?: string;
}

// The scene is drawn in a fixed 360 x 280 stage and scaled down to fit its container, so the CSS 3D numbers never change.
const STAGE_W = 360;
const STAGE_H = 280;
const W = 230; // room width (box)
const H = 150; // wall height
const D = 170; // room depth (box)
const WC = 165; // wall length (corner)
const S2 = Math.SQRT2;

interface Geometry {
  size: [number, number];
  transform: string;
  /** Tile cell size in px for the texture. */
  cell: number;
}

const BOX: Partial<Record<FaceRole, Geometry>> = {
  back: { size: [W, H], transform: `translateZ(${-D / 2}px)`, cell: 30 },
  left: { size: [D, H], transform: `translateX(${-W / 2}px) rotateY(90deg)`, cell: 30 },
  right: { size: [D, H], transform: `translateX(${W / 2}px) rotateY(-90deg)`, cell: 30 },
  floor: { size: [W, D], transform: `translateY(${H / 2}px) rotateX(90deg)`, cell: 34 },
};

// Kitchen: the same box, plus a backsplash band on the back wall just above the counter.
const BACKSPLASH: Geometry = { size: [W, H * 0.24], transform: `translate3d(0px, ${H * 0.04}px, ${-D / 2 + 1}px)`, cell: 22 };

const CORNER: Partial<Record<FaceRole, Geometry>> = {
  left: { size: [WC, H], transform: `translate3d(${-WC / (2 * S2)}px, 0px, ${WC / (2 * S2)}px) rotateY(45deg)`, cell: 30 },
  right: { size: [WC, H], transform: `translate3d(${WC / (2 * S2)}px, 0px, ${WC / (2 * S2)}px) rotateY(-45deg)`, cell: 30 },
  floor: { size: [WC, WC], transform: `translate3d(0px, ${H / 2}px, ${WC / S2}px) rotateX(90deg) rotateZ(45deg)`, cell: 34 },
};

const SHADE: Record<FaceRole, string> = {
  left: "linear-gradient(90deg, rgba(0,0,0,.26), rgba(0,0,0,.03))",
  right: "linear-gradient(270deg, rgba(0,0,0,.20), rgba(0,0,0,.03))",
  back: "linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.10))",
  floor: "linear-gradient(180deg, rgba(0,0,0,.18), rgba(255,255,255,.12))",
  backsplash: "linear-gradient(180deg, rgba(255,255,255,.12), rgba(0,0,0,.12))",
};

const PREVIEW_COLOR: Record<FaceRole, string> = {
  left: "#d9c2a7",
  right: "#e6d3bb",
  back: "#efe0cc",
  floor: "#b8c9c4",
  backsplash: "#c9a27a",
};

const GROUT = "rgba(255,255,255,.55)";
const DEFAULT_VIEW = { yaw: 0, pitch: -17 };
// The outer side of a wall is see-through "glass" with a visible edge: from outside you still see the structure, and the inside surfaces behind it.
const OUTSIDE = "rgba(168,162,158,.16)";

function faceBackground(face: SceneFace, cell: number, preview: boolean): CSSProperties {
  if (preview) return { background: PREVIEW_COLOR[face.role] };
  if (face.state === "tiled" && face.tile) {
    return {
      backgroundImage: `linear-gradient(to right, ${GROUT} 1px, transparent 1px), linear-gradient(to bottom, ${GROUT} 1px, transparent 1px), url("${getPublicTileImageUrl(face.tile.storagePath)}")`,
      backgroundSize: `${cell}px ${cell}px, ${cell}px ${cell}px, ${cell}px ${cell}px`,
      backgroundColor: "#e7e5e4",
    };
  }
  if (face.state === "tiled" || face.state === "empty") {
    return { background: "repeating-linear-gradient(45deg, rgba(180,95,60,.30) 0 8px, rgba(180,95,60,.12) 8px 16px)", backgroundColor: "#f5e3d6" };
  }
  return { background: "repeating-linear-gradient(135deg, #ece9e6 0 6px, #d6d3d1 6px 12px)" };
}

/** Scales the fixed-size stage down to the width of its container (never up). */
function useFitScale(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(1, entry.contentRect.width / STAGE_W));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, scale];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A CAD-style 3D room box built from CSS 3D transforms, rotatable through a full 360 degrees: drag it, use the view buttons
 * (see C1, front, see C3, top), the arrow keys, or let it spin. Every face is two-sided (grey outside), so no wall is ever
 * hidden. A tiled face is textured with the real tile photo (with grout lines), a switched-on face without a tile is hatched
 * in the accent colour and a kept face is hatched grey. Click a face to edit it.
 */
export function RoomScene3D({ scene, faces, preview = false, className }: Props) {
  const [wrapRef, scale] = useFitScale();
  const [view, setView] = useState(DEFAULT_VIEW);
  const [smooth, setSmooth] = useState(false);
  const [spin, setSpin] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const movedRef = useRef(0);

  const geometry = scene === "corner" ? CORNER : BOX;
  const byRole = new Map(faces.map((f) => [f.role, f]));
  const kitchen = scene === "kitchen";
  const entries = (Object.keys(SHADE) as FaceRole[])
    .map((role) => {
      const geo = role === "backsplash" ? (kitchen ? BACKSPLASH : undefined) : geometry[role];
      return geo ? { role, geo, face: byRole.get(role) } : null;
    })
    .filter((e): e is { role: FaceRole; geo: Geometry; face: SceneFace | undefined } => e !== null);

  // Automatic turntable: stops as soon as the owner touches the box.
  useEffect(() => {
    if (!spin || preview) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setView((v) => ({ ...v, yaw: v.yaw + dt * 0.03 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spin, preview]);

  const goTo = useCallback((next: { yaw: number; pitch: number }) => {
    setSpin(false);
    setSmooth(true);
    setView(next);
  }, []);
  const rotateBy = (deg: number) => goTo({ yaw: view.yaw + deg, pitch: view.pitch });

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (preview || (e.target as HTMLElement).closest("[data-scene-controls]")) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
    movedRef.current = 0;
    setSpin(false);
    setSmooth(false);
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      d.x = ev.clientX;
      d.y = ev.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      movedRef.current = d.moved;
      setView((v) => ({ yaw: v.yaw + dx * 0.55, pitch: clamp(v.pitch - dy * 0.4, -88, 18) }));
    };
    const up = () => {
      drag.current = null;
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (preview) return;
    if (e.target !== e.currentTarget) return;
    const step = 15;
    if (e.key === "ArrowLeft") (e.preventDefault(), goTo({ yaw: view.yaw - step, pitch: view.pitch }));
    else if (e.key === "ArrowRight") (e.preventDefault(), goTo({ yaw: view.yaw + step, pitch: view.pitch }));
    else if (e.key === "ArrowUp") (e.preventDefault(), goTo({ yaw: view.yaw, pitch: clamp(view.pitch + 10, -88, 18) }));
    else if (e.key === "ArrowDown") (e.preventDefault(), goTo({ yaw: view.yaw, pitch: clamp(view.pitch - 10, -88, 18) }));
    else if (e.key === "Home") (e.preventDefault(), goTo(DEFAULT_VIEW));
  }

  const groupTransform = `translate3d(0px, 6px, 0px) rotateX(${view.pitch}deg) rotateY(${view.yaw}deg) translate3d(0px, 0px, ${scene === "corner" ? -WC * 0.5 : 0}px)`;
  const leftTag = byRole.get("left")?.tag;
  const rightTag = byRole.get("right")?.tag;

  const faceEls = entries.map(({ role, geo, face }) => {
    const live: SceneFace = face ?? { role, tag: "", label: role, state: "keep" };
    const interactive = !preview && Boolean(face?.onClick);
    const base: CSSProperties = { left: -geo.size[0] / 2, top: -geo.size[1] / 2, width: geo.size[0], height: geo.size[1], backfaceVisibility: "hidden" };
    return (
      <Fragment key={role}>
        <div
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-label={interactive ? `${live.label}: ${live.state === "keep" ? "kept as in the photo" : live.state === "empty" ? "needs a tile" : "tiled"}. Click to edit it.` : undefined}
          onClick={interactive ? () => movedRef.current < 6 && face?.onClick?.() : undefined}
          onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), face?.onClick?.()) : undefined}
          className={cn("absolute", interactive && "cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500")}
          style={{
            ...base,
            transform: geo.transform,
            boxShadow: live.selected && !preview ? "inset 0 0 0 4px #c2410c, 0 0 0 1px #c2410c" : "inset 0 0 0 1.5px rgba(28,25,23,.75)",
            ...faceBackground(live, geo.cell, preview),
          }}
        >
          <div className="absolute inset-0" style={{ background: SHADE[role], pointerEvents: "none" }} />
          {!preview && live.tag && (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold shadow",
                live.state === "keep" ? "bg-white/90 text-stone-500 ring-1 ring-stone-300" : "bg-stone-900/90 text-white",
              )}
            >
              {live.tag}
              {live.state === "keep" ? " · keep" : ""}
            </span>
          )}
        </div>
        {/* The outer side of the same wall: seen when the box is turned around, so nothing is ever see-through. */}
        <div aria-hidden="true" className="absolute" style={{ ...base, transform: `${geo.transform} rotateY(180deg)`, background: OUTSIDE, boxShadow: "inset 0 0 0 1.5px rgba(28,25,23,.45)" }} />
      </Fragment>
    );
  });

  return (
    <div className={cn("mx-auto w-full", className)} style={{ maxWidth: STAGE_W }}>
      <div
        ref={wrapRef}
        className={cn("relative w-full touch-none select-none outline-none", !preview && (dragging ? "cursor-grabbing" : "cursor-grab"), !preview && "focus-visible:ring-2 focus-visible:ring-clay-400 rounded-xl")}
        style={{ height: STAGE_H * scale }}
        tabIndex={preview ? undefined : 0}
        aria-label={preview ? undefined : "3D room. Drag to rotate through 360 degrees, or use the arrow keys."}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, perspective: "400px", perspectiveOrigin: "50% 34%" }}>
          <div
            className="absolute"
            style={{
              left: "50%",
              top: "46%",
              width: 0,
              height: 0,
              transformStyle: "preserve-3d",
              transform: groupTransform,
              transition: smooth && !dragging && !spin ? "transform .6s cubic-bezier(.2,.8,.2,1)" : "none",
            }}
          >
            {kitchen && (
              <>
                {/* Counter (decorative): a worktop slab and its cabinet front along the back wall. */}
                <div aria-hidden="true" className="absolute" style={{ left: -W / 2, top: -(H * 0.34) / 2, width: W, height: H * 0.34, background: "linear-gradient(180deg,#8a8580,#6b6661)", transform: `translate3d(0px, ${H * 0.33}px, ${-D / 2 + D * 0.3}px)`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.45)", backfaceVisibility: "hidden" }} />
                <div aria-hidden="true" className="absolute" style={{ left: -W / 2, top: -(D * 0.3) / 2, width: W, height: D * 0.3, background: "linear-gradient(180deg,#a8a29e,#8e8984)", transform: `translate3d(0px, ${H * 0.16}px, ${-D / 2 + D * 0.15}px) rotateX(90deg)`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.4)" }} />
              </>
            )}
            {faceEls}
          </div>
        </div>
      </div>

      {!preview && (
        <div data-scene-controls className="mt-2 flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Rotate the 3D room">
          <ViewButton label="Turn left 90 degrees" onClick={() => rotateBy(-90)}>⟲ 90°</ViewButton>
          <ViewButton label="Front view" onClick={() => goTo(DEFAULT_VIEW)}>Front</ViewButton>
          {leftTag && <ViewButton label={`See the left wall ${leftTag}`} onClick={() => goTo({ yaw: -52, pitch: -14 })}>See {leftTag}</ViewButton>}
          {rightTag && <ViewButton label={`See the right wall ${rightTag}`} onClick={() => goTo({ yaw: 52, pitch: -14 })}>See {rightTag}</ViewButton>}
          <ViewButton label="Top view" onClick={() => goTo({ yaw: 0, pitch: -84 })}>Top</ViewButton>
          <ViewButton label="Turn right 90 degrees" onClick={() => rotateBy(90)}>⟳ 90°</ViewButton>
          <ViewButton label={spin ? "Stop spinning" : "Spin the room"} active={spin} onClick={() => (setSmooth(false), setSpin((s) => !s))}>{spin ? "■ Stop" : "▶ Spin"}</ViewButton>
        </div>
      )}
    </div>
  );
}

function ViewButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors", active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500 hover:bg-stone-50")}
    >
      {children}
    </button>
  );
}
