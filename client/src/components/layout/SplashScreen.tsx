import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SDSIcon } from "@/components/ui/SDSLogo";

const HOLD_MS = 1500;
const EXIT_MS = 650;

/**
 * Full-screen boot intro shown once per browser session: an expanding-ring
 * burst (same beat as Jio Hotstar's launch animation) followed by the SDS
 * mark zooming in, holding, then zooming out and dissolving to reveal the app.
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
    const t1 = setTimeout(() => setPhase("hold"), 550);
    const t2 = setTimeout(() => setPhase("out"), 550 + HOLD_MS);
    const t3 = setTimeout(onFinish, 550 + HOLD_MS + EXIT_MS);
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
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-stone-950"
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === "out" ? 0 : 1 }}
        transition={{ duration: EXIT_MS / 1000, ease: "easeInOut" }}
        aria-hidden="true"
      >
          {/* Expanding burst rings */}
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full border border-clay-400/40"
              initial={{ width: 0, height: 0, opacity: 0.9 }}
              animate={{ width: 900, height: 900, opacity: 0 }}
              transition={{ duration: 1.6, delay: i * 0.22, ease: "easeOut", repeat: phase === "in" ? Infinity : 0, repeatDelay: 0.3 }}
            />
          ))}

          {/* Soft ambient glow */}
          <motion.div
            className="absolute h-[60vmax] w-[60vmax] rounded-full bg-clay-500/20 blur-3xl"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />

          {/* Logo: zoom in -> hold -> zoom out & disappear */}
          <motion.div
            className="relative flex flex-col items-center gap-4"
            initial={{ scale: 0.2, opacity: 0 }}
            animate={
              phase === "out"
                ? { scale: 1.45, opacity: 0 }
                : { scale: 1, opacity: 1 }
            }
            transition={
              phase === "out"
                ? { duration: EXIT_MS / 1000, ease: "easeIn" }
                : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
            }
          >
            <SDSIcon className="h-24 w-24 drop-shadow-[0_0_30px_rgba(193,154,104,0.45)]" />
            <motion.p
              className="font-display text-xl font-black tracking-tight text-white"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: phase === "out" ? 0 : 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              SDS <span className="text-clay-400">TILES &amp; CERAMICS</span>
            </motion.p>
          </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
