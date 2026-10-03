import type { Visualization } from "../api/types";
import { PATTERNS, SURFACES } from "./designPatterns";

export interface DateGroup<T> {
  label: string;
  items: T[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 24 * 60 * 60 * 1000;

/** Chat-style sections: Today, Yesterday, Previous 7 days, Previous 30 days, then Older. Newest first; empty sections are dropped. */
export function groupByDate<T extends { createdAt: string }>(items: T[], now: Date = new Date()): DateGroup<T>[] {
  const today = startOfDay(now);
  const buckets: DateGroup<T>[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Previous 30 days", items: [] },
    { label: "Older", items: [] },
  ];
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const item of sorted) {
    const day = startOfDay(new Date(item.createdAt));
    const age = Math.round((today - day) / DAY);
    const index = age <= 0 ? 0 : age === 1 ? 1 : age <= 7 ? 2 : age <= 30 ? 3 : 4;
    buckets[index]?.items.push(item);
  }
  return buckets.filter((b) => b.items.length > 0);
}

/** A readable name for a visualization, like a chat title: "Left wall + 2 more areas". */
export function visualizationTitle(v: Pick<Visualization, "design" | "tile" | "appliedSurfaces">): string {
  const areas = v.design?.areas ?? [];
  const firstArea = areas[0];
  if (firstArea) {
    const first = firstArea.location.trim() || SURFACES[firstArea.surface]?.label || "Area";
    return areas.length > 1 ? `${first} + ${areas.length - 1} more area${areas.length > 2 ? "s" : ""}` : first;
  }
  const surfaces = v.appliedSurfaces.map((s) => SURFACES[s]?.label ?? s).join(" + ");
  const tile = v.tile?.name;
  return [tile, surfaces].filter(Boolean).join(" · ") || "Visualization";
}

/** One short line under the title: pattern names for designs, or the surfaces for older single-tile results. */
export function visualizationSubtitle(v: Pick<Visualization, "design" | "appliedSurfaces">): string {
  const areas = v.design?.areas ?? [];
  const firstArea = areas[0];
  if (firstArea) {
    const patterns = [...new Set(areas.map((a) => PATTERNS[a.pattern]?.label ?? a.pattern))];
    return patterns.join(", ");
  }
  return v.appliedSurfaces.map((s) => SURFACES[s]?.label ?? s).join(", ");
}
