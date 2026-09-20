import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { TileGrid } from "@/components/tiles/TileGrid";
import { TileFilters } from "@/components/tiles/TileFilters";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProgressSteps, type Step } from "@/components/ui/ProgressSteps";
import { getRoomAnalysis } from "@/api/rooms";
import { getTileRecommendations, searchTiles, type TileSearchFilters } from "@/api/tiles";
import { generateVisualization } from "@/api/visualizations";
import { friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import type { RoomAnalysis, SurfaceType, Tile, TileRecommendation } from "@/api/types";

const GENERATION_STAGES = ["Preparing your room", "Applying selected tile", "Rendering realistic lighting", "Finalizing visualization"];

export function TilesPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { analysis: cachedAnalysis, selectedTile, selectedSurfaces, selectTile, setSurfaces, setAnalysis } = useWorkflow();

  const [analysis, setLocalAnalysis] = useState<RoomAnalysis | null>(cachedAnalysis);
  const [analysisLoading, setAnalysisLoading] = useState(!cachedAnalysis);

  const [recommendations, setRecommendations] = useState<TileRecommendation[] | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);

  const [catalogTiles, setCatalogTiles] = useState<Tile[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [filters, setFilters] = useState<TileSearchFilters>({ page: 1, pageSize: 12 });

  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Ensure we have the room's analysis (reused from context if present, otherwise a read-only fetch — never re-analyzes).
  useEffect(() => {
    if (!roomId || cachedAnalysis) return;
    let cancelled = false;
    getRoomAnalysis(roomId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          navigate(`/analysis/${roomId}`, { replace: true });
          return;
        }
        setLocalAnalysis(result);
        setAnalysis(result);
      })
      .finally(() => !cancelled && setAnalysisLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !analysis) return;
    setRecommendationsLoading(true);
    getTileRecommendations(roomId)
      .then((res) => setRecommendations(res.recommendations))
      .catch(() => setRecommendations([]))
      .finally(() => setRecommendationsLoading(false));
  }, [roomId, analysis]);

  useEffect(() => {
    setCatalogLoading(true);
    searchTiles(filters)
      .then((res) => setCatalogTiles(res.tiles))
      .catch(() => setCatalogTiles([]))
      .finally(() => setCatalogLoading(false));
  }, [filters]);

  function handleSelect(tile: Tile) {
    selectTile(tile);
  }

  function toggleSurface(surface: SurfaceType) {
    if (!selectedTile) return;
    if (selectedTile.category !== "both") return; // only "both" tiles allow a real choice
    const next = selectedSurfaces.includes(surface)
      ? selectedSurfaces.filter((s) => s !== surface)
      : [...selectedSurfaces, surface];
    if (next.length > 0) setSurfaces(next);
  }

  async function handleGenerate() {
    if (!roomId || !selectedTile || selectedSurfaces.length === 0) return;
    setGenerating(true);
    setGenerationError(null);
    setGenerationStage(0);

    const stageTimer = setInterval(() => {
      setGenerationStage((s) => Math.min(s + 1, GENERATION_STAGES.length - 1));
    }, 3000);

    try {
      const visualization = await generateVisualization({
        roomUploadId: roomId,
        tileId: selectedTile.id,
        surfaces: selectedSurfaces,
      });
      clearInterval(stageTimer);
      navigate(`/result/${visualization.id}`);
    } catch (err) {
      clearInterval(stageTimer);
      setGenerationError(friendlyErrorMessage(err, "We couldn't generate the visualization this time. Please try again."));
      setGenerating(false);
    }
  }

  const recommendedTiles = recommendations?.map((r) => r.tile) ?? [];
  const reasonsByTileId = Object.fromEntries((recommendations ?? []).map((r) => [r.tileId, r.reason]));
  const recommendedIds = new Set(recommendedTiles.map((t) => t.id));
  const catalogOnly = catalogTiles.filter((t) => !recommendedIds.has(t.id));

  if (generating) {
    const steps: Step[] = GENERATION_STAGES.map((label, i): Step => ({
      label,
      status: i < generationStage ? "done" : i === generationStage ? "active" : "pending",
    }));
    return (
      <PageContainer className="max-w-xl">
        <h1 className="font-display text-3xl text-stone-900">Generating your visualization</h1>
        <p className="mt-2 text-stone-600">This usually takes under a minute.</p>
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-8">
          <ProgressSteps steps={steps} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-stone-900">Choose a Tile</h1>
          <p className="mt-2 text-stone-600">Every tile shown is a real product from our catalog.</p>
        </div>
      </div>

      {generationError && (
        <div className="mt-6">
          <ErrorState message={generationError} onRetry={handleGenerate} />
        </div>
      )}

      {analysisLoading ? (
        <p className="mt-8 text-stone-400">Loading room details…</p>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="font-display text-xl text-stone-900">Recommended for your room</h2>
            <div className="mt-4">
              <TileGrid
                tiles={recommendedTiles}
                reasons={reasonsByTileId}
                selectedTileId={selectedTile?.id}
                onSelect={handleSelect}
                loading={recommendationsLoading}
                emptyTitle="No recommendations yet"
                emptyDescription="We couldn't find a strong match in the catalog for this room. Browse the full catalog below instead."
              />
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-xl text-stone-900">Browse the full catalog</h2>
            <div className="mt-4">
              <TileFilters filters={filters} onChange={setFilters} />
            </div>
            <div className="mt-4">
              <TileGrid
                tiles={catalogOnly}
                selectedTileId={selectedTile?.id}
                onSelect={handleSelect}
                loading={catalogLoading}
              />
            </div>
          </section>
        </>
      )}

      {selectedTile && (
        <Card className="sticky bottom-4 mt-10 border-stone-900">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-stone-500">Selected tile</p>
              <p className="font-display text-lg text-stone-900">{selectedTile.name}</p>
            </div>

            {selectedTile.category === "both" ? (
              <div className="flex items-center gap-3" role="group" aria-label="Choose surfaces">
                {(["floor", "wall"] as SurfaceType[]).map((surface) => (
                  <label key={surface} className="flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      checked={selectedSurfaces.includes(surface)}
                      onChange={() => toggleSurface(surface)}
                    />
                    {surface === "floor" ? "Floor" : "Wall"}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">
                Applies to: <span className="font-medium text-stone-900">{selectedTile.category === "floor" ? "Floor" : "Wall"}</span>
              </p>
            )}

            <Button size="lg" onClick={handleGenerate} disabled={selectedSurfaces.length === 0}>
              Visualize This Tile
            </Button>
          </CardBody>
        </Card>
      )}
    </PageContainer>
  );
}
