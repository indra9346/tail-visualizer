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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-clay-800">
            Showroom Catalog
          </span>
          <h1 className="mt-2 font-display text-3xl text-stone-900 sm:text-4xl">Virtual Trial Room Catalog</h1>
          <p className="mt-2 text-stone-600">
            Browse real showroom tiles and try them instantly in your actual room photo.
          </p>
        </div>
        <Link to="/upload">
          <Button variant="outline">Upload Room Photo</Button>
        </Link>
      </div>

      <div className="mt-8">
        <TileFilters filters={filters} onChange={setFilters} />
      </div>

      <p className="mt-4 text-sm text-stone-400">{loading ? "Loading…" : `${total} tile${total === 1 ? "" : "s"} found`}</p>

      <div className="mt-4">
        <TileGrid tiles={tiles} selectedTileId={selectedTile?.id} onSelect={selectTile} loading={loading} />
      </div>

      {selectedTile && (
        <Card className="sticky bottom-4 mt-10 border-stone-900 shadow-xl">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500">Selected for Trial</p>
                <p className="font-display text-lg font-semibold text-stone-900">{selectedTile.name}</p>
              </div>
            </div>
            <Link to="/upload">
              <Button size="lg" className="shadow-md">
                TRY IN MY SPACE →
              </Button>
            </Link>
          </CardBody>
        </Card>
      )}
    </PageContainer>
  );
}
