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
  emptyDescription = "The tile catalog for this filter is currently empty. Try a different filter, or check back soon.",
}: {
  tiles: Tile[];
  reasons?: Record<string, string>;
  selectedTileId?: string | null;
  onSelect: (tile: Tile) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
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
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
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
