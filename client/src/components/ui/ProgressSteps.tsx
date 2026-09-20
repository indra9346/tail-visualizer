import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export type StepStatus = "done" | "active" | "pending" | "error";

export interface Step {
  label: string;
  status: StepStatus;
}

const iconClasses = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") {
    return (
      <span className={cn(iconClasses, "bg-stone-900 text-white")} aria-hidden="true">
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className={cn(iconClasses, "bg-red-600 text-white")} aria-hidden="true">
        !
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className={cn(iconClasses, "bg-clay-500 text-white")} aria-hidden="true">
        <motion.span
          className="h-2 w-2 rounded-full bg-white"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        />
      </span>
    );
  }
  return <span className={cn(iconClasses, "border border-stone-300 bg-white text-stone-400")} aria-hidden="true" />;
}

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-4" aria-label="Progress">
      {steps.map((step, idx) => (
        <li key={idx} className="flex items-center gap-3">
          <StepIcon status={step.status} />
          <span
            className={cn(
              "text-sm",
              step.status === "pending" && "text-stone-400",
              step.status === "active" && "font-medium text-stone-900",
              step.status === "done" && "text-stone-600",
              step.status === "error" && "font-medium text-red-700",
            )}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
