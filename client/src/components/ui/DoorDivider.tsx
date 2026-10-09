import { motion } from "framer-motion";

interface DoorDividerProps {
  /** Short label for the room being entered, e.g. "THE SHOWROOM". */
  label: string;
}

/**
 * A quiet architectural threshold placed between homepage sections: two
 * panels meet at a seam, then part as the divider scrolls into view,
 * suggesting a doorway opening onto the next room. Purely decorative —
 * triggered once by `whileInView`, never hijacks or delays native scroll.
 */
export function DoorDivider({ label }: DoorDividerProps) {
  return (
    <div className="container-page" aria-hidden="true">
      <div className="relative mx-auto flex h-20 max-w-3xl items-center justify-center overflow-hidden sm:h-24">
        <motion.span
          className="absolute h-px bg-sage-300"
          initial={{ width: "0%" }}
          whileInView={{ width: "100%" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <motion.div
          className="relative z-10 flex items-center gap-3 bg-[#F3F6F1] px-5"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.45, delay: 0.15, ease: "easeOut" }}
        >
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-champagne-500"
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.3, delay: 0.35 }}
          />
          <span className="font-sans text-[11px] font-bold uppercase tracking-[0.28em] text-sage-700">
            {label}
          </span>
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-champagne-500"
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.3, delay: 0.35 }}
          />
        </motion.div>
      </div>
    </div>
  );
}
