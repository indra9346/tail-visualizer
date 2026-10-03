import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * One tile of a page's layout, like a glazed tile set in a wall: a clear surface with a thin bevel highlight,
 * a soft drop shadow and a consistent corner radius. Tones carry meaning (money, success, warning, problem),
 * so colour is used for emphasis rather than decoration.
 */
export type TileTone = "plain" | "soft" | "teal" | "sun" | "rose" | "sky" | "feature";

const tones: Record<TileTone, string> = {
  plain: "bg-white/90 border-stone-200",
  soft: "bg-clay-50/90 border-clay-200",
  teal: "bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200",
  sun: "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200",
  rose: "bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200",
  sky: "bg-gradient-to-br from-sky-50 to-indigo-50 border-sky-200",
  feature: "bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 border-teal-500 text-white",
};

export function Tile({ tone = "plain", interactive, className, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: TileTone; interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5 shadow-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
        tones[tone],
        interactive && "transition duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

/** Small caps label used above a figure or heading inside a tile. */
export function TileLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs font-semibold uppercase tracking-wide opacity-70", className)} {...props} />;
}
