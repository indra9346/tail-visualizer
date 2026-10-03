import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { VisualizationHistory } from "@/components/history/VisualizationHistory";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { friendlyErrorMessage } from "@/api/client";
import { listPublicVisualizations } from "@/api/visualizations";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { visualizationSubtitle, visualizationTitle } from "@/lib/history";
import { useAuth } from "@/context/AuthContext";
import type { Visualization } from "@/api/types";

/**
 * Signed in: a chat-style history of the caller's own designs (see VisualizationHistory).
 * Signed out: the public feed, which only ever contains designs their owners chose to make public
 * (GET /api/visualizations/public). Never demo data; see the privacy model in migration 0011.
 */
export function MyVisualizationsPage() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <PageContainer className="max-w-6xl">
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" aria-label="Loading" />
        </div>
      </PageContainer>
    );
  }

  if (user) {
    return (
      <PageContainer className="max-w-7xl" compact>
        <VisualizationHistory />
      </PageContainer>
    );
  }
  return <PublicFeed />;
}

function PublicFeed() {
  const [items, setItems] = useState<Visualization[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPublicVisualizations()
      .then(setItems)
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load visualizations.")));
  }, []);

  if (error) {
    return (
      <PageContainer className="max-w-6xl">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-6xl">
      <h1 className="font-display text-3xl text-stone-900">Designs</h1>
      <p className="mt-2 text-stone-600">Real visualizations generated on SDS TILES &amp; CERAMICS that their owners have chosen to make public.</p>
      <p className="mt-1 text-sm text-stone-500">
        <Link to="/login" state={{ from: { pathname: "/my-visualizations" } }} className="font-medium text-stone-900 underline">
          Sign in
        </Link>{" "}
        to see your own design history.
      </p>

      <div className="mt-8">
        {items === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3]" />
            <Skeleton className="aspect-[4/3]" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No public designs yet"
            description="No one has made a design public yet. Sign in and try one yourself."
            action={
              <Link to="/login" className="text-sm font-medium text-stone-900 underline">
                Sign in
              </Link>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((v) => (
              <Card key={v.id} className="overflow-hidden">
                <div className="aspect-[4/3] bg-stone-100">
                  {v.resultImageUrl ? (
                    <img src={v.resultImageUrl} alt="Generated visualization" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">Not ready yet</div>
                  )}
                </div>
                <CardBody>
                  <div className="flex items-center gap-2">
                    {v.tile && <img src={getPublicTileImageUrl(v.tile.storagePath)} alt="" className="h-8 w-8 rounded object-cover" />}
                    <p className="truncate text-sm font-medium text-stone-900">{visualizationTitle(v)}</p>
                  </div>
                  <div className="mt-2">
                    <Badge tone="clay">{visualizationSubtitle(v) || "Design"}</Badge>
                  </div>
                  <p className="mt-3 text-xs text-stone-400">{new Date(v.createdAt).toLocaleDateString()}</p>
                  <Link to={`/result/${v.id}`} className="mt-3 inline-block text-sm font-medium text-stone-900 underline">
                    View result
                  </Link>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
