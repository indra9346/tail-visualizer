import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

const CLOSE_MS = 260;
const OPEN_MS = 320;

interface RoomTransitionContextValue {
  /** Navigate to `to`, playing a brief door-closing/opening transition labelled with `label`. */
  go: (to: string, label: string) => void;
}

const RoomTransitionContext = createContext<RoomTransitionContextValue | null>(null);

/**
 * The "every destination is a room" navigation layer: wraps route changes
 * triggered from the primary nav (Sidebar / mobile drawer) with a door that
 * closes over the current page, swaps the route underneath, then opens onto
 * the destination. Direct URL loads, refreshes, and browser back/forward are
 * untouched — they never pass through `go`, so they navigate immediately as
 * normal, which is intentional: the animation is a navigation flourish, not
 * a gate in front of the real application.
 */
export function RoomTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<{ phase: "closing" | "opening"; label: string } | null>(null);
  const pendingRef = useRef<string | null>(null);

  const go = useCallback(
    (to: string, label: string) => {
      const reducedMotion =
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reducedMotion) {
        navigate(to);
        return;
      }
      if (pendingRef.current === to) return; // already mid-transition to this destination
      pendingRef.current = to;
      setState({ phase: "closing", label });
      setTimeout(() => {
        navigate(to);
        setState({ phase: "opening", label });
        setTimeout(() => {
          pendingRef.current = null;
          setState(null);
        }, OPEN_MS);
      }, CLOSE_MS);
    },
    [navigate],
  );

  return (
    <RoomTransitionContext.Provider value={{ go }}>
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            key="room-transition"
            className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
            initial={false}
          >
            <motion.div
              className="absolute inset-y-0 left-0 w-1/2"
              style={{ background: "linear-gradient(120deg, #A98F5E 0%, #718575 55%, #44574B 100%)" }}
              initial={{ x: "-100%" }}
              animate={{ x: state.phase === "closing" ? 0 : "-100%" }}
              transition={{ duration: (state.phase === "closing" ? CLOSE_MS : OPEN_MS) / 1000, ease: [0.76, 0, 0.24, 1] }}
            />
            <motion.div
              className="absolute inset-y-0 right-0 w-1/2"
              style={{ background: "linear-gradient(240deg, #A98F5E 0%, #718575 55%, #44574B 100%)" }}
              initial={{ x: "100%" }}
              animate={{ x: state.phase === "closing" ? 0 : "100%" }}
              transition={{ duration: (state.phase === "closing" ? CLOSE_MS : OPEN_MS) / 1000, ease: [0.76, 0, 0.24, 1] }}
            />
            <motion.span
              className="relative z-10 font-sans text-xs font-bold uppercase tracking-[0.3em] text-white/90"
              initial={{ opacity: 0 }}
              animate={{ opacity: state.phase === "closing" ? 1 : 0 }}
              transition={{ duration: 0.18 }}
            >
              {state.label}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </RoomTransitionContext.Provider>
  );
}

export function useRoomTransition(): RoomTransitionContextValue {
  const ctx = useContext(RoomTransitionContext);
  if (!ctx) {
    throw new Error("useRoomTransition must be used within a RoomTransitionProvider");
  }
  return ctx;
}
