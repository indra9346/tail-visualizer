import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SDSIcon } from "@/components/ui/SDSLogo";

const HOLD_MS = 400;
const EXIT_MS = 350;

/**
 * Stage A of the arrival sequence: a restrained brand introduction on a
 * light limestone/sage field with a soft champagne glow — never a dark or
 * black screen. Logo fades + scales in, holds briefly, then dissolves into
 * Stage B (PromoBanner).
 */
export function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) {
      onFinish();
      return;
    }
    const ENTER_MS = 450;
    const t1 = setTimeout(() => setPhase("hold"), ENTER_MS);
    const t2 = setTimeout(() => setPhase("out"), ENTER_MS + HOLD_MS);
    const t3 = setTimeout(onFinish, ENTER_MS + HOLD_MS + EXIT_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reducedMotion) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="splash"
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#F3F6F1]"
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === "out" ? 0 : 1 }}
        transition={{ duration: EXIT_MS / 1000, ease: "easeInOut" }}
        aria-hidden="true"
      >
        {/* Warm limestone field, matching the body's own base gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, #FAF9F5 0%, #F3F6F1 35%, #E8EEE7 70%, #D9D0C2 100%)",
          }}
        />

        {/* Restrained champagne glow, centered behind the mark */}
        <motion.div
          className="absolute h-[55vmax] w-[55vmax] rounded-full bg-champagne-400/35 blur-3xl"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />

        {/* A single soft expanding ring instead of a dark burst pattern */}
        <motion.span
          className="absolute rounded-full border border-sage-500/25"
          initial={{ width: 0, height: 0, opacity: 0.6 }}
          animate={{ width: 520, height: 520, opacity: 0 }}
          transition={{ duration: 1.3, ease: "easeOut", repeat: phase === "in" ? Infinity : 0, repeatDelay: 0.4 }}
        />

        {/* Logo: fade + scale in -> hold -> dissolve */}
        <motion.div
          className="relative flex flex-col items-center gap-4"
          initial={{ scale: 0.82, opacity: 0 }}
          animate={
            phase === "out"
              ? { scale: 1.06, opacity: 0 }
              : { scale: 1, opacity: 1 }
          }
          transition={
            phase === "out"
              ? { duration: EXIT_MS / 1000, ease: "easeIn" }
              : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
          }
        >
          <SDSIcon className="h-24 w-24 drop-shadow-[0_8px_30px_rgba(214,188,141,0.45)]" />
          <motion.p
            className="font-display text-xl font-black tracking-tight text-sage-900"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: phase === "out" ? 0 : 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4 }}
          >
            SDS <span className="text-champagne-600">TILES &amp; CERAMICS</span>
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
