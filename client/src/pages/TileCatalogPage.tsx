import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { TileGrid } from "@/components/tiles/TileGrid";
import { TileFilters } from "@/components/tiles/TileFilters";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageBanner } from "@/components/ui/PageBanner";
import { ErrorState } from "@/components/ui/ErrorState";
import { friendlyErrorMessage } from "@/api/client";
import { searchTiles, type TileSearchFilters } from "@/api/tiles";
import { useWorkflow } from "@/context/WorkflowContext";
import type { Tile } from "@/api/types";

/** Catalog-only browsing (no room context yet) — used by the top nav and the landing page's "Explore Tiles" CTA. */
export function TileCatalogPage() {
  const { selectedTile, selectTile } = useWorkflow();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState<TileSearchFilters>({ page: 1, pageSize: 20 });
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  // Every search gets a number; a reply for an older search (the owner kept typing) is ignored.
  const requestSeq = useRef(0);

  const loadTiles = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await searchTiles({ ...filters, page: 1 });
      if (seq !== requestSeq.current) return;
      setTiles(res.tiles);
      setTotal(res.total);
      setPage(1);
    } catch (err) {
      if (seq === requestSeq.current) setError(friendlyErrorMessage(err, "We couldn't load the tile catalog."));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [filters]);

  /** The next page of the same search, added below the tiles already shown. */
  async function loadMore() {
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const res = await searchTiles({ ...filters, page: page + 1 });
      if (seq !== requestSeq.current) return;
      setTiles((prev) => [...prev, ...res.tiles.filter((t) => !prev.some((p) => p.id === t.id))]);
      setTotal(res.total);
      setPage(page + 1);
    } catch (err) {
      if (seq === requestSeq.current) setError(friendlyErrorMessage(err, "We couldn't load more tiles."));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadTiles();
  }, [loadTiles, reloadKey]);

  return (
    <PageContainer>
      <PageBanner
        scene="subway"
        tone="champagne"
        badge="Showroom Catalog • Verified Products"
        title="Showroom Tile Collection"
        subtitle="Explore genuine Italian marbles, porcelain slabs, handcrafted terracotta, and mosaics. Select any tile to launch an instant in-situ trial in your actual room."
        actions={
          <>
            <Link to="/upload">
              <Button size="lg" className="bg-champagne-500 hover:bg-champagne-400 text-ink font-semibold shadow-md">
                Try Tiles in Your Space →
              </Button>
            </Link>
            <Link to="/demos">
              <Button size="lg" variant="outline" className="border-hairline bg-surface-card text-ink hover:bg-white">
                Watch Live Video Demo
              </Button>
            </Link>
          </>
        }
      />

      <div className="mt-8">
        <TileFilters filters={filters} onChange={setFilters} />
      </div>

      {error ? (
        <div className="mt-6">
          <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-stone-400">
            {loading ? "Loading…" : `${total} tile${total === 1 ? "" : "s"} found${tiles.length < total ? `, showing ${tiles.length}` : ""}`}
          </p>

          <div className="mt-4">
            <TileGrid tiles={tiles} selectedTileId={selectedTile?.id} onSelect={selectTile} loading={loading} />
          </div>

          {!loading && tiles.length < total && (
            <div className="mt-6 flex justify-center">
              <Button size="lg" variant="outline" onClick={loadMore} loading={loadingMore}>
                Show more tiles ({total - tiles.length} more)
              </Button>
            </div>
          )}
        </>
      )}

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
