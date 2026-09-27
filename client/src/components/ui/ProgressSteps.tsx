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
      <motion.span
        key="done"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 450, damping: 22 }}
        className={cn(iconClasses, "bg-stone-900 text-white")}
        aria-hidden="true"
      >
        ✓
      </motion.span>
    );
  }
  if (status === "error") {
    return (
      <motion.span
        key="error"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 450, damping: 22 }}
        className={cn(iconClasses, "bg-red-600 text-white")}
        aria-hidden="true"
      >
        !
      </motion.span>
    );
  }
  if (status === "active") {
    return (
      <motion.span
        key="active"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 450, damping: 22 }}
        className={cn(iconClasses, "bg-clay-500 text-white")}
        aria-hidden="true"
      >
        <motion.span
          className="h-2 w-2 rounded-full bg-white"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        />
      </motion.span>
    );
  }
  return <span className={cn(iconClasses, "border border-stone-300 bg-white text-stone-400")} aria-hidden="true" />;
}

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-4" aria-label="Progress">
      {steps.map((step, idx) => (
        <motion.li
          key={idx}
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: idx * 0.05, ease: "easeOut" }}
        >
          <StepIcon status={step.status} />
          <motion.span
            animate={step.status === "active" ? { x: [0, 2, 0] } : { x: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              "text-sm",
              step.status === "pending" && "text-stone-400",
              step.status === "active" && "font-medium text-stone-900",
              step.status === "done" && "text-stone-600",
              step.status === "error" && "font-medium text-red-700",
            )}
          >
            {step.label}
          </motion.span>
        </motion.li>
      ))}
    </ol>
  );
}
