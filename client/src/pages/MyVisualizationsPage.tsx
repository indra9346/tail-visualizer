import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { friendlyErrorMessage } from "@/api/client";
import { listMyVisualizations } from "@/api/visualizations";
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

export function MyVisualizationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Visualization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    listMyVisualizations()
      .then(setItems)
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load your visualizations.")));
  }, [authLoading, user]);

  if (authLoading) {
    return (
      <PageContainer className="max-w-6xl">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" aria-label="Loading" />
        </div>
      </PageContainer>
    );
  }

  // Viewable without an account — but the visualizations themselves are
  // per-user data, so an unauthenticated visitor gets an inline sign-in
  // prompt here instead of being redirected away from the page.
  if (!user) {
    return (
      <PageContainer className="max-w-6xl">
        <h1 className="font-display text-3xl text-stone-900">My Visualizations</h1>
        <p className="mt-2 text-stone-600">Every visualization you've generated, with its status and credit cost.</p>
        <div className="mt-8">
          <EmptyState
            title="Sign in to see your visualizations"
            description="Your past visualizations are saved to your account. Sign in to view them here."
            action={
              <Link to="/login" state={{ from: { pathname: "/my-visualizations" } }}>
                <Button size="sm">Sign in</Button>
              </Link>
            }
          />
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer className="max-w-6xl">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-6xl">
      <h1 className="font-display text-3xl text-stone-900">My Visualizations</h1>
      <p className="mt-2 text-stone-600">Every visualization you've generated, with its status and credit cost.</p>

      <div className="mt-8">
        {items === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3]" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No visualizations yet"
            description="Upload a room and generate your first tile visualization."
            action={
              <Link to="/upload" className="text-sm font-medium text-stone-900 underline">
                Start a visualization
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
                  {v.status === "completed" && (
                    <Link to={`/result/${v.id}`} className="mt-3 block text-sm font-medium text-stone-900 underline">
                      View result
                    </Link>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
