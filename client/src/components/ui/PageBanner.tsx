import { ReactNode } from "react";
import { motion } from "framer-motion";

interface PageBannerProps {
  imageSrc: string;
  badge?: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  heightClass?: string;
}

export function PageBanner({
  imageSrc,
  badge,
  title,
  subtitle,
  actions,
  heightClass = "h-56 sm:h-64 md:h-72",
}: PageBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className={`relative mb-8 overflow-hidden rounded-3xl border border-stone-800 bg-stone-950 shadow-xl ${heightClass}`}
    >
      {/* Background Banner Image */}
      <img
        src={imageSrc}
        alt={title}
        className="absolute inset-0 h-full w-full object-cover object-center brightness-[0.85] transition-transform duration-700 hover:scale-105"
      />

      {/* Cinematic Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-stone-950 via-stone-950/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-transparent to-transparent" />

      {/* Content Container */}
      <div className="relative flex h-full flex-col justify-end p-6 sm:p-8 md:p-10">
        <div className="max-w-2xl">
          {badge && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-clay-200 border border-clay-400/30 backdrop-blur mb-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-clay-400 animate-pulse" />
              {badge}
            </span>
          )}
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl md:text-4xl drop-shadow-sm">
            {title}
          </h1>
          <p className="mt-2 text-xs text-stone-200/90 sm:text-sm md:text-base leading-relaxed max-w-xl drop-shadow">
            {subtitle}
          </p>
        </div>

        {actions && <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </motion.div>
  );
}
