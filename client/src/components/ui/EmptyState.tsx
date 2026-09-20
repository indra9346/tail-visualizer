import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-stone-400">{icon}</div>}
      <h3 className="font-display text-xl text-stone-900">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
