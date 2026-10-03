import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { friendlyErrorMessage } from "@/api/client";
import { deleteVisualization, listMyVisualizations, setVisualizationVisibility } from "@/api/visualizations";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import { cn } from "@/lib/cn";
import { PATTERNS, SURFACES } from "@/lib/designPatterns";
import { groupByDate, visualizationSubtitle, visualizationTitle } from "@/lib/history";
import type { Visualization } from "@/api/types";

const STATUS: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string; dot: string }> = {
  completed: { tone: "success", label: "Ready", dot: "bg-emerald-500" },
  pending: { tone: "warning", label: "Waiting", dot: "bg-amber-400 animate-pulse" },
  generating: { tone: "warning", label: "Generating", dot: "bg-amber-400 animate-pulse" },
  failed: { tone: "danger", label: "Failed", dot: "bg-red-500" },
};
const IN_PROGRESS = new Set(["pending", "generating"]);
const POLL_MS = 5000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/**
 * The signed-in "Designs" page, laid out like a chat history: every visualization listed by day on the left,
 * the selected one shown large on the right. It refreshes by itself while anything is still generating.
 */
export function VisualizationHistory() {
  const [items, setItems] = useState<Visualization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetailOnPhone, setShowDetailOnPhone] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Visualization | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const next = await listMyVisualizations();
      if (mounted.current) {
        setItems(next);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(friendlyErrorMessage(err, "We couldn't load your designs."));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Real-time: while something is being generated, check again every few seconds.
  const anyRunning = items?.some((v) => IN_PROGRESS.has(v.status)) ?? false;
  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [anyRunning, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items) return [];
    if (!q) return items;
    return items.filter((v) => {
      const haystack = [visualizationTitle(v), visualizationSubtitle(v), v.tile?.name, v.requirements, v.roomType].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);
  const selected = filtered.find((v) => v.id === selectedId) ?? null;

  // Desktop shows a detail pane straight away, so pick the newest. Phones start on the list.
  useEffect(() => {
    if (!selected && filtered.length > 0 && window.matchMedia("(min-width: 1024px)").matches) setSelectedId(filtered[0]?.id ?? null);
  }, [selected, filtered]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteVisualization(pendingDelete.id);
    } catch (err) {
      throw new Error(friendlyErrorMessage(err, "We couldn't delete that design. Please try again."));
    }
    setItems((prev) => prev?.filter((v) => v.id !== pendingDelete.id) ?? prev);
    if (selectedId === pendingDelete.id) {
      setSelectedId(null);
      setShowDetailOnPhone(false);
    }
  }

  async function toggleVisibility(v: Visualization) {
    const next = !v.isPublic;
    setTogglingId(v.id);
    try {
      await setVisualizationVisibility(v.id, next);
      setItems((prev) => prev?.map((item) => (item.id === v.id ? { ...item, isPublic: next } : item)) ?? prev);
    } catch (err) {
      setError(friendlyErrorMessage(err, "We couldn't change that design's visibility."));
    } finally {
      setTogglingId(null);
    }
  }

  if (error && items === null) return <ErrorState message={error} />;

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      {/* History list */}
      <aside className={cn("flex min-h-0 flex-col rounded-2xl border border-stone-200 bg-white shadow-soft lg:h-[calc(100vh-11rem)]", showDetailOnPhone && "hidden lg:flex")} aria-label="Design history">
        <div className="space-y-3 border-b border-stone-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-xl text-stone-900">Design history</h1>
            <Link to="/projects">
              <Button size="sm">+ New design</Button>
            </Link>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search designs"
            aria-label="Search designs"
            className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm placeholder:text-stone-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-clay-500"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {items === null ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-sm text-stone-500">No designs yet. Upload a room and make your first one.</p>
          ) : groups.length === 0 ? (
            <p className="p-4 text-sm text-stone-500">Nothing matches that search.</p>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mb-3">
                <h2 className="sticky top-0 z-10 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400">{group.label}</h2>
                <ul>
                  {group.items.map((v) => {
                    const status = STATUS[v.status] ?? STATUS.pending!;
                    const active = v.id === selectedId;
                    return (
                      <li key={v.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(v.id);
                            setShowDetailOnPhone(true);
                          }}
                          aria-current={active ? "true" : undefined}
                          className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", active ? "bg-clay-100" : "hover:bg-stone-100")}
                        >
                          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-stone-200">
                            {v.resultImageUrl ? <img src={v.resultImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                            <span className={cn("absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", status.dot)} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-stone-900">{visualizationTitle(v)}</span>
                            <span className="block truncate text-xs text-stone-500">
                              {visualizationSubtitle(v) || status.label} · {timeLabel(v.createdAt)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(v)}
                          aria-label={`Delete ${visualizationTitle(v)}`}
                          title="Delete"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-stone-400 hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </aside>

      {/* Detail pane */}
      <section className={cn("min-w-0", !showDetailOnPhone && "hidden lg:block")} aria-live="polite">
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}
        {selected ? (
          <Detail
            v={selected}
            toggling={togglingId === selected.id}
            onBack={() => setShowDetailOnPhone(false)}
            onDelete={() => setPendingDelete(selected)}
            onToggle={() => toggleVisibility(selected)}
          />
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-500">
            {items && items.length > 0 ? "Pick a design from the list to see it here." : "Your finished designs will appear here."}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete design?"
        message={pendingDelete ? `Delete "${visualizationTitle(pendingDelete)}" and its generated image?` : ""}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

function Detail({ v, toggling, onBack, onDelete, onToggle }: { v: Visualization; toggling: boolean; onBack: () => void; onDelete: () => void; onToggle: () => void }) {
  const status = STATUS[v.status] ?? STATUS.pending!;
  const areas = v.design?.areas ?? [];
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
      <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 lg:hidden">
          ← History
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl text-stone-900">{visualizationTitle(v)}</h2>
          <p className="text-xs text-stone-500">{new Date(v.createdAt).toLocaleString()}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <div className="bg-stone-100">
        {v.resultImageUrl ? (
          <img src={v.resultImageUrl} alt={`Visualization: ${visualizationTitle(v)}`} className="mx-auto max-h-[60vh] w-full object-contain" />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center px-6 text-center text-sm text-stone-500">
            {IN_PROGRESS.has(v.status) ? (
              <span className="flex items-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" aria-hidden="true" />
                Your design is being generated. This page updates by itself.
              </span>
            ) : v.status === "failed" ? (
              (v.errorMessage ?? "This generation failed. Your credits were returned.")
            ) : (
              "No image yet."
            )}
          </div>
        )}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {areas.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {areas.map((a, i) => (
              <li key={`${a.surface}-${a.location}-${i}`} className="rounded-xl border border-stone-200 p-3">
                <p className="text-xs uppercase tracking-wide text-stone-400">
                  {SURFACES[a.surface]?.label ?? a.surface} · {PATTERNS[a.pattern]?.label ?? a.pattern}
                </p>
                <p className="truncate text-sm font-medium text-stone-900">{a.location}</p>
                {a.patternNote && <p className="truncate text-xs text-stone-500">{a.patternNote}</p>}
              </li>
            ))}
          </ul>
        ) : (
          v.tile && (
            <div className="flex items-center gap-3">
              <img src={getPublicTileImageUrl(v.tile.storagePath)} alt="" className="h-10 w-10 rounded-lg object-cover" />
              <p className="text-sm font-medium text-stone-900">{v.tile.name}</p>
            </div>
          )
        )}

        {v.requirements && (
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">Requirements</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{v.requirements}</p>
          </div>
        )}

        <p className="text-xs text-stone-400">
          {typeof v.creditsCharged === "number" && v.creditsCharged > 0 ? `${v.creditsCharged} credits · ` : ""}
          {v.isPublic ? "Public: shown on the signed-out feed" : "Private: only you can see this"}
        </p>

        <div className="flex flex-wrap gap-2.5">
          {v.status === "completed" && (
            <Link to={`/result/${v.id}`}>
              <Button size="md">Open full result</Button>
            </Link>
          )}
          {v.roomUploadId && (
            <Link to={`/tiles/${v.roomUploadId}`}>
              <Button size="md" variant="outline">
                Edit design
              </Button>
            </Link>
          )}
          <Button size="md" variant="outline" onClick={onToggle} loading={toggling}>
            {v.isPublic ? "Make private" : "Make public"}
          </Button>
          <Button size="md" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </article>
  );
}
