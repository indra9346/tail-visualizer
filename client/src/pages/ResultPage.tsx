import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { BeforeAfterSlider } from "@/components/visualization/BeforeAfterSlider";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconLink, Screen, bigButton } from "@/components/simple/Flow";
import { Icon, type IconName } from "@/components/simple/Icon";
import { getVisualization, deleteVisualization } from "@/api/visualizations";
import { getRoom } from "@/api/rooms";
import { listProjects } from "@/api/projectsRooms";
import { friendlyErrorMessage } from "@/api/client";
import { SURFACES } from "@/lib/designPatterns";
import { keptWalls } from "@/lib/roomLayouts";
import { cn } from "@/lib/cn";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { editPathFor, isQuickDesign, surfaceTitle } from "@/lib/quickDesign";
import { customerName } from "@/lib/customers";
import type { RoomUpload, Tile, Visualization } from "@/api/types";

const SHOP_NAME = "SDS Tiles & Ceramics";

/** Every tile of a result with the part it is on, for the tile list and the WhatsApp message. */
function resultTiles(viz: Visualization): Array<{ part: string; tile: Tile }> {
  if (viz.design && viz.design.areas.length > 0) {
    return viz.design.areas.flatMap((area) =>
      area.tileIds.flatMap((id) => {
        const tile = viz.designTiles?.find((t) => t.id === id);
        return tile ? [{ part: area.surface in SURFACES ? surfaceTitle(area.surface) : area.location, tile }] : [];
      }),
    );
  }
  return viz.tile ? [{ part: viz.appliedSurfaces.map((s) => SURFACES[s]?.label ?? s).join(" + "), tile: viz.tile }] : [];
}

export function ResultPage() {
  const { visualizationId } = useParams<{ visualizationId: string }>();
  const navigate = useNavigate();

  const [visualization, setVisualization] = useState<Visualization | null>(null);
  const [room, setRoom] = useState<RoomUpload | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshAttemptsRef = useRef(0);
  // The finished photo, fetched once it is ready, so "Send on WhatsApp" can share it at once (phones only allow
  // sharing straight after the tap).
  const photoFile = useRef<File | null>(null);
  const toggleViewerExpanded = useCallback(() => setViewerExpanded((current) => !current), []);

  useEffect(() => {
    if (!visualizationId) return;
    let cancelled = false;

    async function load() {
      try {
        const viz = await getVisualization(visualizationId!);
        if (cancelled) return;
        setVisualization(viz);

        // The original room photo stays private to its owner even when the visualization itself is public — a
        // signed-out visitor (or anyone other than the owner) simply won't get it back, and the page shows the
        // result alone.
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
        if (!cancelled) setError(friendlyErrorMessage(err, "We couldn't open this photo."));
      }
    }

    load();
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [visualizationId]);

  useEffect(() => {
    setViewerExpanded(false);
    setImageLoadError(false);
    refreshAttemptsRef.current = 0;
    photoFile.current = null;
  }, [visualizationId]);

  // The customer's name for the title (owner only: it comes from the room's project).
  useEffect(() => {
    if (!room?.projectId || !visualization?.isOwner) return;
    let cancelled = false;
    listProjects()
      .then((projects) => !cancelled && setCustomer(customerName(projects.find((p) => p.id === room.projectId)?.name)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [room?.projectId, visualization?.isOwner]);

  const resultUrl = visualization?.status === "completed" ? visualization.resultImageUrl : null;
  useEffect(() => {
    if (!resultUrl) return;
    let cancelled = false;
    fetch(resultUrl)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (!cancelled) photoFile.current = new File([blob], `sds-tiles-${visualizationId}.${blob.type.includes("png") ? "png" : "jpg"}`, { type: blob.type || "image/png" });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resultUrl, visualizationId]);

  // Signed image URLs are short-lived (5 minutes). On mobile, backgrounding the tab can delay the fetch past that
  // window, so the <img> fails even though the photo was made. Re-fetch the visualization (and room photo) to get
  // fresh signed URLs, a couple of times automatically, then fall back to a manual "Reload" the owner can tap.
  const MAX_AUTO_IMAGE_REFRESH = 2;

  const refreshImages = useCallback(async () => {
    if (!visualizationId) return;
    try {
      const viz = await getVisualization(visualizationId);
      setVisualization(viz);
      if (viz.roomUploadId) {
        try {
          setRoom(await getRoom(viz.roomUploadId));
        } catch {
          // Room photo may not be visible to this viewer (not the owner) — fine.
        }
      }
      setImageLoadError(false);
    } catch {
      setImageLoadError(true);
    }
  }, [visualizationId]);

  const handleImageError = useCallback(() => {
    if (refreshAttemptsRef.current >= MAX_AUTO_IMAGE_REFRESH) {
      setImageLoadError(true);
      // The "Reload" button sits under the viewer; leave full screen so it can be seen and tapped.
      setViewerExpanded(false);
      return;
    }
    refreshAttemptsRef.current += 1;
    refreshImages();
  }, [refreshImages]);

  async function photoBlob(): Promise<File> {
    if (photoFile.current) return photoFile.current;
    const response = await fetch(visualization!.resultImageUrl!);
    if (!response.ok) throw new Error(`download fetch failed with status ${response.status}`);
    const blob = await response.blob();
    photoFile.current = new File([blob], `sds-tiles-${visualization!.id}.png`, { type: blob.type || "image/png" });
    return photoFile.current;
  }

  async function handleDownload(): Promise<boolean> {
    if (!visualization?.resultImageUrl) return false;
    setDownloading(true);
    setNotice(null);
    try {
      // Fetches the actual bytes rather than navigating to the signed URL — a plain <a href download> is unreliable
      // cross-origin (Supabase Storage), and an expired link gets a clear message.
      const file = await photoBlob();
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      return true;
    } catch {
      setNotice("This download link may have expired. Refresh the page and try again.");
      return false;
    } finally {
      setDownloading(false);
    }
  }

  const tiles = visualization ? resultTiles(visualization) : [];
  const message = `${SHOP_NAME}: ${customer && customer !== "Walk-in customer" ? `${customer}, your` : "Your"} room with ${
    tiles.length > 0 ? tiles.map((t) => `${t.tile.name}${t.tile.sizeMm ? ` (${t.tile.sizeMm})` : ""}`).filter((v, i, a) => a.indexOf(v) === i).join(" + ") : "new tiles"
  }. See the photo.`;

  /** Shares the photo and a short message (phone share sheet → WhatsApp). Where a phone cannot share photos, the photo is saved and WhatsApp opens with the message. */
  async function shareOnWhatsApp() {
    if (!visualization?.resultImageUrl) return;
    setSharing(true);
    setNotice(null);
    try {
      const file = await photoBlob().catch(() => null);
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (file && typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], text: message });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }
      const saved = await handleDownload();
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      if (saved) setNotice("The photo is saved on this phone. In WhatsApp, pick the customer and attach the photo.");
    } finally {
      setSharing(false);
    }
  }

  if (error) {
    return (
      <Screen>
        <ErrorState message={error} />
        <Link to="/" className={bigButton("secondary", "mt-4")}>
          <Icon name="home" />
          Go to Home
        </Link>
      </Screen>
    );
  }

  if (!visualization) {
    return (
      <Screen>
        <Skeleton className="aspect-[3/4] w-full sm:aspect-[4/3]" />
      </Screen>
    );
  }

  const hasViewer = visualization.status === "completed" && Boolean(visualization.resultImageUrl);
  const layout = visualization.design?.layout ?? "open";
  // Walls of an L / C layout that were NOT tiled: they stay exactly as in the photo.
  const kept = layout !== "open" && visualization.design ? keptWalls(layout, visualization.design.areas.map((a) => a.wall)) : [];
  const owner = Boolean(visualization.isOwner);
  const quick = isQuickDesign(visualization.design);
  const editState = visualization.design ? { editDesign: visualization.design, editTiles: visualization.designTiles ?? [], editRequirements: visualization.requirements ?? "" } : undefined;
  const openEditor = () => navigate(editPathFor(visualization.design, visualization.roomUploadId!), { state: editState });
  const when = new Date(visualization.completedAt ?? visualization.createdAt);
  const whenText = Number.isNaN(when.getTime()) ? "" : when.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <Screen wide>
      <header className="flex items-center gap-3 pb-3">
        <IconLink to={owner ? "/" : undefined} onClick={owner ? undefined : () => navigate(-1)} label="Close" icon="close" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[22px] font-semibold leading-7 text-ink">{customer ?? "Your real photo"}</h1>
          <p className="text-sm text-ink-secondary">
            {visualization.status === "completed" ? "Real photo" : visualization.status === "failed" ? "Could not be made" : "Being made…"}
            {whenText && ` · ${whenText}`}
          </p>
        </div>
        {hasViewer && (
          <button type="button" onClick={toggleViewerExpanded} aria-label="Show big on the screen" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-hairline bg-white text-ink">
            <Icon name="expand" />
          </button>
        )}
      </header>

      {visualization.status === "failed" && (
        <section className="space-y-3 py-2 text-center" aria-labelledby="failed-title">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#FBEDEA] text-[#A23B2A]">
            <Icon name="retry" className="h-10 w-10" strokeWidth={1.8} />
          </span>
          <h2 id="failed-title" className="font-display text-[28px] font-semibold leading-[34px]">
            The photo could not be made
          </h2>
          <p className="text-[17px] text-ink">Nothing was used. You can try again.</p>
          {visualization.errorMessage && <p className="text-sm text-ink-secondary">{visualization.errorMessage}</p>}
          {owner && visualization.roomUploadId && (
            <div className="mx-auto max-w-md space-y-2.5 pt-2">
              <button type="button" onClick={openEditor} className={bigButton("primary")}>
                <Icon name="retry" />
                {quick ? "Try again" : "Edit Design / Try Another"}
              </button>
            </div>
          )}
        </section>
      )}

      {(visualization.status === "pending" || visualization.status === "generating") && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-[18px] border-[1.5px] border-hairline bg-white p-4" role="status">
          <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-champagne-400 border-t-stone-900" />
          <p className="text-base text-ink">Still making your photo — this screen updates by itself.</p>
        </motion.div>
      )}

      <div className={cn("grid gap-x-6 gap-y-3", hasViewer && "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start")}>
        {hasViewer && visualization.resultImageUrl && (
          <motion.div className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}>
            <BeforeAfterSlider
              beforeSrc={room?.imageUrl ?? undefined}
              afterSrc={visualization.resultImageUrl}
              beforeAlt="Before: the room as it was"
              afterAlt="After: the room with the new tiles"
              expanded={viewerExpanded}
              onToggleExpanded={toggleViewerExpanded}
              onAfterError={handleImageError}
              onBeforeError={handleImageError}
            />
            {imageLoadError && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FBF1DC] px-4 py-2.5 text-[15px] text-[#5C3D00]">
                <span>The photo did not load. This happens after the phone sits idle.</span>
                <button
                  type="button"
                  onClick={() => {
                    refreshAttemptsRef.current = 0;
                    refreshImages();
                  }}
                  className="h-10 shrink-0 rounded-xl bg-white px-3 font-bold text-ink"
                >
                  Reload photo
                </button>
              </div>
            )}
          </motion.div>
        )}

        <div className="min-w-0 space-y-3">
          {tiles.length > 0 && (
            <ul className="space-y-2" aria-label="Tiles in this photo">
              {tiles.map(({ part, tile }, i) => (
                <li key={`${tile.id}-${i}`} className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-hairline bg-white px-2.5 py-2">
                  <img
                    src={getPublicTileImageUrl(tile.storagePath)}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-[10px] object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                  />
                  <span className="min-w-0 flex-1 text-[15px] leading-5">
                    <b className="block truncate">
                      {part}: {tile.name}
                    </b>
                    <span className="text-ink-secondary">{[tile.sizeMm, tile.pricePerSqft != null ? `₹${tile.pricePerSqft}/sq ft` : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  {i === 0 && owner && visualization.roomUploadId && hasViewer && (
                    <button type="button" onClick={openEditor} className="h-10 shrink-0 rounded-xl border-[1.5px] border-[#C9D2C6] bg-white px-3 text-sm font-bold">
                      Not right?
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {kept.length > 0 && (
            <p className="rounded-2xl border-[1.5px] border-dashed border-hairline bg-white px-3 py-2.5 text-[15px] text-ink-secondary">
              <b className="text-ink">Kept as in your photo:</b> {kept.map((w) => w.label).join(", ")}. The new tile stops at the corner.
            </p>
          )}
          {visualization.requirements && (
            <p className="rounded-2xl border-[1.5px] border-hairline bg-white px-3 py-2.5 text-[15px] text-ink">
              <b>Note:</b> {visualization.requirements}
            </p>
          )}

          {hasViewer && owner && (
            <button type="button" onClick={shareOnWhatsApp} disabled={sharing} className={bigButton("whatsapp")}>
              <Icon name="whatsapp" />
              {sharing ? "Opening WhatsApp…" : customer && customer !== "Walk-in customer" && customer !== "Sample room" ? `Send to ${customer} on WhatsApp` : "Send on WhatsApp"}
            </button>
          )}
          {notice && (
            <p className="rounded-2xl bg-sage-200 px-3 py-2.5 text-[15px] text-ink" role="status">
              {notice}
            </p>
          )}

          <div className="grid grid-cols-4 gap-2">
            {owner && visualization.roomUploadId && (
              <ActionTile onClick={openEditor} icon="retry" label={quick ? "Try another tile" : "Edit Design / Try Another"} />
            )}
            {owner && hasViewer && <ActionTile to={`/quote?viz=${visualization.id}`} icon="calculator" label="Boxes & price" />}
            {owner && visualization.roomUploadId && <ActionTile to={`/compare/${visualization.roomUploadId}`} icon="compare" label="Compare tries" />}
            {hasViewer && <ActionTile onClick={() => void handleDownload()} icon="download" label={downloading ? "Saving…" : "Save to phone"} />}
          </div>

          {owner ? (
            <div className="flex items-center justify-between gap-3 pt-1 text-sm text-ink-secondary">
              <span>Saved with this customer automatically.</span>
              <button type="button" onClick={() => setConfirmingDelete(true)} className="h-10 rounded-xl px-2 font-bold text-[#A23B2A] hover:bg-red-50">
                Delete
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-secondary">This photo was shared by {SHOP_NAME}.</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this photo?"
        message="The real photo is deleted for good. The customer's room photo stays."
        onConfirm={async () => {
          try {
            await deleteVisualization(visualization.id);
          } catch (err) {
            throw new Error(friendlyErrorMessage(err, "We couldn't delete that photo. Please try again."));
          }
          navigate("/customers");
        }}
        onClose={() => setConfirmingDelete(false)}
      />
    </Screen>
  );
}

function ActionTile({ to, onClick, icon, label }: { to?: string; onClick?: () => void; icon: IconName; label: string }) {
  const cls = "flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-[#C9D2C6] bg-white px-1 py-2 text-center text-[13px] font-extrabold leading-4 text-ink hover:border-[#8E9A8F]";
  return to ? (
    <Link to={to} className={cls}>
      <Icon name={icon} />
      {label}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      <Icon name={icon} />
      {label}
    </button>
  );
}
