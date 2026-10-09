import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

const OPEN_MS = 850;

/**
 * Stage C of the arrival sequence: a pair of architectural doors part to
 * reveal the homepage behind them, standing in for "arriving at and
 * entering the bungalow." Plays once, automatically, right after
 * PromoBanner finishes — it is a transition, not an extra waiting stage.
 * The homepage underneath is already fully mounted when this starts; the
 * doors only need to move out of the way.
 */
export function DoorReveal({ onComplete }: { onComplete: () => void }) {
  const firedRef = useRef(false);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) {
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete();
      }
      return;
    }
    const timer = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete();
      }
    }, OPEN_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reducedMotion) return null;

  const panel = (side: "left" | "right") => (
    <motion.div
      className="absolute inset-y-0 w-1/2"
      style={{
        [side]: 0,
        transformOrigin: side === "left" ? "right center" : "left center",
        transformStyle: "preserve-3d",
      }}
      initial={{ x: 0, rotateY: 0 }}
      animate={{ x: side === "left" ? "-102%" : "102%", rotateY: side === "left" ? -12 : 12 }}
      transition={{ duration: OPEN_MS / 1000, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="relative h-full w-full overflow-hidden">
        {/* Warm wood-toned door face with restrained panel molding */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #A98F5E 0%, #718575 45%, #44574B 100%)",
          }}
        />
        <div
          className={`absolute inset-y-10 ${side === "left" ? "right-6 left-10" : "left-6 right-10"} rounded-sm border-2 border-champagne-200/25`}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/15" />
        {/* The edge at the seam reads as the door casting a shadow into the room */}
        <div
          className={`absolute inset-y-0 w-16 ${
            side === "left" ? "right-0 bg-gradient-to-l" : "left-0 bg-gradient-to-r"
          } from-black/35 to-transparent`}
        />
        {/* Handle, set near the central seam */}
        <div
          className={`absolute top-1/2 h-14 w-2 -translate-y-1/2 rounded-full bg-champagne-100/80 shadow-[0_0_10px_rgba(0,0,0,0.25)] ${
            side === "left" ? "right-4" : "left-4"
          }`}
        />
      </div>
    </motion.div>
  );

  return (
    <motion.div
      key="door-reveal"
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{ perspective: 1600 }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      aria-hidden="true"
    >
      {/* Soft ambient daylight already filling the room behind the doors */}
      <div className="absolute inset-0 bg-champagne-100" />

      {/* Warm daylight spill that blooms outward as the seam opens */}
      <motion.div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full blur-2xl"
        style={{ background: "radial-gradient(closest-side, rgba(255,250,235,0.95), rgba(255,250,235,0) 70%)" }}
        initial={{ opacity: 0.95, width: 6 }}
        animate={{ opacity: 0, width: 480 }}
        transition={{ duration: OPEN_MS / 1000, ease: "easeOut" }}
      />

      {panel("left")}
      {panel("right")}
    </motion.div>
  );
}
