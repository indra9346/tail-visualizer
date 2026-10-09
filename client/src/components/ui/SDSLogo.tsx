import React, { useId } from "react";
import { cn } from "@/lib/cn";

interface SDSLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "dark" | "light"; // "dark" = dark text on light bg, "light" = white text on dark bg
  showSubtitle?: boolean;
  subtitle?: string;
  iconOnly?: boolean;
}

/**
 * Premium brand icon emblem for SDS TILES & CERAMICS.
 * Represents precision ceramic tile craftsmanship with warm clay, gold, and obsidian facets.
 */
export function SDSIcon({
  className = "h-10 w-10",
  size = 48,
}: {
  className?: string;
  size?: number;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  return (
    <svg
      className={cn("shrink-0 drop-shadow-sm select-none", className)}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Luxury Gold & Ceramic Gradients */}
        <linearGradient id={id("sds-gold-bevel")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5e6cf" />
          <stop offset="45%" stopColor="#d4a362" />
          <stop offset="100%" stopColor="#8f6740" />
        </linearGradient>

        <linearGradient id={id("sds-tile-marble")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fdfbf7" />
          <stop offset="100%" stopColor="#e2cfb9" />
        </linearGradient>

        <linearGradient id={id("sds-tile-terracotta")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d49b61" />
          <stop offset="100%" stopColor="#93572d" />
        </linearGradient>

        <linearGradient id={id("sds-tile-bronze")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#aa7845" />
          <stop offset="100%" stopColor="#5f3e20" />
        </linearGradient>

        <linearGradient id={id("sds-tile-slate")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#352e29" />
          <stop offset="100%" stopColor="#161412" />
        </linearGradient>

        <linearGradient id={id("sds-sheen")} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>

        <filter id={id("sds-shadow")} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Outer Ceramic Badge Base */}
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill="#181513"
        stroke={`url(#${id("sds-gold-bevel")})`}
        strokeWidth="1.2"
      />

      {/* Decorative Ceramic Grout Matrix Pattern (4 Quadrant Tiles) */}
      <g filter={`url(#${id("sds-shadow")})`}>
        {/* Top-Left Tile: Polished Calacatta / Glazed Porcelain */}
        <rect
          x="7.5"
          y="7.5"
          width="15"
          height="15"
          rx="3.5"
          fill={`url(#${id("sds-tile-marble")})`}
        />
        {/* Subtle Glaze Sheen Line */}
        <line
          x1="8.5"
          y1="8.5"
          x2="21.5"
          y2="8.5"
          stroke={`url(#${id("sds-sheen")})`}
          strokeWidth="1"
          strokeLinecap="round"
        />

        {/* Top-Right Tile: Terracotta Ceramic */}
        <rect
          x="25.5"
          y="7.5"
          width="15"
          height="15"
          rx="3.5"
          fill={`url(#${id("sds-tile-terracotta")})`}
        />

        {/* Bottom-Left Tile: Earthen Clay / Bronze Tile */}
        <rect
          x="7.5"
          y="25.5"
          width="15"
          height="15"
          rx="3.5"
          fill={`url(#${id("sds-tile-bronze")})`}
        />

        {/* Bottom-Right Tile: Slate / Charcoal Granito Tile */}
        <rect
          x="25.5"
          y="25.5"
          width="15"
          height="15"
          rx="3.5"
          fill={`url(#${id("sds-tile-slate")})`}
        />
      </g>

      {/* Center Golden Monogram Diamond Seal */}
      <g transform="translate(24, 24)">
        {/* Diamond Rhombus */}
        <rect
          x="-9"
          y="-9"
          width="18"
          height="18"
          rx="3.5"
          transform="rotate(45)"
          fill="#1c1815"
          stroke={`url(#${id("sds-gold-bevel")})`}
          strokeWidth="1.2"
        />
        {/* Inner Diamond Core */}
        <rect
          x="-6.5"
          y="-6.5"
          width="13"
          height="13"
          rx="2"
          transform="rotate(45)"
          fill={`url(#${id("sds-gold-bevel")})`}
        />
        {/* Monogram "SDS" */}
        <text
          x="0"
          y="2.6"
          textAnchor="middle"
          fill="#1c1815"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="900"
          fontSize="6.5"
          letterSpacing="0.4"
        >
          SDS
        </text>
      </g>
    </svg>
  );
}

/**
 * Attractive brand mark for SDS TILES & CERAMICS with responsive typography.
 */
export function SDSLogo({
  className,
  size = "md",
  variant = "dark",
  showSubtitle = true,
  subtitle = "Virtual Trial Room",
  iconOnly = false,
}: SDSLogoProps) {
  const isLight = variant === "light";

  const sizeConfigs = {
    sm: {
      iconClass: "h-8 w-8",
      primaryText: "text-lg",
      brandText: "text-[9px] tracking-[0.2em]",
      subText: "text-[8px] tracking-widest",
      gap: "gap-2.5",
    },
    md: {
      iconClass: "h-10 w-10",
      primaryText: "text-xl",
      brandText: "text-[10.5px] tracking-[0.22em]",
      subText: "text-[9px] tracking-widest",
      gap: "gap-3",
    },
    lg: {
      iconClass: "h-12 w-12",
      primaryText: "text-2xl sm:text-3xl",
      brandText: "text-xs sm:text-[13px] tracking-[0.24em]",
      subText: "text-[10px] tracking-widest",
      gap: "gap-3.5",
    },
    xl: {
      iconClass: "h-14 w-14",
      primaryText: "text-3xl sm:text-4xl",
      brandText: "text-sm tracking-[0.26em]",
      subText: "text-xs tracking-widest",
      gap: "gap-4",
    },
  };

  const currentSize = sizeConfigs[size];

  if (iconOnly) {
    return <SDSIcon className={currentSize.iconClass} />;
  }

  return (
    <div className={cn("inline-flex items-center", currentSize.gap, className)}>
      {/* Brand Icon Emblem */}
      <div className="relative shrink-0 transition-transform duration-300 group-hover:scale-105">
        <SDSIcon className={currentSize.iconClass} />
      </div>

      {/* Brand Typography Lockup */}
      <div className="flex flex-col justify-center leading-none">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span
            className={cn(
              "font-display font-black tracking-tight leading-none",
              currentSize.primaryText,
              isLight ? "text-white" : "text-stone-950"
            )}
          >
            SDS
          </span>
          <span
            className={cn(
              "font-sans font-extrabold uppercase leading-none",
              currentSize.brandText,
              isLight ? "text-clay-300" : "text-clay-800"
            )}
          >
            TILES &amp; CERAMICS
          </span>
        </div>

        {showSubtitle && subtitle && (
          <span
            className={cn(
              "font-sans font-semibold uppercase mt-1 leading-tight",
              currentSize.subText,
              isLight ? "text-stone-300/80" : "text-stone-500"
            )}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
