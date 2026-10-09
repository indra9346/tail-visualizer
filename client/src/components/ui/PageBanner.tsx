import { ReactNode } from "react";
import { motion } from "framer-motion";
import { TileScene, type SceneId } from "@/components/ui/TileScene";

export type RoomTone = "sage" | "champagne" | "limestone";

interface PageBannerProps {
  /** Which tile layout is laid in the background. Give each page its own. */
  scene: SceneId;
  badge?: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  heightClass?: string;
  /** Gives this destination its own atmosphere within the shared palette —
   * the showroom reads warmer (champagne), the trial room reads more
   * verdant (sage), everything else stays on the neutral limestone default. */
  tone?: RoomTone;
}

const TONE_BG: Record<RoomTone, string> = {
  sage: "bg-[#E8EEE7]",
  champagne: "bg-[#F1ECE3]",
  limestone: "bg-[#F1ECE3]",
};

const TONE_BADGE: Record<RoomTone, string> = {
  sage: "border-sage-300 bg-sage-100 text-sage-800",
  champagne: "border-champagne-300 bg-champagne-100 text-champagne-600",
  limestone: "border-clay-300 bg-clay-100 text-clay-800",
};

const TONE_DOT: Record<RoomTone, string> = {
  sage: "bg-sage-600",
  champagne: "bg-champagne-500",
  limestone: "bg-clay-600",
};

export function PageBanner({ scene, badge, title, subtitle, actions, heightClass = "min-h-[14rem] sm:min-h-[16rem] md:min-h-[18rem]", tone = "limestone" }: PageBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={`relative mb-8 flex items-end overflow-hidden rounded-3xl border border-white/70 shadow-xl ${TONE_BG[tone]} ${heightClass}`}
    >
      <TileScene scene={scene} className="absolute inset-0 h-full w-full" />

      {/* Bright frosted panel keeps the text readable while the tiles stay colourful around it */}
      <div className="relative m-3 max-w-2xl rounded-2xl bg-white/85 p-5 shadow-lg backdrop-blur-md sm:m-5 sm:p-7">
        {badge && (
          <span className={`mb-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${TONE_BADGE[tone]}`}>
            <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${TONE_DOT[tone]}`} />
            {badge}
          </span>
        )}
        <h1 className="font-display text-2xl font-bold text-stone-900 sm:text-3xl md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-xl text-xs leading-relaxed text-stone-700 sm:text-sm md:text-base">{subtitle}</p>
        {actions && <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </motion.div>
  );
}
