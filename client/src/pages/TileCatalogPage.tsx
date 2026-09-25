import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { TileGrid } from "@/components/tiles/TileGrid";
import { TileFilters } from "@/components/tiles/TileFilters";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { searchTiles, type TileSearchFilters } from "@/api/tiles";
import { useWorkflow } from "@/context/WorkflowContext";
import type { Tile } from "@/api/types";

/** Catalog-only browsing (no room context yet) — used by the top nav and the landing page's "Explore Tiles" CTA. */
export function TileCatalogPage() {
  const { selectedTile, selectTile } = useWorkflow();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<TileSearchFilters>({ page: 1, pageSize: 20 });

  useEffect(() => {
    setLoading(true);
    searchTiles(filters)
      .then((res) => {
        setTiles(res.tiles);
        setTotal(res.total);
      })
      .catch(() => setTiles([]))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <PageContainer>
      <h1 className="font-display text-3xl text-stone-900">Tile Catalog</h1>
      <p className="mt-2 text-stone-600">These are the tiles in your showroom catalog. Add or edit them under My Tiles.</p>

      <div className="mt-8">
        <TileFilters filters={filters} onChange={setFilters} />
      </div>

      <p className="mt-4 text-sm text-stone-400">{loading ? "Loading…" : `${total} tile${total === 1 ? "" : "s"} found`}</p>

      <div className="mt-4">
        <TileGrid tiles={tiles} selectedTileId={selectedTile?.id} onSelect={selectTile} loading={loading} />
      </div>

      {selectedTile && (
        <Card className="sticky bottom-4 mt-10 border-stone-900">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-stone-500">Selected tile</p>
              <p className="font-display text-lg text-stone-900">{selectedTile.name}</p>
            </div>
            <Link to="/upload">
              <Button size="lg">Upload a Room to Visualize This Tile</Button>
            </Link>
          </CardBody>
        </Card>
      )}
    </PageContainer>
  );
}
