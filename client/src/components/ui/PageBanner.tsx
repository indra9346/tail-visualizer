import { ReactNode } from "react";
import { motion } from "framer-motion";
import { TileScene, type SceneId } from "@/components/ui/TileScene";

interface PageBannerProps {
  /** Which tile layout is laid in the background. Give each page its own. */
  scene: SceneId;
  badge?: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  heightClass?: string;
}

export function PageBanner({ scene, badge, title, subtitle, actions, heightClass = "min-h-[14rem] sm:min-h-[16rem] md:min-h-[18rem]" }: PageBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={`relative mb-8 flex items-end overflow-hidden rounded-3xl border border-white/70 bg-[#efe6d8] shadow-xl ${heightClass}`}
    >
      <TileScene scene={scene} className="absolute inset-0 h-full w-full" />

      {/* Bright frosted panel keeps the text readable while the tiles stay colourful around it */}
      <div className="relative m-3 max-w-2xl rounded-2xl bg-white/85 p-5 shadow-lg backdrop-blur-md sm:m-5 sm:p-7">
        {badge && (
          <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-clay-300 bg-clay-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-clay-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-clay-600" />
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
