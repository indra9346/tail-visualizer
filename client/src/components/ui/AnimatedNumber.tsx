import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

/** Animates from its previous value to `value` whenever it changes — used for credit balances and dashboard stats. */
export function AnimatedNumber({ value, className, format }: { value: number; className?: string; format?: (n: number) => string }) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (v) => (format ? format(Math.round(v)) : Math.round(v).toLocaleString()));
  const prevValue = useRef(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: prevValue.current === value ? 0 : 0.7,
      ease: "easeOut",
    });
    prevValue.current = value;
    return () => controls.stop();
  }, [value, motionValue]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
