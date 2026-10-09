import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import { motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/cn";

/** Real tile and wall photographs kept in client/public/images/walls. */
export const WALL_IMAGES = {
  stoneMosaic: "/images/walls/stone-mosaic.jpg",
  sandstone: "/images/walls/sandstone.jpg",
  facade: "/images/walls/facade-grey.jpg",
  brick: "/images/walls/brick-beige.jpg",
  herringbone: "/images/walls/herringbone-green.jpg",
  diamondFloor: "/images/walls/diamond-floor.jpg",
  entrance: "/images/walls/entrance.jpg",
  livingFloor: "/images/walls/living-floor.jpg",
} as const;

/**
 * Hero backdrop that reads as a real room: a tiled wall that drifts slightly as you scroll,
 * a skirting line, and a perspective tile floor that slowly glides toward the viewer.
 * Sits behind the page content; the content keeps its own light panels for readability.
 */
export function HeroRoom() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const wallY = useTransform(scrollY, [0, 700], [0, reduce ? 0 : 70]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Wall of real stone tiles */}
      <motion.div
        style={{ y: wallY, backgroundImage: `url(${WALL_IMAGES.stoneMosaic})` }}
        className="absolute inset-x-0 -top-20 bottom-[20%] bg-[length:230px] bg-repeat"
      />
      <div className="absolute inset-x-0 top-0 bottom-[20%] bg-gradient-to-b from-[#F3F6F1]/80 via-[#F3F6F1]/60 to-[#F3F6F1]/25" />
      {/* Light falling across the wall */}
      <div className="room-light absolute inset-x-0 top-0 bottom-[20%]" />

      {/* Skirting */}
      <div className="absolute inset-x-0 bottom-[20%] h-3 bg-gradient-to-b from-white to-stone-300 shadow-[0_6px_14px_rgba(40,25,10,0.25)]" />

      {/* Floor in perspective */}
      <div className="absolute inset-x-0 bottom-0 h-[20%] overflow-hidden [perspective:520px]">
        <div
          className="room-floor absolute -left-1/2 h-[320%] w-[200%]"
          style={{ backgroundImage: `url(${WALL_IMAGES.diamondFloor})`, transform: "rotateX(64deg)", transformOrigin: "50% 0%" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-white/30" />
      </div>
    </div>
  );
}

/**
 * A photograph laid out as individual tiles with grout between them. The tiles drop onto the wall one by one
 * (each swings in from the top edge) when it scrolls into view, then the whole wall leans gently toward the pointer.
 */
export function TileWall({
  src,
  cols = 8,
  rows = 4,
  aspect,
  className,
  children,
}: {
  src: string;
  cols?: number;
  rows?: number;
  aspect?: string;
  className?: string;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // One observer on the whole wall (not one per tile): flattened, rotated tiles make unreliable observer targets.
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const rx = useSpring(useMotionValue(0), { stiffness: 90, damping: 16 });
  const ry = useSpring(useMotionValue(0), { stiffness: 90, damping: 16 });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (reduce || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    ry.set(((e.clientX - b.left) / b.width - 0.5) * 7);
    rx.set(-((e.clientY - b.top) / b.height - 0.5) * 5);
  }
  function onLeave() {
    rx.set(0);
    ry.set(0);
  }

  const cells = Array.from({ length: cols * rows }, (_, i) => ({ c: i % cols, r: Math.floor(i / cols) }));

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={cn("relative [perspective:1400px]", className)} style={aspect ? { aspectRatio: aspect } : undefined}>
      <motion.div
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
        className="grid h-full w-full gap-[3px] overflow-hidden rounded-2xl bg-[#cfc6b8] p-[3px] shadow-[0_30px_60px_-20px_rgba(40,25,10,0.5)]"
      >
        {cells.map(({ c, r }) => (
          <motion.div
            key={`${r}-${c}`}
            initial={reduce ? false : { opacity: 0, rotateX: -85, y: -28, scale: 0.92 }}
            animate={inView || reduce ? { opacity: 1, rotateX: 0, y: 0, scale: 1 } : undefined}
            transition={{ type: "spring", stiffness: 130, damping: 13, delay: (r * 0.5 + c) * 0.06 }}
            style={{
              transformOrigin: "50% 0%",
              backgroundImage: `url(${src})`,
              backgroundSize: `${cols * 100}% ${rows * 100}%`,
              backgroundPosition: `${cols > 1 ? (c / (cols - 1)) * 100 : 50}% ${rows > 1 ? (r / (rows - 1)) * 100 : 50}%`,
            }}
            className="relative rounded-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-3px_4px_rgba(0,0,0,0.22),0_2px_3px_rgba(0,0,0,0.25)]"
          >
            <span className="tile-gloss absolute inset-0 rounded-[3px]" />
          </motion.div>
        ))}
      </motion.div>
      {children}
    </div>
  );
}

/** A card that leans toward the pointer in 3D with a moving highlight, like a tile sample held in your hand. */
export function TiltCard({ children, className, max = 9 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const [t, setT] = useState({ rx: 0, ry: 0, gx: 50, gy: 50, on: false });

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const b = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width;
    const py = (e.clientY - b.top) / b.height;
    setT({ rx: -(py - 0.5) * 2 * max, ry: (px - 0.5) * 2 * max, gx: px * 100, gy: py * 100, on: true });
  }

  return (
    <div className={cn("[perspective:1000px]", className)}>
      <div
        onPointerMove={onMove}
        onPointerLeave={() => setT({ rx: 0, ry: 0, gx: 50, gy: 50, on: false })}
        style={{ transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg) translateZ(0)`, transformStyle: "preserve-3d" }}
        className="relative h-full overflow-hidden rounded-2xl shadow-[0_18px_40px_-18px_rgba(40,25,10,0.55)] transition-transform duration-150 ease-out will-change-transform"
      >
        {children}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-200"
          style={{ opacity: t.on ? 1 : 0, background: `radial-gradient(circle at ${t.gx}% ${t.gy}%, rgba(255,255,255,0.38), transparent 55%)` }}
        />
      </div>
    </div>
  );
}
