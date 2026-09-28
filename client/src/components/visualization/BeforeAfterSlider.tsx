import { useCallback, useEffect, useRef, useState } from "react";

interface BeforeAfterSliderProps {
  /** Optional. When omitted, the same viewer displays the result image alone. */
  beforeSrc?: string;
  afterSrc: string;
  beforeAlt?: string;
  afterAlt?: string;
}

interface PanOffset {
  x: number;
  y: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clampPan(offset: PanOffset, zoom: number, width: number, height: number): PanOffset {
  const maxX = (width * (zoom - 1)) / 2;
  const maxY = (height * (zoom - 1)) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  };
}

/** Full-image comparison viewer with aligned zoom, pan, and an accessible split control. */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt = "Before",
  afterAlt = "After",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<PanOffset>({ x: 0, y: 0 });
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerModeRef = useRef<"compare" | "pan" | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const showComparison = Boolean(beforeSrc);

  useEffect(() => {
    setPosition(50);
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setAspectRatio(null);
  }, [beforeSrc, afterSrc]);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  const changeZoom = useCallback((nextZoom: number) => {
    const boundedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    setZoom(boundedZoom);
    if (boundedZoom === MIN_ZOOM) {
      setPan({ x: 0, y: 0 });
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setPan((current) => clampPan(current, boundedZoom, rect.width, rect.height));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-zoom-controls]")) return;
    if (!showComparison && zoom === MIN_ZOOM) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    if (zoom > MIN_ZOOM) {
      pointerModeRef.current = "pan";
      dragStartRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      event.preventDefault();
    } else {
      pointerModeRef.current = "compare";
      updateFromClientX(event.clientX);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerModeRef.current === "compare") {
      updateFromClientX(event.clientX);
    } else if (pointerModeRef.current === "pan") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const start = dragStartRef.current;
      setPan(
        clampPan(
          { x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y },
          zoom,
          rect.width,
          rect.height,
        ),
      );
    }
  };

  const endPointerInteraction = () => {
    pointerModeRef.current = null;
  };

  const imageTransform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const imageStyle: React.CSSProperties = {
    transform: imageTransform,
    transformOrigin: "center center",
  };

  return (
    <div className="w-full select-none">
      <div
        ref={containerRef}
        className={`relative mx-auto w-full overflow-hidden rounded-2xl bg-stone-100 ${
          zoom > MIN_ZOOM ? "cursor-grab touch-none active:cursor-grabbing" : showComparison ? "cursor-col-resize touch-none" : ""
        }`}
        style={{ aspectRatio: aspectRatio ? String(aspectRatio) : "4 / 3", maxHeight: "calc(100dvh - 230px)" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerInteraction}
        onPointerCancel={endPointerInteraction}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        }}
      >
        <img
          src={afterSrc}
          alt={afterAlt}
          className="absolute inset-0 h-full w-full object-contain"
          style={imageStyle}
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth && image.naturalHeight) setAspectRatio(image.naturalWidth / image.naturalHeight);
          }}
        />

        {beforeSrc && (
          <div
            className="absolute inset-0 h-full w-full"
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          >
            <img
              src={beforeSrc}
              alt={beforeAlt}
              className="h-full w-full object-contain"
              style={imageStyle}
              draggable={false}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth && image.naturalHeight) setAspectRatio(image.naturalWidth / image.naturalHeight);
              }}
            />
          </div>
        )}

        {beforeSrc ? (
          <>
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              Before
            </div>
            <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              After
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
              style={{ left: `${position}%` }}
            >
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M8 5l-6 7 6 7M16 5l6 7-6 7" stroke="#1c1917" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
            Visualization
          </div>
        )}

        <div
          data-zoom-controls
          className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-xl border border-white/15 bg-stone-950/75 p-1 text-white shadow-lg backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => changeZoom(zoom - ZOOM_STEP)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <span className="min-w-12 text-center text-xs font-semibold tabular-nums" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => changeZoom(zoom + ZOOM_STEP)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            +
          </button>
          <span className="mx-0.5 h-6 w-px bg-white/25" aria-hidden="true" />
          <button
            type="button"
            aria-label="Reset zoom to 100%"
            title="Reset zoom to 100%"
            disabled={zoom === MIN_ZOOM}
            onClick={() => changeZoom(MIN_ZOOM)}
            className="rounded-lg px-2.5 py-2 text-xs font-medium transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>

      {showComparison && (
        <label className="mt-4 block">
          <span className="sr-only">Comparison slider position</span>
          <input
            type="range"
            min={0}
            max={100}
            value={position}
            onChange={(event) => setPosition(Number(event.target.value))}
            className="w-full accent-stone-900"
            aria-label="Drag to compare the before and after images"
          />
        </label>
      )}
    </div>
  );
}
