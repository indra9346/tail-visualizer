import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SDSIcon } from "@/components/ui/SDSLogo";

const PROMO_MS = 5000;

/**
 * Stage B of the arrival sequence: a full-viewport welcome campaign shown
 * for exactly 5 seconds after SplashScreen finishes, on the same light
 * limestone/sage field (never a dark screen). "Start Your Visit" lets an
 * impatient visitor skip ahead into Stage C early; otherwise it auto-advances.
 *
 * Layout is a genuine two-column editorial split (text ~52%, architectural
 * photo filling the rest, full height) rather than a centered card over a
 * background image, so it reads as a brand campaign, not a dialog.
 */
export function PromoBanner({ onFinish }: { onFinish: () => void }) {
  const firedRef = useRef(false);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const finish = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onFinish();
  };

  useEffect(() => {
    if (reducedMotion) {
      finish();
      return;
    }
    const timer = setTimeout(finish, PROMO_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reducedMotion) return null;

  return (
    <motion.div
      key="promo"
      className="fixed inset-0 z-[100] overflow-y-auto overflow-x-hidden bg-[#FAF9F5] sm:overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      role="status"
      aria-label="SDS Tiles and Ceramics: the virtual trial room for your home"
    >
      <div className="grid min-h-full grid-cols-1 sm:grid-cols-[52%_48%] sm:h-full">
        {/* Text column */}
        <div className="relative flex items-center px-6 py-12 sm:px-12 sm:py-10 lg:px-20">
          <div
            className="absolute inset-0 -z-10"
            style={{ background: "linear-gradient(180deg, #FAF9F5 0%, #F3F6F1 55%, #E8EEE7 100%)" }}
          />
          <motion.div
            className="pointer-events-none absolute -left-16 top-1/3 h-[42vmax] w-[42vmax] rounded-full bg-champagne-400/25 blur-[110px]"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
          />

          <div className="relative max-w-lg">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mb-6 flex items-center gap-2.5"
            >
              <SDSIcon className="h-8 w-8" />
              <span className="font-sans text-xs font-bold uppercase tracking-[0.22em] text-sage-800">
                SDS Tiles &amp; Ceramics
              </span>
            </motion.div>

            <motion.span
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="inline-block rounded-full border border-champagne-400/60 bg-white/70 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-sage-800 shadow-sm backdrop-blur-sm"
            >
              The Virtual Trial Room for Your Home
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.3 }}
              className="mt-5 font-display text-4xl font-bold leading-[1.08] text-sage-900 sm:text-5xl lg:text-6xl"
            >
              Your Home. <br />
              Your Tile. <br />
              <span className="text-champagne-600">Your Trial Room.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-6 font-display text-xl font-medium text-sage-800 sm:text-2xl"
            >
              Try Tiles in Your Real Space Before You Buy.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.62 }}
              className="mt-4 max-w-md text-sm leading-relaxed text-sage-600 sm:text-base"
            >
              Upload a photo of your bathroom, kitchen, puja mandir, wall, floor or compound.
              Choose a real tile from the catalog and see a realistic preview before the first
              tile is installed.
            </motion.p>

            <motion.button
              type="button"
              onClick={finish}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.74 }}
              whileTap={{ scale: 0.97 }}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-sage-900 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sage-900/20 transition-colors hover:bg-sage-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-500"
            >
              Start Your Visit →
            </motion.button>
          </div>
        </div>

        {/* Architectural image column — full height on desktop, a shorter
            banner above the text on mobile so nothing is hidden. */}
        <motion.div
          className="relative order-first h-48 overflow-hidden sm:order-none sm:h-full"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <img
            src="/images/walls/herringbone-green.jpg"
            alt="Sage herringbone tile wall with natural light and styled greenery"
            className="h-full w-full object-cover"
          />
          {/* Blend the seam into the text column rather than a hard cut */}
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#FAF9F5] to-transparent sm:block hidden" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#FAF9F5]/70 to-transparent sm:hidden" />
        </motion.div>
      </div>

      {/* Quiet honest timer instead of a skip button — communicates that the
          screen will advance on its own */}
      <div className="absolute inset-x-0 bottom-0 z-10 h-0.5 bg-sage-900/10">
        <motion.div
          className="h-full bg-champagne-500"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          style={{ transformOrigin: "left" }}
          transition={{ duration: PROMO_MS / 1000, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}
