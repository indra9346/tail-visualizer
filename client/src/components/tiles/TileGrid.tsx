import { Link } from "react-router-dom";
import type { Tile } from "@/api/types";
import { TileCard } from "./TileCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

export function TileGrid({
  tiles,
  reasons,
  selectedTileId,
  onSelect,
  loading,
  emptyTitle = "No tiles are available yet.",
  emptyDescription = "Your catalog doesn't have any tiles yet.",
  showAddTileCta = true,
}: {
  tiles: Tile[];
  reasons?: Record<string, string>;
  selectedTileId?: string | null;
  onSelect: (tile: Tile) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Shows a link to My Tiles in the empty state — set false where a catalog-with-tiles empty state (e.g. a filter) is more accurate. */
  showAddTileCta?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full" />
        ))}
      </div>
    );
  }

  if (tiles.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={
          showAddTileCta ? (
            <Link to="/my-tiles" className="text-sm font-medium text-stone-900 underline">
              Add a tile in My Tiles
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <TileCard
          key={tile.id}
          tile={tile}
          reason={reasons?.[tile.id]}
          selected={tile.id === selectedTileId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
