import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProgressSteps, type Step as ProgressStep } from "@/components/ui/ProgressSteps";
import { TilePickerModal } from "@/components/design/TilePickerModal";
import { TileThumb } from "@/components/design/TileThumb";
import { PhotoMarker, type MarkTool } from "@/components/quick/PhotoMarker";
import { TileChooser } from "@/components/quick/TileChooser";
import { StylePicker } from "@/components/quick/StylePicker";
import { SurfaceIcon } from "@/components/quick/SurfaceIcon";
import { analyzeRoom, getRoom, getRoomAnalysis } from "@/api/rooms";
import { fetchAllTiles, getTileRecommendations } from "@/api/tiles";
import { generateVisualization } from "@/api/visualizations";
import { getBillingSummary, getCreditPackages } from "@/api/billing";
import { ApiClientError, friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import { cn } from "@/lib/cn";
import { PATTERNS, rolesFor } from "@/lib/designPatterns";
import { MAX_AREAS, tileFitsSurface } from "@/lib/designDraft";
import { DEFAULT_FILL_LEVEL, addRegion, cloneMask, emptyMask, growRegion, maskCss, paintedCount, removeRegion, type AreaMask, type FillLevel } from "@/lib/areaMask";
import {
  QUICK_SURFACES,
  chosen,
  isMarked,
  loadQuickDraft,
  newQuickArea,
  quickFromDesign,
  quickIssues,
  saveQuickDraft,
  surfaceTitle,
  toQuickPayload,
  withQuickPattern,
  withTile,
  type QuickArea,
} from "@/lib/quickDesign";
import { localPhotoUrl, useRoomPhoto, useTileImages } from "@/lib/useRoomPhoto";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import type { Design, RoomAnalysis, SurfaceType, Tile } from "@/api/types";

type Step = { kind: "what" } | { kind: "mark"; key: string } | { kind: "tile"; key: string } | { kind: "review" };

/** "Edit / Try another tile" on a result passes the design that was generated. */
interface EditState {
  editDesign?: Design;
  editTiles?: Tile[];
  editRequirements?: string;
}

type Snapshot = Map<string, AreaMask | null>;

const GENERATION_STAGES = ["Sending your photo and tiles", "Finding the marked areas", "Laying the tiles", "Matching light and shadow", "Finishing your photo"];
const BRUSH = { thin: 2.2, thick: 5.5 } as const;

const sameStep = (a: Step, b: Step) => a.kind === b.kind && (a.kind === "what" || a.kind === "review" || ("key" in b && a.key === b.key));

/**
 * The easy visualizer. One question per screen, in words anyone can follow:
 *   1. What do you want to tile?   (big picture buttons)
 *   2. Show us where               (tap the photo to colour that surface; paint / erase to fix)
 *   3. Pick a tile                 (big tile photos; an instant quick look on the photo)
 *   4. Check and make the real photo
 * The painted marks go to the AI as a guide image, so it tiles exactly the spots the owner coloured.
 */
export function QuickDesignPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { analysis: workflowAnalysis, setAnalysis: rememberAnalysis, setRoom, selectedTile, clearSelectedTile } = useWorkflow();
  const [editState] = useState<EditState | null>(() => (location.state as EditState | null) ?? null);

  // ---- the room photo ----
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => (roomId ? localPhotoUrl(roomId) : null));
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomAttempt, setRoomAttempt] = useState(0);
  useEffect(() => {
    if (!roomId) return;
    setRoom(roomId);
    if (photoUrl) return;
    let cancelled = false;
    getRoom(roomId)
      .then((room) => {
        if (cancelled) return;
        if (room.imageUrl) setPhotoUrl(room.imageUrl);
        else setRoomError("We couldn't open this room photo. Please upload it again.");
      })
      .catch((err) => !cancelled && setRoomError(friendlyErrorMessage(err, "We couldn't open this room. Check your internet and try again.")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, roomAttempt]);
  const { photo, failed: photoFailed } = useRoomPhoto(photoUrl);

  // ---- the room check (analysis) runs in the background while the owner marks and picks ----
  const cached = workflowAnalysis && workflowAnalysis.roomUploadId === roomId ? workflowAnalysis : null;
  const [analysis, setAnalysis] = useState<RoomAnalysis | null>(cached);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  useEffect(() => {
    if (!roomId || analysis) return;
    let cancelled = false;
    setAnalysisError(null);
    (async () => {
      try {
        // Read first: an existing room check is reused, never paid for twice.
        const existing = await getRoomAnalysis(roomId);
        const result = existing ?? (await analyzeRoom(roomId)).analysis;
        if (cancelled) return;
        setAnalysis(result);
        rememberAnalysis(result);
      } catch (err) {
        if (!cancelled) setAnalysisError(friendlyErrorMessage(err, "We couldn't check this room photo."));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, analysisAttempt]);

  // ---- the showroom's tiles ----
  const [catalog, setCatalog] = useState<Tile[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  useEffect(() => {
    fetchAllTiles()
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false));
  }, []);
  const [recommended, setRecommended] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!roomId || !analysis) return;
    getTileRecommendations(roomId)
      .then((res) => {
        setRecommended(new Set(res.recommendations.map((r) => r.tileId)));
        setReasons(Object.fromEntries(res.recommendations.map((r) => [r.tileId, r.reason])));
      })
      .catch(() => undefined);
  }, [roomId, analysis]);

  // ---- credits ----
  const [balance, setBalance] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  useEffect(() => {
    Promise.all([getBillingSummary(), getCreditPackages()])
      .then(([summary, pkgs]) => {
        setBalance(summary.balance);
        setCost(pkgs.generationCreditCost);
      })
      .catch(() => undefined);
  }, []);

  // ---- the design ----
  const [areas, setAreas] = useState<QuickArea[] | null>(null);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>({ kind: "what" });
  const [picked, setPicked] = useState<Set<SurfaceType>>(new Set());

  // Start from: the result being edited, else the draft from a refresh, else a blank design.
  useEffect(() => {
    if (!roomId || areas !== null) return;
    if (editState?.editDesign) {
      if (!editState.editTiles && catalogLoading) return;
      const edited = quickFromDesign(editState.editDesign, editState.editTiles ?? catalog);
      navigate(location.pathname, { replace: true, state: null });
      if (edited) {
        setAreas(edited);
        setNote(editState.editRequirements ?? "");
        setStep({ kind: "review" });
        return;
      }
    }
    const draft = loadQuickDraft(roomId);
    if (draft && draft.areas.length > 0) {
      setAreas(draft.areas);
      setNote(draft.note);
      setStep({ kind: "review" });
      return;
    }
    setAreas([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, catalogLoading]);

  useEffect(() => {
    if (roomId && areas) saveQuickDraft(roomId, { areas, note });
  }, [roomId, areas, note]);

  const list = areas ?? [];
  const sequence: Step[] = useMemo(() => [{ kind: "what" }, ...list.flatMap((a): Step[] => [{ kind: "mark", key: a.key }, { kind: "tile", key: a.key }]), { kind: "review" }], [list]);
  const stepIndex = Math.max(0, sequence.findIndex((s) => sameStep(s, step)));
  const activeKey = step.kind === "mark" || step.kind === "tile" ? step.key : null;
  const activeIndex = list.findIndex((a) => a.key === activeKey);
  const active = activeIndex >= 0 ? list[activeIndex]! : null;
  const issues = useMemo(() => quickIssues(list), [list]);
  const ready = list.length > 0 && Object.keys(issues).length === 0;

  // Every new screen starts at its question, not wherever the last one was scrolled to.
  useEffect(() => {
    if (typeof window.scrollTo === "function") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Coming back to the first screen shows what is already chosen.
  useEffect(() => {
    if (step.kind === "what" && areas) setPicked(new Set(areas.map((a) => a.surface)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  // A step whose area was removed falls back to the summary.
  useEffect(() => {
    if (areas && (step.kind === "mark" || step.kind === "tile") && !areas.some((a) => a.key === step.key)) setStep({ kind: "review" });
  }, [areas, step]);

  const update = (key: string, fn: (a: QuickArea) => QuickArea) => setAreas((prev) => prev?.map((a) => (a.key === key ? fn(a) : a)) ?? prev);

  // Surfaces chosen on the first screen become areas (one each); removing a surface removes its areas.
  function confirmWhat() {
    const current = areas ?? [];
    const kept = current.filter((a) => picked.has(a.surface));
    const added = QUICK_SURFACES.filter((s) => picked.has(s.surface) && !kept.some((a) => a.surface === s.surface)).map((s) => newQuickArea(s.surface));
    let next = [...kept, ...added].slice(0, MAX_AREAS);
    // A tile chosen in the catalog ("Try in my space") goes into the first area it fits, once.
    if (selectedTile?.isActive) {
      const target = next.find((a) => chosen(a).length === 0 && tileFitsSurface(selectedTile, a.surface));
      if (target) next = next.map((a) => (a.key === target.key ? withTile(a, 0, selectedTile) : a));
      clearSelectedTile();
    }
    setAreas(next);
    const firstNew = added[0] ?? next[0];
    if (firstNew) setStep(added.length > 0 ? { kind: "mark", key: firstNew.key } : { kind: "review" });
  }

  function addArea(surface: SurfaceType) {
    const area = newQuickArea(surface);
    setAreas((prev) => [...(prev ?? []), area].slice(0, MAX_AREAS));
    setStep({ kind: "mark", key: area.key });
  }

  // ---- marking ----
  const [tool, setTool] = useState<MarkTool>("fill");
  const [brush, setBrush] = useState<keyof typeof BRUSH>("thick");
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [lastFill, setLastFill] = useState<{ key: string; before: Snapshot; x: number; y: number; level: FillLevel } | null>(null);
  const [markNote, setMarkNote] = useState<string | null>(null);
  const snapshot = (): Snapshot => new Map(list.map((a) => [a.key, a.mask]));
  const pushUndo = () => setUndoStack((s) => [...s.slice(-29), snapshot()]);
  const restore = (snap: Snapshot) => setAreas((prev) => prev?.map((a) => (snap.has(a.key) ? { ...a, mask: snap.get(a.key) ?? null } : a)) ?? prev);

  function fillFrom(before: Snapshot, key: string, x: number, y: number, level: FillLevel) {
    if (!photo?.lab) return;
    const { width, height } = photo.grid;
    const region = growRegion(photo.lab, width, height, x, y, level);
    setAreas(
      (prev) =>
        prev?.map((a) => {
          const base = before.has(a.key) ? (before.get(a.key) ?? null) : a.mask;
          if (a.key === key) {
            const mine = base ? cloneMask(base) : emptyMask(width, height);
            addRegion(mine, region);
            return { ...a, mask: mine };
          }
          if (!base) return { ...a, mask: null };
          const theirs = cloneMask(base);
          removeRegion(theirs, region);
          return { ...a, mask: paintedCount(theirs) > 0 ? theirs : null };
        }) ?? prev,
    );
  }

  function onTap(x: number, y: number) {
    if (!active || !photo) return;
    if (!photo.lab) {
      setMarkNote("Tap-to-colour does not work on this photo. Use Paint and colour it with your finger.");
      setTool("paint");
      return;
    }
    const before = snapshot();
    pushUndo();
    fillFrom(before, active.key, x, y, DEFAULT_FILL_LEVEL);
    setLastFill({ key: active.key, before, x, y, level: DEFAULT_FILL_LEVEL });
    setMarkNote(null);
  }

  function nudgeFill(delta: 1 | -1) {
    if (!lastFill) return;
    const level = Math.min(5, Math.max(1, lastFill.level + delta)) as FillLevel;
    if (level === lastFill.level) return;
    fillFrom(lastFill.before, lastFill.key, lastFill.x, lastFill.y, level);
    setLastFill({ ...lastFill, level });
  }

  function onStroke(next: Snapshot) {
    pushUndo();
    setLastFill(null);
    setAreas((prev) => prev?.map((a) => (next.has(a.key) ? { ...a, mask: next.get(a.key) && paintedCount(next.get(a.key)!) > 0 ? next.get(a.key)! : null } : a)) ?? prev);
  }

  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    setLastFill(null);
    restore(last);
  }

  function clearActive() {
    if (!active?.mask) return;
    pushUndo();
    setLastFill(null);
    update(active.key, (a) => ({ ...a, mask: null }));
  }

  // ---- tiles ----
  const [slot, setSlot] = useState(0);
  const [addingTile, setAddingTile] = useState(false);
  useEffect(() => {
    // Opening an area's tile step points at its first empty slot.
    if (step.kind !== "tile" || !active) return;
    const empty = active.slots.findIndex((t) => t === null);
    setSlot(empty === -1 ? 0 : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  function pickTile(tile: Tile) {
    if (!active) return;
    const next = withTile(active, slot, tile);
    update(active.key, () => next);
    const empty = next.slots.findIndex((t, i) => t === null && i > slot);
    if (empty !== -1) setSlot(empty);
  }
  const chosenTiles = list.flatMap((a) => chosen(a));
  const tileImages = useTileImages(chosenTiles.filter((t, i) => chosenTiles.findIndex((o) => o.id === t.id) === i).map((t) => ({ id: t.id, url: getPublicTileImageUrl(t.storagePath) })));

  // ---- making the real photo ----
  const [generating, setGenerating] = useState(false);
  const [waitingForCheck, setWaitingForCheck] = useState(false);
  const [stage, setStage] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [noCredits, setNoCredits] = useState(false);
  const lowCredits = balance !== null && cost !== null && balance < cost;
  const started = useRef(false);

  async function generate() {
    if (!roomId || !areas || !ready || started.current) return;
    if (lowCredits) return setNoCredits(true);
    // The server needs the room check; if it is still running, start as soon as it is done.
    if (!analysis) {
      setWaitingForCheck(true);
      return;
    }
    started.current = true;
    setWaitingForCheck(false);
    setGenerating(true);
    setGenerationError(null);
    setNoCredits(false);
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, GENERATION_STAGES.length - 1)), 3500);
    try {
      const viz = await generateVisualization({ roomUploadId: roomId, design: toQuickPayload(areas), requirements: note.trim() });
      clearInterval(timer);
      navigate(`/result/${viz.id}`);
    } catch (err) {
      clearInterval(timer);
      started.current = false;
      setGenerating(false);
      if (err instanceof ApiClientError && err.code === "INSUFFICIENT_CREDITS") {
        setNoCredits(true);
        getBillingSummary()
          .then((s) => setBalance(s.balance))
          .catch(() => undefined);
      } else if (err instanceof ApiClientError && err.code === "GENERATION_IN_PROGRESS") {
        navigate("/my-visualizations");
      } else setGenerationError(friendlyErrorMessage(err, "We couldn't make the photo this time. Nothing was charged. Please try again."));
    }
  }
  useEffect(() => {
    if (waitingForCheck && analysis) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForCheck, analysis]);

  // ---- what the big button does on each screen ----
  const goNext = () => setStep(sequence[Math.min(sequence.length - 1, stepIndex + 1)]!);
  const goBack = () => (stepIndex === 0 ? navigate("/upload") : setStep(sequence[stepIndex - 1]!));
  const activeTitle = active ? surfaceTitle(active.surface).toLowerCase() : "";
  const onlyOfKind = active ? list.filter((a) => a.surface === active.surface).length === 1 : false;
  const nextAction = (() => {
    if (step.kind === "what") return { label: "Next", disabled: picked.size === 0, hint: picked.size === 0 ? "Tap what you want to tile" : null, run: confirmWhat };
    if (step.kind === "mark" && active) {
      if (isMarked(active)) return { label: "Next: pick the tile", disabled: false, hint: null, run: goNext };
      if (onlyOfKind) return { label: `Tile the whole ${activeTitle}`, disabled: false, hint: `Or tap the ${activeTitle} in the photo to show exactly where`, run: goNext };
      return { label: "Next: pick the tile", disabled: true, hint: `Colour this ${activeTitle} on the photo first`, run: goNext };
    }
    if (step.kind === "tile" && active) {
      const missing = issues[active.key]?.find((m) => /^Pick/.test(m));
      return { label: stepIndex + 1 === sequence.length - 1 ? "Next: check everything" : "Next", disabled: Boolean(missing), hint: missing ?? null, run: goNext };
    }
    const first = issues["_"]?.[0] ?? Object.values(issues)[0]?.[0] ?? null;
    return { label: waitingForCheck ? "Getting ready…" : "Make the real photo", disabled: !ready || waitingForCheck, hint: first, run: generate };
  })();

  // The question of each screen, shown above the photo on a phone.
  const stepHeader =
    step.kind === "mark" && active ? (
      <>
        <AreaBadge index={activeIndex} title={surfaceTitle(active.surface)} />
        <h1 id="mark-title" className="mt-2 font-display text-2xl text-stone-900 sm:text-3xl">
          Show us the {activeTitle}
        </h1>
        <p className="mt-1.5 text-base text-stone-600">
          {tool === "fill" ? (
            <>
              <strong>Tap on the {activeTitle}</strong> in the photo. It turns {colourWord(activeIndex)}. Tap again on any part we missed.
            </>
          ) : tool === "paint" ? (
            <>
              <strong>Rub your finger</strong> over the {activeTitle} to colour it.
            </>
          ) : (
            <>
              <strong>Rub over</strong> any colour that is in the wrong place to remove it.
            </>
          )}
        </p>
      </>
    ) : step.kind === "tile" && active ? (
      <>
        <AreaBadge index={activeIndex} title={surfaceTitle(active.surface)} />
        <h1 id="tile-title" className="mt-2 font-display text-2xl text-stone-900 sm:text-3xl">
          Pick a tile for the {activeTitle}
        </h1>
        <p className="mt-1.5 text-base text-stone-600">Tap a tile. {isMarked(active) ? "You will see it on your photo straight away." : ""}</p>
      </>
    ) : step.kind === "review" ? (
      <h1 id="review-title" className="font-display text-2xl text-stone-900 sm:text-3xl">
        Check and make the real photo
      </h1>
    ) : null;

  // ---------- screens ----------

  if (roomError || photoFailed) {
    return (
      <PageContainer className="max-w-xl">
        <ErrorState
          message={roomError ?? "We couldn't show this room photo. Please check your internet and try again."}
          onRetry={() => {
            setRoomError(null);
            setPhotoUrl(null);
            setRoomAttempt((n) => n + 1);
          }}
        />
        <Link to="/upload" className="mt-4 inline-block text-sm font-semibold text-clay-700 underline">
          Use another photo
        </Link>
      </PageContainer>
    );
  }

  if (generating) {
    const steps: ProgressStep[] = GENERATION_STAGES.map((label, i) => ({ label, status: i < stage ? "done" : i === stage ? "active" : "pending" }));
    return (
      <PageContainer className="max-w-3xl">
        <h1 className="font-display text-3xl text-stone-900">Making your real photo…</h1>
        <p className="mt-2 text-stone-600">This takes about a minute. Please keep this page open.</p>
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="relative overflow-hidden rounded-2xl">
            {photoUrl && <PhotoMarker photoUrl={photoUrl} photo={photo} areas={list} activeKey={null} mode="look" tool="fill" brush={BRUSH.thick} tileImages={tileImages} onTap={() => undefined} onStroke={() => undefined} />}
            <motion.div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/45 to-transparent" initial={{ x: "-120%" }} animate={{ x: "320%" }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <ProgressSteps steps={steps} />
          </div>
        </div>
      </PageContainer>
    );
  }

  const progress = Math.round(((stepIndex + 1) / sequence.length) * 100);
  const showPhoto = step.kind !== "what";

  return (
    <PageContainer compact className="max-w-6xl">
      {/* Where am I: one line and a bar, plus the room check running in the background. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-stone-500">{list.length > 0 ? `Step ${stepIndex + 2} of ${sequence.length + 1}` : "Step 2"}</p>
        <RoomCheck analysis={analysis} error={analysisError} onRetry={() => setAnalysisAttempt((n) => n + 1)} />
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="How far you are">
        <motion.div className="h-full rounded-full bg-clay-600" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
      </div>

          {step.kind === "what" && (
            <motion.section className="mt-6" aria-labelledby="what-title" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
              <h1 id="what-title" className="font-display text-3xl text-stone-900 sm:text-4xl">
                What do you want to tile?
              </h1>
              <p className="mt-2 text-base text-stone-600">Tap one or more. You can change this later.</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {QUICK_SURFACES.map(({ surface, title, hint }) => {
                  const on = picked.has(surface);
                  const suggested = analysis?.recommendedSurfaces.includes(surface);
                  return (
                    <button
                      key={surface}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (next.has(surface)) next.delete(surface);
                          else next.add(surface);
                          return next;
                        })
                      }
                      className={cn(
                        "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-center transition-all sm:p-5",
                        on ? "border-clay-600 bg-clay-50 text-stone-900 shadow-lg" : "border-stone-200 bg-white text-stone-700 hover:-translate-y-0.5 hover:border-stone-400",
                      )}
                    >
                      <SurfaceIcon surface={surface} className={cn("h-14 w-14", on ? "text-clay-700" : "text-stone-500")} />
                      <span className="text-lg font-semibold leading-tight">{title}</span>
                      <span className="text-xs text-stone-500">{hint}</span>
                      {suggested && <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-stone-900">Suggested</span>}
                      {on && (
                        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-clay-600 text-sm font-bold text-white" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {roomId && (
                <p className="mt-6 text-sm text-stone-500">
                  Need numbered walls, room templates or measurements?{" "}
                  <Link to={`/tiles/${roomId}`} className="font-semibold text-clay-700 underline">
                    Open the Advanced studio
                  </Link>
                </p>
              )}
            </motion.section>
          )}

          {showPhoto && (
            <div className="mt-4 grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
              {/* On a phone the step's question comes first, then the photo, then the controls; on a laptop the photo is on the left. */}
              <motion.div key={`head-${step.kind}-${activeKey ?? ""}`} className="min-w-0 lg:col-start-2 lg:row-start-1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                {stepHeader}
              </motion.div>
              {/* Big while marking (a finger needs room to paint), smaller while choosing tiles so the tiles show sooner. */}
              <div className={cn("min-w-0 lg:sticky lg:top-24 lg:col-start-1 lg:row-span-2 lg:row-start-1", step.kind === "mark" ? "[--photo-vh:70vh] lg:[--photo-vh:72vh]" : "[--photo-vh:45vh] lg:[--photo-vh:68vh]")}>
                {photoUrl ? (
                  <PhotoMarker
                    photoUrl={photoUrl}
                    photo={photo}
                    areas={list}
                    activeKey={activeKey}
                    mode={step.kind === "mark" ? "mark" : "look"}
                    tool={tool}
                    brush={BRUSH[brush]}
                    tileImages={tileImages}
                    onTap={onTap}
                    onStroke={onStroke}
                  />
                ) : (
                  <div className="aspect-[4/3] animate-pulse rounded-2xl bg-stone-200" aria-label="Loading your photo" />
                )}
                {step.kind !== "mark" && list.some((a) => chosen(a).length > 0 && isMarked(a)) && (
                  <p className="mt-2 text-center text-xs text-stone-500">Quick look: a free sketch to check which tile goes where. “Make the real photo” shows the tiles truly laid, with grout, cuts and real light.</p>
                )}
              </div>

              <motion.div key={`${step.kind}-${activeKey ?? ""}`} className="min-w-0 lg:col-start-2 lg:row-start-2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                {step.kind === "mark" && active && (
                  <section aria-labelledby="mark-title">
                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Marking tool">
                      <ToolButton active={tool === "fill"} onClick={() => setTool("fill")} icon="👆" label="Tap to colour" />
                      <ToolButton active={tool === "paint"} onClick={() => setTool("paint")} icon="🖌️" label="Paint" />
                      <ToolButton active={tool === "erase"} onClick={() => setTool("erase")} icon="🧽" label="Erase" />
                    </div>
                    {tool !== "fill" && (
                      <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Brush size">
                        {(["thin", "thick"] as const).map((b) => (
                          <button key={b} type="button" role="radio" aria-checked={brush === b} onClick={() => setBrush(b)} className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-medium", brush === b ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700")}>
                            {b === "thin" ? "Thin brush" : "Thick brush"}
                          </button>
                        ))}
                      </div>
                    )}
                    {lastFill && lastFill.key === active.key && tool === "fill" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-clay-50 px-3 py-2.5 text-sm text-clay-900" role="group" aria-label="Adjust the last fill">
                        <span className="font-medium">Did it colour the right part?</span>
                        <button type="button" onClick={() => nudgeFill(-1)} disabled={lastFill.level === 1} className="rounded-lg border border-clay-300 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">
                          − Less
                        </button>
                        <button type="button" onClick={() => nudgeFill(1)} disabled={lastFill.level === 5} className="rounded-lg border border-clay-300 bg-white px-3 py-1.5 font-semibold disabled:opacity-40">
                          + More
                        </button>
                      </div>
                    )}
                    {markNote && (
                      <p role="status" className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                        {markNote}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={undo} disabled={undoStack.length === 0} className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-40">
                        ↶ Undo
                      </button>
                      <button type="button" onClick={clearActive} disabled={!active.mask} className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-40">
                        Start again
                      </button>
                    </div>
                    <p className="mt-3 text-sm text-stone-500">
                      {isMarked(active) ? `✓ The ${activeTitle} is marked.` : onlyOfKind ? `No time? Skip this and we tile the whole ${activeTitle}.` : `You have more than one ${activeTitle}: colour where this one is.`}
                    </p>
                  </section>
                )}

                {step.kind === "tile" && active && (
                  <section aria-labelledby="tile-title">
                    {PATTERNS[active.pattern].max > 1 && (
                      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Which tile you are choosing">
                        {rolesFor(active.pattern, active.surface)
                          .slice(0, PATTERNS[active.pattern].max)
                          .map((role, i) => {
                            const tile = active.slots[i];
                            return (
                              <button key={role} type="button" role="radio" aria-checked={slot === i} onClick={() => setSlot(i)} className={cn("flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left text-xs", slot === i ? "border-clay-600 bg-clay-50" : "border-stone-200 bg-white")}>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-stone-100 text-base text-stone-400">{tile ? <TileThumb tile={tile} /> : i + 1}</span>
                                <span>
                                  <span className="block font-semibold capitalize text-stone-800">{role}</span>
                                  <span className="block text-stone-500">{tile ? tile.name : i < PATTERNS[active.pattern].min ? "Tap a tile below" : "Optional"}</span>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}

                    <div>
                      <TileChooser tiles={catalog} loading={catalogLoading} surface={active.surface} recommendedIds={recommended} chosenIds={active.slots.map((t) => t?.id ?? "")} onPick={pickTile} onAddPhoto={() => setAddingTile(true)} />
                    </div>

                    <details className="group mt-5 rounded-2xl border border-stone-200 bg-white p-3" open={active.pattern !== "single"}>
                      <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800">
                        Laying style: <span className="text-clay-700">{PATTERNS[active.pattern].label}</span> <span className="font-normal text-stone-500 group-open:hidden">(tap to change)</span>
                      </summary>
                      <div className="mt-3">
                        <StylePicker
                          surface={active.surface}
                          pattern={active.pattern}
                          tiles={chosen(active)}
                          onChange={(p) => {
                            const next = withQuickPattern(active, p);
                            update(active.key, () => next);
                            // The next tap fills the first empty slot of the new style, never replaces a tile already chosen.
                            const empty = next.slots.findIndex((t) => t === null);
                            setSlot(empty === -1 ? 0 : empty);
                          }}
                        />
                      </div>
                    </details>
                  </section>
                )}

                {step.kind === "review" && (
                  <section aria-labelledby="review-title">
                    <ul className="space-y-2.5">
                      {list.map((area, i) => {
                        const tiles = chosen(area);
                        const problem = issues[area.key]?.[0];
                        return (
                          <li key={area.key} className={cn("rounded-2xl border bg-white p-3", problem ? "border-amber-300" : "border-stone-200")} aria-label={`Area ${i + 1}: ${surfaceTitle(area.surface)}`}>
                            <div className="flex items-center gap-3">
                              <span className="h-5 w-5 shrink-0 rounded-full ring-2 ring-white" style={{ background: maskCss(i) }} aria-hidden="true" />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-stone-900">{surfaceTitle(area.surface)}</p>
                                <p className="truncate text-xs text-stone-500">
                                  {isMarked(area) ? "Marked on the photo" : `The whole ${surfaceTitle(area.surface).toLowerCase()}`} · {PATTERNS[area.pattern].label}
                                </p>
                              </div>
                              <div className="flex -space-x-2">
                                {tiles.map((t) => (
                                  <span key={t.id} className="h-10 w-10 overflow-hidden rounded-lg border-2 border-white shadow">
                                    <TileThumb tile={t} />
                                  </span>
                                ))}
                              </div>
                            </div>
                            {tiles.length > 0 && <p className="mt-1.5 truncate text-sm text-stone-700">{tiles.map((t) => t.name).join(" + ")}</p>}
                            {problem && <p className="mt-1.5 text-sm text-amber-800">{problem}</p>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <SmallButton onClick={() => setStep({ kind: "mark", key: area.key })}>Change marking</SmallButton>
                              <SmallButton onClick={() => setStep({ kind: "tile", key: area.key })}>{tiles.length > 0 ? "Change tile" : "Pick tile"}</SmallButton>
                              {list.length > 1 && (
                                <SmallButton danger onClick={() => setAreas((prev) => prev?.filter((a) => a.key !== area.key) ?? prev)}>
                                  Remove
                                </SmallButton>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {list.length < MAX_AREAS && (
                      <div className="mt-3 rounded-2xl border border-dashed border-stone-300 p-3">
                        <p className="text-sm font-semibold text-stone-700">Tile something else too?</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {QUICK_SURFACES.map((s) => (
                            <button key={s.surface} type="button" onClick={() => addArea(s.surface)} className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-stone-900">
                              <SurfaceIcon surface={s.surface} className="h-5 w-5" /> + {s.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <details className="mt-3 rounded-2xl border border-stone-200 bg-white p-3" open={note !== ""}>
                      <summary className="cursor-pointer list-none text-sm font-semibold text-stone-800">Add a note for the designer (optional)</summary>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={1500}
                        rows={3}
                        aria-label="Note for the designer"
                        placeholder="e.g. dark grout, keep the window frame white"
                        className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2 text-base"
                      />
                    </details>

                    <div className="mt-4 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-700">
                      {cost !== null && (
                        <p>
                          The real photo costs <strong>{cost} credits</strong>
                          {balance !== null && <> · you have <strong>{balance}</strong></>}. If it fails, nothing is charged.
                        </p>
                      )}
                      {(noCredits || lowCredits) && (
                        <p className="mt-2 font-medium text-amber-900">
                          Not enough credits.{" "}
                          <Link to="/credits" className="rounded-lg bg-stone-900 px-3 py-1.5 text-white no-underline">
                            Buy credits
                          </Link>
                        </p>
                      )}
                    </div>
                    {generationError && (
                      <div className="mt-3">
                        <ErrorState message={generationError} onRetry={generate} />
                      </div>
                    )}
                    {waitingForCheck && !analysisError && <p className="mt-3 text-sm text-stone-600" role="status">Finishing the room check, then your photo starts by itself…</p>}
                    {roomId && (
                      <p className="mt-4 text-xs text-stone-500">
                        Want numbered walls or measurements?{" "}
                        <Link to={`/tiles/${roomId}`} className="font-semibold text-clay-700 underline">
                          Advanced studio
                        </Link>
                      </p>
                    )}
                  </section>
                )}
              </motion.div>
            </div>
          )}

      {/* One big button that always does the next right thing, and Back. Sticky inside the page column, so it never covers the menu. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex items-center gap-3">
          <button type="button" onClick={goBack} className="shrink-0 rounded-xl border border-stone-300 bg-white px-4 py-3.5 text-base font-semibold text-stone-700 hover:bg-stone-50">
            ← Back
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={nextAction.run}
              disabled={nextAction.disabled}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-base font-bold shadow-md transition-colors sm:text-lg",
                nextAction.disabled ? "cursor-not-allowed bg-stone-300 text-stone-500" : step.kind === "review" ? "bg-clay-700 text-white hover:bg-clay-800" : "bg-stone-900 text-white hover:bg-stone-800",
              )}
            >
              {step.kind === "review" && !nextAction.disabled && <span aria-hidden="true">✨</span>}
              {nextAction.label}
              {step.kind !== "review" && <span aria-hidden="true">→</span>}
            </button>
            {nextAction.hint && <p className="mt-1 truncate text-center text-xs text-stone-500">{nextAction.hint}</p>}
          </div>
        </div>
      </div>

      <TilePickerModal
        open={addingTile && active !== null}
        onClose={() => setAddingTile(false)}
        surface={active?.surface ?? "floor"}
        slotLabel={active ? surfaceTitle(active.surface) : ""}
        recommendedIds={recommended}
        reasons={reasons}
        initialTab="custom"
        onPick={(tile) => {
          setCatalog((prev) => (prev.some((t) => t.id === tile.id) ? prev : [tile, ...prev]));
          pickTile(tile);
          setAddingTile(false);
        }}
      />
    </PageContainer>
  );
}

const COLOUR_WORDS = ["red", "blue", "green", "yellow", "pink", "sky blue"];
const colourWord = (i: number) => COLOUR_WORDS[i % COLOUR_WORDS.length]!;

function AreaBadge({ index, title }: { index: number; title: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700">
      <span className="h-3.5 w-3.5 rounded-full" style={{ background: maskCss(index) }} aria-hidden="true" />
      {title}
    </span>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-sm font-semibold", active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-400")}>
      <span className="text-xl" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}

function SmallButton({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-semibold", danger ? "border-red-200 text-red-700 hover:bg-red-50" : "border-stone-300 text-stone-700 hover:bg-stone-50")}>
      {children}
    </button>
  );
}

function RoomCheck({ analysis, error, onRetry }: { analysis: RoomAnalysis | null; error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <span className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-800" role="alert">
        Room check failed
        <button type="button" onClick={onRetry} className="font-bold underline">
          Try again
        </button>
      </span>
    );
  }
  if (!analysis) {
    return (
      <span className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600" role="status">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" aria-hidden="true" />
        Checking your room…
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800" role="status">
      ✓ Room checked{analysis.roomType !== "other" ? `: ${analysis.roomType.replace(/_/g, " ")}` : ""}
    </span>
  );
}
