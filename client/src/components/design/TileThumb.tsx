import { useState } from "react";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import type { Tile } from "@/api/types";

/** The tile photo. If it cannot be loaded, a neutral swatch with the tile's initials is shown instead of the browser's broken-image icon and raw alt text. */
export function TileThumb({ tile }: { tile: Tile }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span role="img" aria-label={tile.name} className="flex h-full w-full items-center justify-center bg-stone-200 text-sm font-semibold uppercase text-stone-500">
        {tile.name.trim().slice(0, 2)}
      </span>
    );
  }
  return <img src={getPublicTileImageUrl(tile.storagePath)} alt={tile.name} className="h-full w-full object-cover" onError={() => setBroken(true)} />;
}
