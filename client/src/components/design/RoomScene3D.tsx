import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Tile } from "@/api/types";
import type { FaceRole, SceneKind } from "@/lib/roomTemplates";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { cn } from "@/lib/cn";

/** What a face of the box shows: kept as in the photo, switched on but no tile yet, or tiled with a real tile photo. */
export type FaceState = "keep" | "empty" | "tiled";

export interface SceneFace {
  role: FaceRole;
  /** Short label drawn on the picture (e.g. "C1", "Floor"). */
  tag: string;
  /** Full name, used for the accessible label. */
  label: string;
  state: FaceState;
  tile?: Tile | null;
  onClick?: () => void;
}

interface Props {
  scene: Exclude<SceneKind, "none">;
  faces: SceneFace[];
  /** Static preview for the template cards: soft colours, no tiles, no clicks. */
  preview?: boolean;
  className?: string;
}

// The scene is drawn in a fixed 360 x 270 stage and scaled down to fit its container, so the CSS 3D numbers never change.
const STAGE_W = 360;
const STAGE_H = 270;
const W = 230; // room width (box)
const H = 150; // wall height
const D = 190; // room depth (box)
const WC = 165; // wall length (corner)
const S2 = Math.SQRT2;

interface Geometry {
  size: [number, number];
  transform: string;
  /** Tile cell size in px for the texture. */
  cell: number;
  /** Approximate centre of the face on the stage, for its label (percent). */
  label: [number, number];
}

const BOX: Partial<Record<FaceRole, Geometry>> = {
  back: { size: [W, H], transform: `translateZ(${-D / 2}px)`, cell: 30, label: [50, 30] },
  left: { size: [D, H], transform: `translateX(${-W / 2}px) rotateY(90deg)`, cell: 30, label: [17, 46] },
  right: { size: [D, H], transform: `translateX(${W / 2}px) rotateY(-90deg)`, cell: 30, label: [83, 46] },
  floor: { size: [W, D], transform: `translateY(${H / 2}px) rotateX(90deg)`, cell: 34, label: [50, 83] },
};

// Kitchen: the same box, plus a backsplash band on the back wall just above the counter.
const BACKSPLASH: Geometry = { size: [W, H * 0.24], transform: `translate3d(0px, ${H * 0.04}px, ${-D / 2 + 1}px)`, cell: 22, label: [50, 49] };

const CORNER: Partial<Record<FaceRole, Geometry>> = {
  left: { size: [WC, H], transform: `translate3d(${-WC / (2 * S2)}px, 0px, ${WC / (2 * S2)}px) rotateY(45deg)`, cell: 30, label: [27, 41] },
  right: { size: [WC, H], transform: `translate3d(${WC / (2 * S2)}px, 0px, ${WC / (2 * S2)}px) rotateY(-45deg)`, cell: 30, label: [73, 41] },
  floor: { size: [WC, WC], transform: `translate3d(0px, ${H / 2}px, ${WC / S2}px) rotateX(90deg) rotateZ(45deg)`, cell: 34, label: [50, 86] },
};

const SHADE: Record<FaceRole, string> = {
  left: "linear-gradient(90deg, rgba(0,0,0,.30), rgba(0,0,0,.04))",
  right: "linear-gradient(270deg, rgba(0,0,0,.22), rgba(0,0,0,.03))",
  back: "linear-gradient(180deg, rgba(255,255,255,.10), rgba(0,0,0,.10))",
  floor: "linear-gradient(180deg, rgba(0,0,0,.20), rgba(255,255,255,.14))",
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

/**
 * A CAD-style 3D room box built from CSS 3D transforms. Every face is one surface of the room; a tiled face
 * is textured with the real tile photo (with grout lines), a switched-on face without a tile is hatched in
 * the accent colour, and a kept face is hatched grey. Click a face to choose its tile.
 */
export function RoomScene3D({ scene, faces, preview = false, className }: Props) {
  const [wrapRef, scale] = useFitScale();
  const geometry = scene === "corner" ? CORNER : BOX;
  const byRole = new Map(faces.map((f) => [f.role, f]));
  const kitchen = scene === "kitchen";

  const entries = (Object.keys(SHADE) as FaceRole[])
    .map((role) => {
      const geo = role === "backsplash" ? (kitchen ? BACKSPLASH : undefined) : geometry[role];
      return geo ? { role, geo, face: byRole.get(role) } : null;
    })
    .filter((e): e is { role: FaceRole; geo: Geometry; face: SceneFace | undefined } => e !== null);

  const group =
    scene === "corner"
      ? `translate3d(0px, -8px, ${-WC * 0.5}px) rotateX(-16deg)`
      : `translate3d(0px, 10px, 0px) rotateX(-15deg) rotateY(-9deg)`;

  return (
    <div ref={wrapRef} className={cn("relative mx-auto w-full", className)} style={{ maxWidth: STAGE_W, height: STAGE_H * scale }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, perspective: "780px", perspectiveOrigin: "50% 36%" }}
      >
        <div className="absolute" style={{ left: "50%", top: "46%", width: 0, height: 0, transformStyle: "preserve-3d", transform: group }}>
          {kitchen && (
            <>
              {/* Counter (decorative): a worktop slab and its cabinet front along the back wall. */}
              <div
                aria-hidden="true"
                className="absolute"
                style={{ left: -W / 2, top: -(H * 0.34) / 2, width: W, height: H * 0.34, background: "linear-gradient(180deg,#8a8580,#6b6661)", transform: `translate3d(0px, ${H * 0.33}px, ${-D / 2 + D * 0.3}px)`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.45)" }}
              />
              <div
                aria-hidden="true"
                className="absolute"
                style={{ left: -W / 2, top: -(D * 0.3) / 2, width: W, height: D * 0.3, background: "linear-gradient(180deg,#a8a29e,#8e8984)", transform: `translate3d(0px, ${H * 0.16}px, ${-D / 2 + D * 0.15}px) rotateX(90deg)`, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.4)" }}
              />
            </>
          )}
          {entries.map(({ role, geo, face }) => {
            const live: SceneFace = face ?? { role, tag: "", label: role, state: "keep" };
            const interactive = !preview && Boolean(face?.onClick);
            return (
              <div
                key={role}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? `${live.label}: ${live.state === "keep" ? "kept as in the photo" : live.state === "empty" ? "needs a tile" : "tiled"}. Click to choose its tile.` : undefined}
                onClick={interactive ? face?.onClick : undefined}
                onKeyDown={interactive ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), face?.onClick?.()) : undefined}
                className={cn("absolute", interactive && "cursor-pointer transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500")}
                style={{
                  left: -geo.size[0] / 2,
                  top: -geo.size[1] / 2,
                  width: geo.size[0],
                  height: geo.size[1],
                  transform: geo.transform,
                  boxShadow: "inset 0 0 0 1.5px rgba(28,25,23,.75)",
                  ...faceBackground(live, geo.cell, preview),
                }}
              >
                <div className="absolute inset-0" style={{ background: SHADE[role], pointerEvents: "none" }} />
              </div>
            );
          })}
        </div>

        {!preview &&
          entries.map(({ role, geo, face }) =>
            face ? (
              <span
                key={role}
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow",
                  face.state === "keep" ? "bg-white/90 text-stone-500 ring-1 ring-stone-300" : "bg-stone-900/90 text-white",
                )}
                style={{ left: `${geo.label[0]}%`, top: `${geo.label[1]}%` }}
              >
                {face.tag}
                {face.state === "keep" ? " · keep" : ""}
              </span>
            ) : null,
          )}
      </div>
    </div>
  );
}
