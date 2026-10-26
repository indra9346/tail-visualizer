import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import { cloneMask, emptyMask, paintSegment, type AreaMask } from "@/lib/areaMask";
import { drawMarks, drawQuickLook, type QuickLookLayer } from "@/lib/quickLook";
import { chosen, isMarked, type QuickArea } from "@/lib/quickDesign";
import type { LoadedPhoto } from "@/lib/useRoomPhoto";

export type MarkTool = "fill" | "paint" | "erase";

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
  /** A tap with the fill tool, in grid cells. */
  onTap: (x: number, y: number) => void;
  /** A finished brush or eraser stroke: the new mask of every area it changed. */
  onStroke: (next: Map<string, AreaMask | null>) => void;
  className?: string;
}

/**
 * The room photo the owner marks. Tap to fill a surface, drag to paint or erase. Paint never overlaps: painting an
 * area takes those spots away from any other area, and the eraser clears every colour under it.
 */
export function PhotoMarker({ photoUrl, photo, areas, activeKey, mode, tool, brush, tileImages, onTap, onStroke, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const marksRef = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stroke = useRef<{ masks: Map<string, AreaMask | null>; x: number; y: number } | null>(null);
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
    if (tool === "erase") {
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
    if (mode !== "mark" || !grid || tool === "fill" || (tool === "paint" && activeIndex === -1)) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = toGrid(e.clientX, e.clientY);
    stroke.current = { masks: new Map(), x: p.x, y: p.y };
    setPainting(true);
    paintTo(p.x, p.y);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!stroke.current) return;
    const p = toGrid(e.clientX, e.clientY);
    paintTo(p.x, p.y);
  }

  function endStroke() {
    const s = stroke.current;
    stroke.current = null;
    setPainting(false);
    if (s && s.masks.size > 0) onStroke(s.masks);
  }

  return (
    <div className={cn("mx-auto w-full", className)} style={{ maxWidth: `min(100%, calc(var(--photo-vh, 62vh) * ${ratio}))` }}>
      <div
        ref={wrapRef}
        data-testid="photo-marker"
        className={cn(
          "relative w-full select-none overflow-hidden rounded-2xl bg-stone-200 shadow-inner",
          mode === "mark" && grid && (tool === "fill" ? "cursor-crosshair" : "cursor-cell"),
          // Brush strokes must not scroll the page; a tap to fill still lets the page scroll.
          mode === "mark" && tool !== "fill" ? "touch-none" : "touch-manipulation",
        )}
        style={{ aspectRatio: String(ratio) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onClick={(e) => {
          if (mode !== "mark" || tool !== "fill" || !grid) return;
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
        {painting && <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-stone-900/80 px-3 py-1 text-xs font-medium text-white">{tool === "erase" ? "Erasing…" : "Painting…"}</span>}
      </div>
    </div>
  );
}
