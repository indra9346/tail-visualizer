import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { BeforeAfterSlider } from "@/components/visualization/BeforeAfterSlider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { getVisualization, deleteVisualization } from "@/api/visualizations";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PATTERNS, SURFACES } from "@/lib/designPatterns";
import { keptWalls } from "@/lib/roomLayouts";
import { cn } from "@/lib/cn";
import { getRoom } from "@/api/rooms";
import { friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import type { RoomUpload, Visualization } from "@/api/types";

export function ResultPage() {
  const { visualizationId } = useParams<{ visualizationId: string }>();
  const navigate = useNavigate();
  const { reset } = useWorkflow();

  const [visualization, setVisualization] = useState<Visualization | null>(null);
  const [room, setRoom] = useState<RoomUpload | null>(null);
  const [viewerExpanded, setViewerExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggleViewerExpanded = useCallback(() => {
    setViewerExpanded((current) => !current);
  }, []);

  useEffect(() => {
    if (!visualizationId) return;
    let cancelled = false;

    async function load() {
      try {
        const viz = await getVisualization(visualizationId!);
        if (cancelled) return;
        setVisualization(viz);

        // The original room photo stays private to its owner even when the
        // visualization itself is public — a signed-out visitor (or anyone
        // other than the owner) simply won't get it back, and that's fine:
        // the page falls back to showing the result image alone below.
        if (viz.roomUploadId) {
          try {
            const roomData = await getRoom(viz.roomUploadId);
            if (!cancelled) setRoom(roomData);
          } catch {
            if (!cancelled) setRoom(null);
          }
        }

        if (viz.status === "pending" || viz.status === "generating") {
          pollTimer.current = setTimeout(load, 3000);
        }
      } catch (err) {
        if (!cancelled) setError(friendlyErrorMessage(err, "We couldn't load this visualization."));
      }
    }

    load();
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [visualizationId]);

  useEffect(() => {
    setViewerExpanded(true);
  }, [visualizationId]);

  async function handleDownload() {
    if (!visualization?.resultImageUrl) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // Fetches the actual bytes rather than just navigating to the signed
      // URL — a plain <a href download> is unreliable cross-origin (Supabase
      // Storage), and this also lets us surface a clear message if the
      // short-lived signed URL has expired by the time the user clicks.
      const response = await fetch(visualization.resultImageUrl);
      if (!response.ok) throw new Error(`download fetch failed with status ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `visualization-${visualization.id}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError("This download link may have expired. Refresh the page and try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <PageContainer compact>
        <div className="mx-auto w-full max-w-xl">
          <ErrorState message={error} />
        </div>
      </PageContainer>
    );
  }

  if (!visualization) {
    return (
      <PageContainer compact>
        <div className="mx-auto w-full max-w-3xl">
          <Skeleton className="aspect-[4/3] w-full" />
        </div>
      </PageContainer>
    );
  }

  const hasViewer = visualization.status === "completed" && Boolean(visualization.resultImageUrl);
  const layout = visualization.design?.layout ?? "open";
  // Walls of an L / C layout that were NOT tiled: they stay exactly as in the photo.
  const kept = layout !== "open" && visualization.design ? keptWalls(layout, visualization.design.areas.map((a) => a.wall)) : [];

  return (
    <PageContainer compact className="max-w-7xl">
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-clay-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-clay-800">
              Virtual Trial Room Preview
            </span>
            <span className="hidden rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 sm:inline">
              In-Situ Transformation
            </span>
          </div>
          <h1 className="mt-1.5 font-display text-2xl text-stone-900 sm:text-3xl">Your Virtual Preview</h1>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={visualization.status}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <Badge tone={visualization.status === "completed" ? "success" : visualization.status === "failed" ? "danger" : "clay"}>
              {visualization.status === "completed"
                ? "Completed"
                : visualization.status === "failed"
                  ? "Failed"
                  : "Generating…"}
            </Badge>
          </motion.div>
        </AnimatePresence>
      </div>

      {visualization.status === "failed" && (
        <div className="mt-4">
          <ErrorState message={visualization.errorMessage ?? "We couldn't generate this visualization."} />
        </div>
      )}

      {(visualization.status === "pending" || visualization.status === "generating") && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5"
        >
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" />
          <motion.p
            className="text-sm text-stone-600"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            Still generating — this page will update automatically.
          </motion.p>
        </motion.div>
      )}

      {/* Picture on the left, design details and actions beside it on a laptop, so nothing important sits below the fold. */}
      <div className={cn("mt-4 grid gap-6", hasViewer && "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start")}>
      {hasViewer && visualization.resultImageUrl && (
        <motion.div
          className="min-w-0"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <BeforeAfterSlider
            beforeSrc={room?.imageUrl ?? undefined}
            afterSrc={visualization.resultImageUrl}
            beforeAlt="Original room before visualization"
            afterAlt="Room finished with the selected tile"
            expanded={viewerExpanded}
            onToggleExpanded={toggleViewerExpanded}
          />
        </motion.div>
      )}

      <div className="min-w-0">
      <motion.div
        className={cn("grid gap-3 sm:grid-cols-2", hasViewer ? "lg:grid-cols-1" : "lg:grid-cols-3")}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
      >
        {visualization.design && visualization.design.areas.length > 0 ? (
          visualization.design.areas.map((area, i) => {
            const tiles = area.tileIds.map((id) => visualization.designTiles?.find((t) => t.id === id));
            const surface = SURFACES[area.surface];
            return (
              <Card key={`${area.surface}-${area.location}-${i}`}>
                <CardBody className="py-4">
                  <p className="text-xs uppercase tracking-wide text-stone-400">
                    {surface?.label ?? area.surface} · {PATTERNS[area.pattern]?.label ?? area.pattern}
                  </p>
                  <p className="mt-0.5 truncate font-medium text-stone-900">{area.location}</p>
                  {area.patternNote && <p className="truncate text-xs text-stone-500">{area.patternNote}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tiles.map((tile, j) =>
                      tile ? (
                        <div key={tile.id + j} className="flex items-center gap-2">
                          <img
                            src={getPublicTileImageUrl(tile.storagePath)}
                            alt={tile.name}
                            className="h-9 w-9 shrink-0 rounded-md object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <span className="max-w-[9rem] truncate text-sm text-stone-700">{tile.name}</span>
                        </div>
                      ) : null,
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })
        ) : (
          <>
            <Card>
              <CardBody className="flex items-center gap-3 py-4">
                {visualization.tile && (
                  <img
                    src={getPublicTileImageUrl(visualization.tile.storagePath)}
                    alt={visualization.tile.name}
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-stone-400">Tile applied</p>
                  <p className="truncate font-medium text-stone-900">{visualization.tile?.name ?? "—"}</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="py-4">
                <p className="text-xs uppercase tracking-wide text-stone-400">Surfaces changed</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {visualization.appliedSurfaces.map((s) => (
                    <Badge key={s} tone="clay">
                      {SURFACES[s]?.label ?? s}
                    </Badge>
                  ))}
                </div>
              </CardBody>
            </Card>
          </>
        )}
        {kept.length > 0 && (
          <Card className="border-dashed">
            <CardBody className="py-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">Kept as in your photo</p>
              <p className="mt-0.5 font-medium text-stone-900">{kept.map((w) => w.label).join(", ")}</p>
              <p className="text-xs text-stone-500">Not tiled. The new tile stops at the corner.</p>
            </CardBody>
          </Card>
        )}
        {visualization.requirements && (
          <Card className="sm:col-span-2 lg:col-span-1">
            <CardBody className="py-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">Your requirements</p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-stone-700">{visualization.requirements}</p>
            </CardBody>
          </Card>
        )}
      </motion.div>

      {downloadError && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {downloadError}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2.5">
        {visualization.status === "completed" && visualization.resultImageUrl && (
          <Button size="md" variant="secondary" onClick={handleDownload} loading={downloading}>
            Save Visualization
          </Button>
        )}
        {visualization.isOwner && visualization.roomUploadId && (
          <Button size="md" onClick={() => navigate(`/tiles/${visualization.roomUploadId}`)}>
            Edit Design / Try Another
          </Button>
        )}
        {visualization.isOwner && (
          <Button size="md" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
        <Link to="/tiles">
          <Button size="md" variant="outline">
            View Tile Catalog
          </Button>
        </Link>
        {visualization.isOwner && (
          <Link to="/projects">
            <Button size="md" variant="ghost">
              Saved Projects
            </Button>
          </Link>
        )}
      </div>
      {visualization.isOwner ? (
        <p className="mt-2.5 text-xs text-stone-400">
          This project and visualization are already saved to your account automatically.
        </p>
      ) : (
        <p className="mt-2.5 text-xs text-stone-400">This is a visualization its owner has chosen to make public.</p>
      )}
      </div>
      </div>
    </div>
    <ConfirmDialog
      open={confirmingDelete}
      title="Delete visualization?"
      message="Delete this visualization and its generated image?"
      onConfirm={async () => {
        try {
          await deleteVisualization(visualization.id);
        } catch (err) {
          throw new Error(friendlyErrorMessage(err, "We couldn't delete that visualization. Please try again."));
        }
        navigate("/my-visualizations");
      }}
      onClose={() => setConfirmingDelete(false)}
    />
    </PageContainer>
  );
}
