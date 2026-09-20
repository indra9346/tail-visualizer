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
        "w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900",
        "placeholder:text-stone-400",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-clay-500",
        "disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400",
        className,
      )}
      {...props}
    />
  );
});
