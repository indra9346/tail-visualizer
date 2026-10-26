import type { SurfaceType } from "@/api/types";

/** A simple drawing of each surface, so the choice can be made by looking (no reading needed). */
export function SurfaceIcon({ surface, className = "h-12 w-12" }: { surface: SurfaceType; className?: string }) {
  const common = { className, viewBox: "0 0 48 48", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (surface) {
    case "floor":
      return (
        <svg {...common}>
          <path d="M4 40 14 22h20l10 18Z" fill="currentColor" fillOpacity=".15" />
          <path d="M11 28h26M8 34h32M19 22l-3 18M29 22l3 18M24 22v18" strokeWidth="1.4" />
        </svg>
      );
    case "wall":
      return (
        <svg {...common}>
          <rect x="7" y="6" width="34" height="36" rx="1.5" fill="currentColor" fillOpacity=".15" />
          <path d="M7 15h34M7 24h34M7 33h34M18 6v9M30 15v9M18 24v9M30 33v9" strokeWidth="1.4" />
        </svg>
      );
    case "backsplash":
      return (
        <svg {...common}>
          <rect x="5" y="6" width="38" height="10" rx="1" />
          <rect x="5" y="16" width="38" height="12" fill="currentColor" fillOpacity=".2" />
          <path d="M5 22h38M14 16v12M24 16v12M34 16v12" strokeWidth="1.2" />
          <rect x="3" y="28" width="42" height="4" rx="1" fill="currentColor" fillOpacity=".5" />
          <path d="M7 32v10h34V32" />
        </svg>
      );
    case "shower_wall":
      return (
        <svg {...common}>
          <rect x="8" y="6" width="32" height="36" rx="1.5" fill="currentColor" fillOpacity=".15" />
          <path d="M8 18h32M8 30h32M24 6v36" strokeWidth="1.2" />
          <path d="M30 10h6v4" />
          <path d="M33 17v2M30 18v2M36 18v2M33 22v2" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "step_tread":
      return (
        <svg {...common}>
          <path d="M4 42V34h10v-8h10v-8h10v-8h10" />
          <path d="M4 34h10M14 26h10M24 18h10M34 10h10" strokeWidth="4" stroke="currentColor" strokeOpacity=".55" />
        </svg>
      );
    case "step_riser":
      return (
        <svg {...common}>
          <path d="M4 42V34h10v-8h10v-8h10v-8h10" />
          <path d="M14 34v-8M24 26v-8M34 18v-8M4 42v-8" strokeWidth="4" stroke="currentColor" strokeOpacity=".55" />
        </svg>
      );
    default:
      return null;
  }
}
