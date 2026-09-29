import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { friendlyErrorMessage } from "@/api/client";
import { listMyVisualizations, listPublicVisualizations, setVisualizationVisibility } from "@/api/visualizations";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { useAuth } from "@/context/AuthContext";
import type { Visualization } from "@/api/types";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success",
  pending: "warning",
  generating: "warning",
  failed: "danger",
};

const SURFACE_LABELS: Record<string, string> = { floor: "Floor", wall: "Wall", backsplash: "Backsplash", shower_wall: "Shower wall" };

/**
 * Real, database-backed "My Visualizations":
 *  - Signed out: the public feed — every visualization any owner has
 *    explicitly marked public (GET /api/visualizations/public, no auth).
 *  - Signed in: the caller's own history, public and private alike (GET
 *    /api/visualizations/history, owner-scoped), with a toggle to control
 *    which of their own results are visible on the public feed above.
 * Never demo/curated data — see the privacy model in migration 0011 and
 * server/db/visualizations.ts.
 */
export function MyVisualizationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Visualization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    setItems(null);
    setError(null);
    const load = user ? listMyVisualizations() : listPublicVisualizations();
    load
      .then(setItems)
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load visualizations.")));
  }, [authLoading, user]);

  async function toggleVisibility(v: Visualization) {
    const nextIsPublic = !v.isPublic;
    setTogglingId(v.id);
    try {
      await setVisualizationVisibility(v.id, nextIsPublic);
      setItems((prev) => prev?.map((item) => (item.id === v.id ? { ...item, isPublic: nextIsPublic } : item)) ?? prev);
    } catch (err) {
      setError(friendlyErrorMessage(err, "We couldn't update that visualization's visibility."));
    } finally {
      setTogglingId(null);
    }
  }

  if (authLoading) {
    return (
      <PageContainer className="max-w-6xl">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" aria-label="Loading" />
        </div>
      </PageContainer>
    );
  }

  if (error && items === null) {
    return (
      <PageContainer className="max-w-6xl">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-6xl">
      <h1 className="font-display text-3xl text-stone-900">My Visualizations</h1>
      <p className="mt-2 text-stone-600">
        {user
          ? "Every visualization you've generated, with its status and credit cost. Mark one public to show it on the feed everyone sees before signing in."
          : "Real visualizations generated on SDS TILES & CERAMICS that their owners have chosen to make public."}
      </p>
      {!user && (
        <p className="mt-1 text-sm text-stone-500">
          <Link to="/login" state={{ from: { pathname: "/my-visualizations" } }} className="font-medium text-stone-900 underline">
            Sign in
          </Link>{" "}
          to see your own private history too.
        </p>
      )}

      {error && items !== null && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-8">
        {items === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3]" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={user ? "No visualizations yet" : "No public visualizations yet"}
            description={
              user
                ? "Upload a room and generate your first tile visualization."
                : "No one has made a visualization public yet. Sign in and try one yourself."
            }
            action={
              <Link to={user ? "/upload" : "/login"} className="text-sm font-medium text-stone-900 underline">
                {user ? "Start a visualization" : "Sign in"}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((v) => (
              <Card key={v.id} className="overflow-hidden">
                <div className="aspect-[4/3] bg-stone-100">
                  {v.resultImageUrl ? (
                    <img src={v.resultImageUrl} alt="Generated visualization" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
                      {v.status === "failed" ? "Generation failed" : "Not ready yet"}
                    </div>
                  )}
                </div>
                <CardBody>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={STATUS_TONE[v.status] ?? "neutral"}>{v.status}</Badge>
                    {typeof v.creditsCharged === "number" && v.creditsCharged > 0 && (
                      <span className="text-xs text-stone-400">{v.creditsCharged} credits</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {v.tile && <img src={getPublicTileImageUrl(v.tile.storagePath)} alt={v.tile.name} className="h-8 w-8 rounded object-cover" />}
                    <p className="text-sm font-medium text-stone-900">{v.tile?.name ?? "Tile"}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {v.appliedSurfaces.map((s) => (
                      <Badge key={s} tone="clay">
                        {SURFACE_LABELS[s] ?? s}
                      </Badge>
                    ))}
                  </div>
                  {v.requirements && <p className="mt-2 line-clamp-2 text-xs text-stone-500">{v.requirements}</p>}
                  <p className="mt-3 text-xs text-stone-400">{new Date(v.createdAt).toLocaleString()}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {v.status === "completed" ? (
                      <Link to={`/result/${v.id}`} className="text-sm font-medium text-stone-900 underline">
                        View result
                      </Link>
                    ) : (
                      <span />
                    )}
                    {user && (
                      <button
                        type="button"
                        disabled={togglingId === v.id}
                        onClick={() => toggleVisibility(v)}
                        className="text-xs font-medium text-clay-700 hover:underline disabled:opacity-50"
                      >
                        {togglingId === v.id ? "Updating…" : v.isPublic ? "Make private" : "Make public"}
                      </button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
