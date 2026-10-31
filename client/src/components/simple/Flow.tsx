import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { ListenButton } from "./Listen";

export const STEP_NAMES = ["Room photo", "What to change", "Pick a tile", "Make real photo"] as const;

/** The big 60 px buttons of the simple app. Primary = the one next step; secondary = the other choice. */
export function bigButton(variant: "primary" | "secondary" | "whatsapp" | "gold" = "primary", extra?: string) {
  return cn(
    "flex min-h-[60px] w-full items-center justify-center gap-2.5 rounded-2xl px-5 text-center text-lg font-bold transition-colors disabled:cursor-not-allowed",
    variant === "primary" && "bg-stone-900 text-white shadow-md hover:bg-stone-950 disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none",
    variant === "secondary" && "border-2 border-[#C9D2C6] bg-white text-ink hover:border-[#8E9A8F] disabled:opacity-50",
    variant === "whatsapp" && "bg-[#0B7A4B] text-white shadow-md hover:bg-[#086B41]",
    variant === "gold" && "bg-champagne-400 text-ink shadow-md hover:bg-champagne-500",
    extra,
  );
}

/** Small square button with only an icon (Back, Close): always labelled for screen readers. */
export function IconLink({ to, label, icon = "back", onClick }: { to?: string; label: string; icon?: "back" | "close"; onClick?: () => void }) {
  const cls = "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-hairline bg-white text-ink hover:border-[#8E9A8F]";
  if (to) {
    return (
      <Link to={to} aria-label={label} className={cls}>
        <Icon name={icon} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      <Icon name={icon} />
    </button>
  );
}

/**
 * Top of every step of a new design: Back (top-left, always), "Step 2 of 4 · What to change", a bar of 4, and Listen.
 */
export function FlowHeader({ step, label, back, onBack, listen }: { step: 1 | 2 | 3 | 4; label?: string; back?: string; onBack?: () => void; listen: string }) {
  return (
    <header className="flex items-center gap-3 pb-3">
      <IconLink to={back} onClick={onBack} label="Back" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-ink">
          Step {step} of 4 <span className="font-semibold text-ink-secondary">· {label ?? STEP_NAMES[step - 1]}</span>
        </p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={cn("h-1.5 flex-1 rounded-full", n < step ? "bg-stone-900" : n === step ? "bg-champagne-500" : "bg-sage-300")} />
          ))}
        </div>
      </div>
      <ListenButton text={listen} />
    </header>
  );
}

/**
 * The bar at the bottom of a step that holds its one big button. Sticks to the bottom of the screen, and on a short
 * page it still sits at the bottom (the spacer before it takes the free height), never in the middle.
 */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <div data-action-bar="" className="mt-auto h-6 shrink-0" aria-hidden="true" />
      <div
        className={cn(
          "sticky bottom-0 z-30 -mx-4 border-t border-hairline bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(48,59,51,0.08)] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}

/** The screen's question, written as a question. */
export function Question({ children, sub, id }: { children: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <div>
      <h1 id={id} className="font-display text-[28px] font-semibold leading-[34px] text-ink">
        {children}
      </h1>
      {sub && <p className="mt-1 text-base leading-snug text-ink-secondary">{sub}</p>}
    </div>
  );
}

/** Small uppercase label above a group. */
export function GroupLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="font-sans text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#4E5A51]" style={{ letterSpacing: "0.06em" }}>
      {children}
    </h2>
  );
}

/** Simple page wrapper for the new screens: phone-first column, wider on a laptop. */
export function Screen({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  // A screen with a bottom bar fills the phone's height, so the bar sits at the bottom even when there is little above it.
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 pt-4 sm:px-6 sm:pt-6 has-[>[data-action-bar]]:flex has-[>[data-action-bar]]:min-h-[100dvh] has-[>[data-action-bar]]:flex-col",
        wide ? "max-w-6xl" : "max-w-2xl",
        className,
      )}
    >
      {children}
    </main>
  );
}
