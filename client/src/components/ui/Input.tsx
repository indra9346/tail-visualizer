import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink",
        "placeholder:text-ink-secondary/70",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-champagne-500",
        "disabled:cursor-not-allowed disabled:bg-surface-app disabled:text-ink-secondary/60",
        className,
      )}
      {...props}
    />
  );
});
