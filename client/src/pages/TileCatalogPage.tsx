import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { TileGrid } from "@/components/tiles/TileGrid";
import { TileFilters } from "@/components/tiles/TileFilters";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageBanner } from "@/components/ui/PageBanner";
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
      <PageBanner
        imageSrc="/images/banners/catalog_banner.jpg"
        badge="Showroom Catalog • Verified Products"
        title="Showroom Tile Collection"
        subtitle="Explore genuine Italian marbles, porcelain slabs, handcrafted terracotta, and mosaics. Select any tile to launch an instant in-situ trial in your actual room."
        actions={
          <>
            <Link to="/upload">
              <Button size="lg" className="bg-clay-500 hover:bg-clay-400 text-stone-950 font-semibold shadow-md">
                Try Tiles in Your Space →
              </Button>
            </Link>
            <Link to="/demos">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Watch Live Video Demo
              </Button>
            </Link>
          </>
        }
      />

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
