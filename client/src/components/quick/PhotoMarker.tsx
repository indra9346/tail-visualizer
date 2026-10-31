import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import { cloneMask, emptyMask, paintSegment, type AreaMask } from "@/lib/areaMask";
import { drawMarks, drawQuickLook, type QuickLookLayer } from "@/lib/quickLook";
import { chosen, isMarked, type QuickArea } from "@/lib/quickDesign";
import type { LoadedPhoto } from "@/lib/useRoomPhoto";

/** Add: a tap fills a surface, a drag paints. Remove: a tap clears a surface, a drag rubs paint away. */
export type MarkTool = "add" | "remove";

/** Finger movement (screen px) before a touch counts as painting rather than a tap. */
const DRAG_PX = 6;

interface Props {
  photoUrl: string;
  photo: LoadedPhoto | null;
  areas: QuickArea[];
  activeKey: string | null;
  /** "mark": the owner paints; the paint colours are shown. "look": the quick look with the chosen tiles (no painting). */
  mode: "mark" | "look";
  tool: MarkTool;
  /** Brush radius in grid cells. */
  brush: number;
  /** Loaded tile photos by tile id, for the quick look. */
  tileImages: Map<string, HTMLImageElement>;
  /** A tap (not a drag), in grid cells. */
  onTap: (x: number, y: number) => void;
  /** A finished brush or eraser stroke: the new mask of every area it changed. */
  onStroke: (next: Map<string, AreaMask | null>) => void;
  className?: string;
}

/**
 * The room photo the owner marks. A tap fills (or clears) a surface; a drag paints (or rubs away). Paint never
 * overlaps: painting an area takes those spots away from any other area, and rubbing away clears every colour under it.
 */
export function PhotoMarker({ photoUrl, photo, areas, activeKey, mode, tool, brush, tileImages, onTap, onStroke, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stroke = useRef<{ masks: Map<string, AreaMask | null>; x: number; y: number } | null>(null);
  // A touch that has not moved far enough to be a drag yet; and whether the click after a drag must be ignored.
  const pending = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const skipClick = useRef(false);
  const [painting, setPainting] = useState(false);
  const ratio = photo ? photo.width / photo.height : 4 / 3;
  const grid = photo?.grid ?? null;
  const activeIndex = areas.findIndex((a) => a.key === activeKey);

  // The quick-look canvas matches the photo's size on screen (sharp on phones, capped for speed).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function redrawMarks(masks?: Map<string, AreaMask | null>) {
    const canvas = marksRef.current;
    if (!canvas || !grid) return;
    if (canvas.width !== grid.width) canvas.width = grid.width;
    if (canvas.height !== grid.height) canvas.height = grid.height;
    const list = areas
      .map((a, i) => ({ mask: masks?.has(a.key) ? masks.get(a.key)! : a.mask, colourIndex: i, active: a.key === activeKey }))
      .filter((m): m is { mask: AreaMask; colourIndex: number; active: boolean } => m.mask !== null)
      // In the quick look only the areas that still have no tile show their paint.
      .filter((m) => mode === "mark" || chosen(areas[m.colourIndex]!).length === 0 || !tileImages.has(chosen(areas[m.colourIndex]!)[0]!.id));
    drawMarks(canvas, list);
  }

  useEffect(() => {
    redrawMarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas, activeKey, grid, mode, tileImages]);

  useEffect(() => {
    const canvas = lookRef.current;
    if (!canvas || !photo || mode !== "look" || size.w === 0) return;
    const scale = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = Math.min(1600, Math.round(size.w * scale));
    canvas.height = Math.round(canvas.width / ratio);
    const layers: QuickLookLayer[] = areas
      .filter((a) => isMarked(a))
      .map((a) => ({
        mask: a.mask!,
        surface: a.surface,
        pattern: a.pattern,
        tiles: chosen(a).flatMap((t) => {
          const image = tileImages.get(t.id);
          return image ? [{ image, sizeMm: t.sizeMm }] : [];
        }),
      }))
      .filter((l) => l.tiles.length > 0);
    drawQuickLook(canvas, layers, photo.lab ? { lab: photo.lab, width: photo.grid.width, height: photo.grid.height } : null);
  }, [areas, photo, mode, size.w, ratio, tileImages]);

  const toGrid = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: ((clientX - rect.left) / Math.max(1, rect.width)) * grid!.width, y: ((clientY - rect.top) / Math.max(1, rect.height)) * grid!.height };
  };

  /** Paints one segment of the stroke into the working copies. */
  function paintTo(x: number, y: number) {
    const s = stroke.current;
    if (!s || !grid) return;
    if (tool === "remove") {
      for (const area of areas) {
        const working = s.masks.get(area.key) ?? (area.mask ? cloneMask(area.mask) : null);
        if (!working) continue;
        paintSegment(working, s.x, s.y, x, y, brush, 0);
        s.masks.set(area.key, working);
      }
    } else if (activeKey) {
      const active = areas.find((a) => a.key === activeKey);
      if (!active) return;
      const mine = s.masks.get(active.key) ?? (active.mask ? cloneMask(active.mask) : emptyMask(grid.width, grid.height));
      paintSegment(mine, s.x, s.y, x, y, brush, 1);
      s.masks.set(active.key, mine);
      // The same spots are taken away from every other area.
      for (const other of areas) {
        if (other.key === active.key) continue;
        const theirs = s.masks.get(other.key) ?? (other.mask ? cloneMask(other.mask) : null);
        if (!theirs) continue;
        paintSegment(theirs, s.x, s.y, x, y, brush, 0);
        s.masks.set(other.key, theirs);
      }
    }
    s.x = x;
    s.y = y;
    redrawMarks(s.masks);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // A touch drag sends no click afterwards, so a click skip left over from it must not swallow this new tap.
    skipClick.current = false;
    if (mode !== "mark" || !grid || (tool === "add" && activeIndex === -1)) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toGrid(e.clientX, e.clientY);
    pending.current = { ...p, clientX: e.clientX, clientY: e.clientY };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = pending.current;
    if (start && !stroke.current) {
      // Still a tap until the finger really moves.
      if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < DRAG_PX) return;
      e.preventDefault();
      stroke.current = { masks: new Map(), x: start.x, y: start.y };
      setPainting(true);
      paintTo(start.x, start.y);
    }
    if (!stroke.current) return;
    const p = toGrid(e.clientX, e.clientY);
    paintTo(p.x, p.y);
  }

  function endStroke() {
    const s = stroke.current;
    pending.current = null;
    stroke.current = null;
    if (!s) return;
    setPainting(false);
    // The browser still sends a click after a drag: it must not also fill.
    skipClick.current = true;
    if (s.masks.size > 0) onStroke(s.masks);
  }

  return (
    <div className={cn("mx-auto w-full", className)} style={{ maxWidth: `min(100%, calc(var(--photo-vh, 62vh) * ${ratio}))` }}>
      <div
        ref={wrapRef}
        data-testid="photo-marker"
        className={cn(
          "relative w-full select-none overflow-hidden rounded-2xl bg-stone-200 shadow-inner",
          mode === "mark" && grid && "cursor-crosshair",
          // A finger on the photo paints instead of scrolling the page while marking.
          mode === "mark" ? "touch-none" : "touch-manipulation",
        )}
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onClick={(e) => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          if (mode !== "mark" || !grid) return;
          const p = toGrid(e.clientX, e.clientY);
          onTap(p.x, p.y);
        }}
      >
        <img src={photoUrl} alt="Your room photo" className="pointer-events-none absolute inset-0 h-full w-full object-cover" draggable={false} />
        <canvas ref={lookRef} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full", mode !== "look" && "hidden")} />
        <canvas ref={marksRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
        {!photo && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-900/20">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/60 border-t-white" aria-label="Loading your photo" />
          </div>
        )}
        {painting && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-stone-900/80 px-3 py-1 text-xs font-medium text-white">{tool === "remove" ? "Removing…" : "Painting…"}</span>}
      </div>
    </div>
  );
}
