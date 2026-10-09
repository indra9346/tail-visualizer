import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SDSIcon } from "@/components/ui/SDSLogo";

const PROMO_MS = 5000;

/**
 * Full-viewport branded campaign screen shown for exactly 5 seconds right
 * after the SplashScreen finishes, before the homepage renders. Mirrors the
 * hero's own copy so the value proposition lands before the user can start
 * scrolling or clicking.
 */
export function PromoBanner({ onFinish }: { onFinish: () => void }) {
  const firedRef = useRef(false);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) {
      if (!firedRef.current) {
        firedRef.current = true;
        onFinish();
      }
      return;
    }
    const timer = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true;
        onFinish();
      }
    }, PROMO_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reducedMotion) return null;

  return (
    <motion.div
      key="promo"
      className="fixed inset-0 z-[100] overflow-hidden bg-stone-950"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      role="status"
      aria-label="SDS Tiles and Ceramics: the virtual trial room for your home"
    >
      {/* Real room photo, dimmed, anchoring the campaign in something genuine
          rather than a decorative gradient */}
      <div className="absolute inset-0">
        <img
          src="/images/demo/washroom_after.jpg"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/95 to-stone-950/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-transparent to-stone-950/60" />
      </div>

      {/* Restrained warm bronze glow, centered-left behind the headline */}
      <motion.div
        className="pointer-events-none absolute left-[-10%] top-1/2 h-[55vmax] w-[55vmax] -translate-y-1/2 rounded-full bg-clay-500/25 blur-[120px]"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1, ease: "easeOut" }}
      />

      <div className="relative z-10 flex h-full w-full items-center">
        <div className="container-page">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-6 flex items-center gap-2.5"
            >
              <SDSIcon className="h-8 w-8" />
              <span className="font-sans text-xs font-bold uppercase tracking-[0.22em] text-clay-300">
                SDS Tiles &amp; Ceramics
              </span>
            </motion.div>

            <motion.span
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="inline-block rounded-full border border-clay-400/30 bg-clay-500/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-clay-300"
            >
              The Virtual Trial Room for Your Home
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.3 }}
              className="mt-5 font-display text-4xl font-bold leading-[1.08] text-white sm:text-6xl lg:text-7xl"
            >
              Your Home. <br />
              Your Tile. <br />
              <span className="text-clay-400">Your Trial Room.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-6 font-display text-xl font-medium text-stone-100 sm:text-2xl"
            >
              Try Tiles in Your Real Space Before You Buy.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.62 }}
              className="mt-4 max-w-lg text-sm leading-relaxed text-stone-300 sm:text-base"
            >
              Upload a photo of your bathroom, kitchen, puja mandir, wall, floor or compound.
              Choose a real tile from the catalog and see a realistic preview before the first
              tile is installed.
            </motion.p>
          </div>
        </div>
      </div>

      {/* Progress rail: a quiet, honest timer rather than a skip button —
          communicates the screen will advance on its own */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
        <motion.div
          className="h-full bg-clay-400"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          style={{ transformOrigin: "left" }}
          transition={{ duration: PROMO_MS / 1000, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}
