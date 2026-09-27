import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt?: string;
  afterAlt?: string;
}

/**
 * Accessible before/after comparison. The slider handle is a real
 * `<input type="range">` (keyboard + screen-reader friendly by default);
 * the visual overlay is purely decorative and driven by its value, so
 * mouse/touch dragging on the image itself also updates that same input.
 *
 * On mount, the reveal sweeps once from fully "before" to the 50/50 split —
 * a small, honest flourish (it's the same real images either way) that
 * draws the eye to the actual result rather than a static, static-looking
 * comparison.
 */
export function BeforeAfterSlider({ beforeSrc, afterSrc, beforeAlt = "Before", afterAlt = "After" }: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(100);
  const [hasInteracted, setHasInteracted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPosition(50));
    return () => cancelAnimationFrame(id);
  }, []);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  return (
    <div className="select-none">
      <div
        ref={containerRef}
        className="relative aspect-[4/3] w-full touch-none overflow-hidden rounded-2xl bg-stone-100"
        onPointerDown={(e) => {
          draggingRef.current = true;
          setHasInteracted(true);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          updateFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) updateFromClientX(e.clientX);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
      >
        <motion.img
          src={afterSrc}
          alt={afterAlt}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <div
          className="absolute inset-0 h-full w-full transition-[clip-path] duration-[1200ms] ease-out"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img src={beforeSrc} alt={beforeAlt} className="h-full w-full object-cover" draggable={false} />
        </div>

        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          Before
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          After
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow transition-[left] duration-[1200ms] ease-out"
          style={{ left: `${position}%` }}
        >
          {/* Static centering on the outer div (Tailwind translate classes); the inner motion.div only
              scales, so it never fights framer-motion's own transform composition with the CSS classes. */}
          <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg"
              animate={!hasInteracted ? { scale: [1, 1.12, 1] } : undefined}
              transition={!hasInteracted ? { delay: 1.4, duration: 1, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" } : undefined}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 5l-6 7 6 7M16 5l6 7-6 7" stroke="#1c1917" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          </div>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Comparison slider position</span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => {
            setHasInteracted(true);
            setPosition(Number(e.target.value));
          }}
          className="w-full accent-stone-900"
          aria-label="Drag to compare the before and after images"
        />
      </label>
    </div>
  );
}
