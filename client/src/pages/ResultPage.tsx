import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { BeforeAfterSlider } from "@/components/visualization/BeforeAfterSlider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { getVisualization } from "@/api/visualizations";
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
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visualizationId) return;
    let cancelled = false;

    async function load() {
      try {
        const viz = await getVisualization(visualizationId!);
        if (cancelled) return;
        setVisualization(viz);

        if (viz.roomUploadId) {
          const roomData = await getRoom(viz.roomUploadId);
          if (!cancelled) setRoom(roomData);
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
      <PageContainer className="max-w-xl">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  if (!visualization) {
    return (
      <PageContainer className="max-w-4xl">
        <Skeleton className="aspect-[4/3] w-full" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-clay-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-clay-800">
              Virtual Trial Room Preview
            </span>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
              In-Situ Transformation
            </span>
          </div>
          <h1 className="mt-1.5 font-display text-3xl text-stone-900">Your Virtual Preview</h1>
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
        <div className="mt-6">
          <ErrorState message={visualization.errorMessage ?? "We couldn't generate this visualization."} />
        </div>
      )}

      {(visualization.status === "pending" || visualization.status === "generating") && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-6"
        >
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" />
          <motion.p
            className="text-sm text-stone-600"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            Still generating — this page will update automatically.
          </motion.p>
        </motion.div>
      )}

      {visualization.status === "completed" && visualization.resultImageUrl && room?.imageUrl && (
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <BeforeAfterSlider
            beforeSrc={room.imageUrl}
            afterSrc={visualization.resultImageUrl}
            beforeAlt="Original room before visualization"
            afterAlt="Room finished with the selected tile"
          />
        </motion.div>
      )}

      <motion.div
        className="mt-8 grid gap-6 sm:grid-cols-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: "easeOut" }}
      >
        <Card>
          <CardBody className="flex items-center gap-4">
            {visualization.tile && (
              <img
                src={getPublicTileImageUrl(visualization.tile.storagePath)}
                alt={visualization.tile.name}
                className="h-16 w-16 rounded-lg object-cover"
              />
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">Tile applied</p>
              <p className="font-medium text-stone-900">{visualization.tile?.name ?? "—"}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase tracking-wide text-stone-400">Surfaces changed</p>
            <div className="mt-1 flex gap-1.5">
              {visualization.appliedSurfaces.map((s) => (
                <Badge key={s} tone="clay">
                  {s === "floor" ? "Floor" : "Wall"}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {visualization.requirements && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.18, ease: "easeOut" }}>
          <Card className="mt-6">
            <CardBody>
              <p className="text-xs uppercase tracking-wide text-stone-400">Your requirements</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{visualization.requirements}</p>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {downloadError && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {downloadError}
        </p>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        {visualization.status === "completed" && visualization.resultImageUrl && (
          <Button size="lg" variant="secondary" onClick={handleDownload} loading={downloading}>
            Save Visualization
          </Button>
        )}
        {visualization.roomUploadId && (
          <Button size="lg" onClick={() => navigate(`/tiles/${visualization.roomUploadId}`)}>
            Try Another Tile
          </Button>
        )}
        {visualization.roomUploadId && (
          <Button size="lg" variant="outline" onClick={() => navigate(`/tiles/${visualization.roomUploadId}`)}>
            Compare Another Tile
          </Button>
        )}
        <Link to="/tiles">
          <Button size="lg" variant="outline">
            View Tile Catalog
          </Button>
        </Link>
        <Link to="/projects">
          <Button size="lg" variant="ghost">
            Saved Projects
          </Button>
        </Link>
      </div>
      <p className="mt-3 text-xs text-stone-400">
        This project and visualization are already saved to your account automatically.
      </p>
    </PageContainer>
  );
}
