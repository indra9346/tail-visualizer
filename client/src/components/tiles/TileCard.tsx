import { motion } from "framer-motion";
import type { Tile } from "@/api/types";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { getPublicTileImageUrl } from "@/lib/tileImage";

const categoryLabel: Record<Tile["category"], string> = {
  floor: "Floor",
  wall: "Wall",
  both: "Floor + Wall",
};

/** Inherited from TileGrid's stagger container. */
const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" } },
};

export function TileCard({
  tile,
  reason,
  selected,
  onSelect,
}: {
  tile: Tile;
  reason?: string;
  selected?: boolean;
  onSelect: (tile: Tile) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(tile)}
      variants={cardVariants}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-soft transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-500",
        selected ? "border-stone-900 ring-2 ring-stone-900" : "border-stone-200 hover:shadow-lg",
      )}
      aria-pressed={selected}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
        <img
          src={getPublicTileImageUrl(tile.storagePath)}
          alt={`${tile.name} tile sample`}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        {/* Glossy light sweep on hover — a nod to a real glazed tile catching the light. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-[transform,opacity] duration-700 ease-out group-hover:translate-x-full group-hover:opacity-100"
        />
        {selected && (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-white shadow"
            aria-hidden="true"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display text-base leading-tight text-stone-900">{tile.name}</p>
            {tile.brand && <p className="text-xs text-stone-500">{tile.brand}</p>}
          </div>
          <Badge tone="neutral">{categoryLabel[tile.category]}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-stone-500">
          {tile.material && (
            <div>
              <dt className="inline text-stone-400">Material: </dt>
              <dd className="inline text-stone-700">{tile.material}</dd>
            </div>
          )}
          {tile.finish && (
            <div>
              <dt className="inline text-stone-400">Finish: </dt>
              <dd className="inline text-stone-700">{tile.finish}</dd>
            </div>
          )}
          {tile.colorFamily && (
            <div>
              <dt className="inline text-stone-400">Color: </dt>
              <dd className="inline text-stone-700">{tile.colorFamily}</dd>
            </div>
          )}
          {tile.sizeMm && (
            <div>
              <dt className="inline text-stone-400">Size: </dt>
              <dd className="inline text-stone-700">{tile.sizeMm} mm</dd>
            </div>
          )}
        </dl>

        {tile.pricePerSqft != null && (
          <p className="mt-1 text-sm font-medium text-stone-900">
            {tile.currency} {tile.pricePerSqft.toFixed(2)}
            <span className="font-normal text-stone-500"> / sq ft</span>
          </p>
        )}

        {reason && <p className="mt-1 rounded-lg bg-clay-50 px-2.5 py-1.5 text-xs text-clay-800">{reason}</p>}
      </div>
    </motion.button>
  );
}
