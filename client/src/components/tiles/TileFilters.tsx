import type { TileCategory } from "@/api/types";
import type { TileSearchFilters } from "@/api/tiles";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

const categories: { value: TileCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "floor", label: "Floor" },
  { value: "wall", label: "Wall" },
  { value: "both", label: "Floor + Wall" },
];

export function TileFilters({
  filters,
  onChange,
}: {
  filters: TileSearchFilters;
  onChange: (next: TileSearchFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {categories.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange({ ...filters, category: c.value === "all" ? undefined : c.value, page: 1 })}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              (filters.category ?? "all") === c.value
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 text-stone-600 hover:bg-stone-100",
            )}
            aria-pressed={(filters.category ?? "all") === c.value}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 sm:w-auto">
        <Input
          placeholder="Material (e.g. porcelain)"
          className="w-40"
          value={filters.material ?? ""}
          onChange={(e) => onChange({ ...filters, material: e.target.value || undefined, page: 1 })}
          aria-label="Filter by material"
        />
        <Input
          placeholder="Color"
          className="w-32"
          value={filters.colorFamily ?? ""}
          onChange={(e) => onChange({ ...filters, colorFamily: e.target.value || undefined, page: 1 })}
          aria-label="Filter by color"
        />
        <Input
          placeholder="Search tiles"
          className="w-44"
          value={filters.q ?? ""}
          onChange={(e) => onChange({ ...filters, q: e.target.value || undefined, page: 1 })}
          aria-label="Search tiles by name, brand, or SKU"
        />
      </div>
    </div>
  );
}
