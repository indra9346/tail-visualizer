import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ErrorState } from "@/components/ui/ErrorState";
import { TilePickerModal } from "@/components/design/TilePickerModal";
import { TileThumb } from "@/components/design/TileThumb";
import { PhotoMarker, type MarkTool } from "@/components/quick/PhotoMarker";
import { TileChooser } from "@/components/quick/TileChooser";
import { STYLE_NAMES, StylePicker } from "@/components/quick/StylePicker";
import { ActionBar, FlowHeader, Question, Screen, bigButton } from "@/components/simple/Flow";
import { Icon, type IconName } from "@/components/simple/Icon";
import { analyzeRoom, autoMarkRoom, getRoom, getRoomAnalysis } from "@/api/rooms";
import { fetchAllTiles, getTileRecommendations } from "@/api/tiles";
import { generateVisualization } from "@/api/visualizations";
import { getBillingSummary } from "@/api/billing";
import { ApiClientError, friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import { cn } from "@/lib/cn";
import { PATTERNS, rolesFor } from "@/lib/designPatterns";
import { MAX_AREAS, tileFitsSurface } from "@/lib/designDraft";
import { DEFAULT_FILL_LEVEL, addRegion, cloneMask, decodeMask, emptyMask, growRegion, maskColour, maskCss, paintedCount, removeRegion, resampleMask, type AreaMask, type FillLevel } from "@/lib/areaMask";
import {
  QUICK_SURFACES,
  chosen,
  clearQuickDraft,
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
import { photosFrom, usePhotosLeft } from "@/lib/usePhotosLeft";
import { localPhotoUrl, useRoomPhoto, useTileImages } from "@/lib/useRoomPhoto";
import { getPublicTileImageUrl } from "@/lib/tileImage";
import type { Design, RoomAnalysis, SurfaceType, Tile } from "@/api/types";

type Step = { kind: "what" } | { kind: "mark"; key: string } | { kind: "tile"; key: string } | { kind: "style"; key: string } | { kind: "review" };

/** "Edit / Try another tile" on a result passes the design that was generated. */
interface EditState {
  editDesign?: Design;
  editTiles?: Tile[];
  editRequirements?: string;
}

type Snapshot = Map<string, AreaMask | null>;

/** What the owner can change, as one picture each. A choice can cover two surfaces (floor + walls, steps). */
const CHOICES: Array<{ id: string; title: string; hint: string; icon: IconName; surfaces: SurfaceType[] }> = [
  { id: "floor", title: "Floor", hint: "The ground you walk on", icon: "floor", surfaces: ["floor"] },
  { id: "walls", title: "Walls", hint: "Any wall, inside or outside", icon: "wall", surfaces: ["wall"] },
  { id: "both", title: "Floor + walls", hint: "The whole room", icon: "room", surfaces: ["floor", "wall"] },
  { id: "kitchen", title: "Kitchen wall", hint: "Behind the stove", icon: "kitchen", surfaces: ["backsplash"] },
  { id: "shower", title: "Shower area", hint: "Bathroom wet wall", icon: "shower", surfaces: ["shower_wall"] },
  { id: "steps", title: "Steps", hint: "Top and front of steps", icon: "steps", surfaces: ["step_tread", "step_riser"] },
];
const SURFACE_ICON: Record<SurfaceType, IconName> = { floor: "floor", wall: "wall", backsplash: "kitchen", shower_wall: "shower", step_tread: "steps", step_riser: "steps" };

const GENERATION_STAGES = ["Photo sent", "Finding the marked parts", "Laying the tiles", "Matching light and shadow", "Finishing your photo"];
const BRUSH = { thin: 2.2, thick: 5.5 } as const;

const sameStep = (a: Step, b: Step) => a.kind === b.kind && (a.kind === "what" || a.kind === "review" || ("key" in b && "key" in a && a.key === b.key));
const sameSet = (a: SurfaceType[], b: SurfaceType[]) => a.length === b.length && a.every((s) => b.includes(s));

/**
 * The 4 steps of a new design, one question per screen in words anyone can follow:
 *   1. Room photo           (QuickUploadPage)
 *   2. What to change, then show where (tap the photo; Add / Remove to fix)
 *   3. Pick a tile          (it shows on the photo at once; Style for 2-3 tile layouts)
 *   4. Check and make the real photo
 * The marks go to the AI as a guide image, so it tiles exactly the spots the owner coloured.
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

  // ---- the photo check (analysis) runs in the background while the owner marks and picks ----
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
        // Read first: an existing photo check is reused, never paid for twice.
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

  // ---- photos left (credits shown as photos) ----
  const wallet = usePhotosLeft();
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => setBalance(wallet.balance), [wallet.balance]);
  const cost = wallet.cost;
  const photosLeft = balance !== null && cost !== null ? photosFrom(balance, cost) : null;

  // ---- the design ----
  const [areas, setAreas] = useState<QuickArea[] | null>(null);
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>({ kind: "what" });
  const [choice, setChoice] = useState<string | null>(null);

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
  // The style screen belongs to its tile step.
  const position: Step = step.kind === "style" ? { kind: "tile", key: step.key } : step;
  const stepIndex = Math.max(0, sequence.findIndex((s) => sameStep(s, position)));
  const activeKey = step.kind === "mark" || step.kind === "tile" || step.kind === "style" ? step.key : null;
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
    if (step.kind !== "what" || !areas) return;
    const surfaces = [...new Set(areas.map((a) => a.surface))];
    setChoice(CHOICES.find((c) => sameSet(c.surfaces, surfaces))?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);

  // A step whose area was removed falls back to the summary.
  useEffect(() => {
    if (areas && activeKey && !areas.some((a) => a.key === activeKey)) setStep({ kind: "review" });
  }, [areas, activeKey]);

  const update = (key: string, fn: (a: QuickArea) => QuickArea) => setAreas((prev) => prev?.map((a) => (a.key === key ? fn(a) : a)) ?? prev);

  // The choice on the first screen becomes areas (one per surface); surfaces no longer chosen are removed.
  function confirmWhat() {
    const picked = new Set(CHOICES.find((c) => c.id === choice)?.surfaces ?? []);
    if (picked.size === 0) return;
    const current = areas ?? [];
    const kept = current.filter((a) => picked.has(a.surface));
    const added = QUICK_SURFACES.filter((s) => picked.has(s.surface) && !kept.some((a) => a.surface === s.surface)).map((s) => newQuickArea(s.surface));
    let next = [...kept, ...added].slice(0, MAX_AREAS);
    // A tile chosen in the catalog ("Try in a room") goes into the first area it fits, once.
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
    setAddingPart(false);
    setAreas((prev) => [...(prev ?? []), area].slice(0, MAX_AREAS));
    setStep({ kind: "mark", key: area.key });
  }

  // ---- marking ----
  const [tool, setTool] = useState<MarkTool>("add");
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

  /** Remove: a tap clears the whole surface under the finger from every area. */
  function clearFrom(x: number, y: number) {
    if (!photo?.lab) return;
    const { width, height } = photo.grid;
    const region = growRegion(photo.lab, width, height, x, y, DEFAULT_FILL_LEVEL);
    pushUndo();
    setLastFill(null);
    setAreas(
      (prev) =>
        prev?.map((a) => {
          if (!a.mask) return a;
          const next = cloneMask(a.mask);
          removeRegion(next, region);
          return { ...a, mask: paintedCount(next) > 0 ? next : null };
        }) ?? prev,
    );
  }

  function onTap(x: number, y: number) {
    if (!active || !photo) return;
    if (!photo.lab) {
      setMarkNote("Tapping does not work on this photo. Rub your finger over the part to colour it.");
      return;
    }
    if (tool === "remove") return clearFrom(x, y);
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

  // ---- AI marking: the AI finds each new surface on the photo, so the owner only checks it ----
  const [autoState, setAutoState] = useState<Record<string, "pending" | "done" | "none">>({});
  // Switched off on the server (or failing): stop asking for the rest of this design.
  const autoOff = useRef(false);
  useEffect(() => {
    if (step.kind !== "mark" || !roomId || !photo || !areas || autoOff.current) return;
    // A surface with one area (two walls can only be told apart by the owner), nothing marked yet, never asked.
    const todo = areas.filter((a) => !a.mask && autoState[a.key] === undefined && areas.filter((o) => o.surface === a.surface).length === 1);
    if (todo.length === 0) return;
    const keys = new Set(todo.map((a) => a.key));
    const settle = (found: Set<SurfaceType>) => setAutoState((s) => ({ ...s, ...Object.fromEntries(todo.map((a) => [a.key, found.has(a.surface) ? ("done" as const) : ("none" as const)])) }));
    setAutoState((s) => ({ ...s, ...Object.fromEntries(todo.map((a) => [a.key, "pending" as const])) }));
    const grid = photo.grid;
    autoMarkRoom(roomId, todo.map((a) => a.surface))
      .then((res) => {
        if (!res.enabled) autoOff.current = true;
        const found = new Map(res.masks.map((m) => [m.surface, m.mask]));
        setAreas(
          (prev) =>
            prev?.map((a, _, all) => {
              // The owner's own marks always win: an area marked while the AI was working is left as it is.
              const text = keys.has(a.key) && !a.mask ? found.get(a.surface) : undefined;
              const decoded = text ? decodeMask(text) : null;
              if (!decoded) return a;
              const mine = resampleMask(decoded, grid.width, grid.height);
              // Never on a spot another area already has.
              for (const other of all) if (other.key !== a.key && other.mask && other.mask.width === grid.width && other.mask.height === grid.height) other.mask.cells.forEach((v, i) => v && (mine.cells[i] = 0));
              return paintedCount(mine) > 0 ? { ...a, mask: mine } : a;
            }) ?? prev,
        );
        settle(new Set(found.keys()));
      })
      .catch(() => {
        autoOff.current = true;
        settle(new Set());
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, roomId, photo, areas, autoState]);
  const aiWorking = active ? autoState[active.key] === "pending" && !active.mask : false;
  const aiMarked = active ? autoState[active.key] === "done" : false;

  // ---- tiles ----
  const [slot, setSlot] = useState(0);
  const [addingTile, setAddingTile] = useState(false);
  const [addingPart, setAddingPart] = useState(false);
  const keepSlot = useRef(false);
  useEffect(() => {
    // Opening an area's tile step points at its first empty slot (unless a part of the style picture was tapped).
    if (step.kind !== "tile" || !active) return;
    if (keepSlot.current) {
      keepSlot.current = false;
      return;
    }
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
    // The server needs the photo check; if it is still running, start as soon as it is done.
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
      clearQuickDraft(roomId);
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
      } else setGenerationError(friendlyErrorMessage(err, "The photo could not be made. Nothing was used. Please try again."));
    }
  }
  useEffect(() => {
    if (waitingForCheck && analysis) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingForCheck, analysis]);

  // ---- what the big button does on each screen ----
  const goNext = () => setStep(sequence[Math.min(sequence.length - 1, stepIndex + 1)]!);
  const goBack = () => {
    if (step.kind === "style") return setStep({ kind: "tile", key: step.key });
    return stepIndex === 0 ? navigate("/upload") : setStep(sequence[stepIndex - 1]!);
  };
  const activeTitle = active ? surfaceTitle(active.surface).toLowerCase() : "";
  const colour = maskColour(Math.max(0, activeIndex)).name.toLowerCase();
  const onlyOfKind = active ? list.filter((a) => a.surface === active.surface).length === 1 : false;
  const marked = active ? isMarked(active) : false;
  const nextAction = (() => {
    if (step.kind === "what") return { label: choice ? `Next: show the ${CHOICES.find((c) => c.id === choice)!.title.toLowerCase()}` : "Next", disabled: !choice, hint: choice ? "You can add more parts later" : "Tap what you want to change", run: confirmWhat };
    if (step.kind === "mark" && active) {
      if (marked) return { label: "Yes, correct", disabled: false, hint: `Not right? Use Add or Remove on the photo`, run: goNext };
      if (onlyOfKind) return { label: `Tile the whole ${activeTitle}`, disabled: false, hint: `Or tap the ${activeTitle} in the photo to show exactly where`, run: goNext };
      return { label: "Next: pick the tile", disabled: true, hint: `Colour this ${activeTitle} on the photo first`, run: goNext };
    }
    if (step.kind === "style") return { label: "Use this style", disabled: false, hint: null, run: () => setStep({ kind: "tile", key: step.key }) };
    if (step.kind === "tile" && active) {
      const missing = issues[active.key]?.find((m) => /^Pick/.test(m));
      return { label: stepIndex + 1 === sequence.length - 1 ? "Next: check & make photo" : "Next", disabled: Boolean(missing), hint: missing ?? null, run: goNext };
    }
    const first = issues["_"]?.[0] ?? Object.values(issues)[0]?.[0] ?? null;
    return { label: waitingForCheck ? "Getting ready…" : "Make real photo", disabled: !ready || waitingForCheck, hint: first, run: generate };
  })();

  // What the Listen button says on each screen.
  const listen =
    step.kind === "what"
      ? "What do you want to change? Tap a picture, then tap Next."
      : step.kind === "mark"
        ? marked
          ? `Is the ${colour} part the ${activeTitle}? If yes, tap Yes, correct. If not, tap Add and colour more, or tap Remove and rub away the wrong part.`
          : aiWorking
            ? `The AI is finding the ${activeTitle} on your photo. One moment. You can also tap it yourself.`
            : `Tap the ${activeTitle} in the photo. It turns ${colour}. Tap again on any part that was missed.`
        : step.kind === "tile"
          ? `Pick a tile for the ${activeTitle}. Tap a tile and it shows on your photo.`
          : step.kind === "style"
            ? "How should the tiles be laid? Tap a picture. Then tap Use this style."
            : "Check everything once. Then tap Make real photo. It uses one photo. If it fails, nothing is used.";

  // ---------- screens ----------

  if (roomError || photoFailed) {
    return (
      <Screen>
        <ErrorState
          message={roomError ?? "We couldn't show this room photo. Please check your internet and try again."}
          onRetry={() => {
            setRoomError(null);
            setPhotoUrl(null);
            setRoomAttempt((n) => n + 1);
          }}
        />
        <Link to="/upload" className={bigButton("secondary", "mt-4")}>
          <Icon name="camera" />
          Use another photo
        </Link>
      </Screen>
    );
  }

  if (generating) {
    return (
      <Screen>
        <div className="flex items-start gap-3">
          <Question sub="About 1 minute. Please keep this screen open.">Making your real photo…</Question>
        </div>
        <div className="relative mt-4 overflow-hidden rounded-[20px]">
          {photoUrl && <PhotoMarker photoUrl={photoUrl} photo={photo} areas={list} activeKey={null} mode="look" tool="add" brush={BRUSH.thick} tileImages={tileImages} onTap={() => undefined} onStroke={() => undefined} className="[--photo-vh:46vh]" />}
          <motion.div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/55 to-transparent" initial={{ x: "-120%" }} animate={{ x: "320%" }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
        </div>
        <ol className="mt-4 space-y-1 rounded-[18px] border-[1.5px] border-hairline bg-white px-4 py-3" aria-label="Progress">
          {GENERATION_STAGES.map((label, i) => (
            <li key={label} className={cn("flex min-h-10 items-center gap-3 text-base", i === stage ? "font-extrabold text-ink" : i < stage ? "text-ink" : "text-ink-secondary")}>
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", i < stage ? "bg-stone-900 text-white" : i === stage ? "animate-spin border-[3px] border-champagne-400 border-t-stone-900" : "border-2 border-[#C9D2C6]")}>
                {i < stage && <Icon name="check" className="h-4 w-4" strokeWidth={3} />}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <p className="mt-4 flex gap-3 rounded-2xl bg-sage-200 px-4 py-3 text-[15px] leading-snug text-ink">
          <Icon name="info" className="mt-0.5" />
          The photo is saved with this customer. If it fails, nothing is used.
        </p>
      </Screen>
    );
  }

  const headerStep: 2 | 3 | 4 = step.kind === "review" ? 4 : step.kind === "tile" || step.kind === "style" ? 3 : 2;
  const headerLabel =
    step.kind === "what"
      ? "What to change"
      : step.kind === "mark"
        ? `Mark the ${activeTitle}`
        : step.kind === "style"
          ? "Laying style"
          : step.kind === "tile"
            ? `Tile for the ${activeTitle}`
            : "Make real photo";

  const photoView = (mode: "mark" | "look", vh: string) =>
    photoUrl ? (
      <PhotoMarker photoUrl={photoUrl} photo={photo} areas={list} activeKey={activeKey} mode={mode} tool={tool} brush={BRUSH[brush]} tileImages={tileImages} onTap={onTap} onStroke={onStroke} className={vh} />
    ) : (
      <div className="aspect-[4/3] animate-pulse rounded-2xl bg-stone-200" aria-label="Loading your photo" />
    );

  return (
    <Screen wide={step.kind !== "what"}>
      <FlowHeader step={headerStep} label={headerLabel} onBack={goBack} listen={listen} />

      {step.kind === "what" && (
        <motion.section className="space-y-4" aria-labelledby="what-title" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <div className="relative h-48 overflow-hidden rounded-[20px] bg-stone-200 sm:h-56">
            {photoUrl && <img src={photoUrl} alt="The customer's room photo" className="h-full w-full object-cover" />}
            <span className="absolute bottom-2.5 left-2.5">
              <RoomCheck analysis={analysis} error={analysisError} onRetry={() => setAnalysisAttempt((n) => n + 1)} />
            </span>
          </div>
          {analysis && analysis.warnings.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl bg-[#FBF1DC] p-3.5 text-[#5C3D00]" role="status">
              <Icon name="alert" className="mt-0.5" />
              <div className="min-w-0 flex-1 text-[15px] leading-snug">
                <p className="font-bold">Photo check: {analysis.warnings[0]}</p>
                <p className="mt-0.5">The tiles may not look right. You can still go on.</p>
              </div>
              <Link to="/upload" className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-extrabold text-ink">
                Take again
              </Link>
            </div>
          )}
          <Question id="what-title">What do you want to change?</Question>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="What to change">
            {CHOICES.map((c) => {
              const on = choice === c.id;
              const seen = analysis ? c.surfaces.every((s) => analysis.recommendedSurfaces.includes(s)) && c.surfaces.length === 1 : false;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setChoice(c.id)}
                  className={cn(
                    "relative flex h-[120px] flex-col items-center justify-center gap-0.5 rounded-[18px] px-2.5 pb-2 pt-6 text-center transition-colors",
                    on ? "border-[2.5px] border-stone-900 bg-sage-200" : "border-2 border-[#D3DACF] bg-white hover:border-[#8E9A8F]",
                  )}
                >
                  {seen && <span aria-hidden="true" className="absolute left-2 top-2 rounded-full bg-[#F1E4C8] px-2 text-[11px] font-extrabold leading-[22px] text-[#6B5326]">IN PHOTO</span>}
                  {on && (
                    <span className="absolute right-2 top-2 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-stone-900 text-white" aria-hidden="true">
                      <Icon name="check" className="h-4 w-4" strokeWidth={3} />
                    </span>
                  )}
                  <Icon name={c.icon} className="h-9 w-9 text-ink" strokeWidth={1.7} />
                  <span className="text-[17px] font-extrabold leading-5 text-ink">{c.title}</span>
                  <span className="text-[13px] leading-4 text-ink-secondary">{c.hint}</span>
                </button>
              );
            })}
          </div>
        </motion.section>
      )}

      {step.kind !== "what" && (
        <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
          {/* On a phone the question comes first, then the photo, then the controls; on a laptop the photo is on the left. */}
          <motion.div key={`head-${step.kind}-${activeKey ?? ""}`} className="min-w-0 lg:col-start-2 lg:row-start-1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
            {active && list.length > 1 && <PartBadge index={activeIndex} title={surfaceTitle(active.surface)} />}
            {step.kind === "mark" && active && (
              <Question
                id="mark-title"
                sub={
                  marked
                    ? aiMarked
                      ? "Marked by AI. New tiles go only on the coloured part. Not right? Use Add or Remove."
                      : "New tiles go only on the coloured part. Everything else stays the same."
                    : aiWorking
                      ? "The AI is marking it for you. You can also tap it yourself."
                      : `It turns ${colour}. Tap again on any part that was missed.`
                }
              >
                {marked ? (
                  <>
                    Is the <span style={{ color: maskCss(activeIndex) }}>{colour} part</span> the {activeTitle}?
                  </>
                ) : aiWorking ? (
                  <>Finding the {activeTitle}…</>
                ) : (
                  <>Tap the {activeTitle} in the photo</>
                )}
              </Question>
            )}
            {step.kind === "tile" && active && (
              <Question id="tile-title" sub={marked ? "Tap a tile. It shows on your photo at once." : "Tap a tile."}>
                Pick a tile for the {activeTitle}
              </Question>
            )}
            {step.kind === "style" && active && (
              <Question id="style-title" sub={`On the ${activeTitle}. Tap a picture.`}>
                How to lay the tiles?
              </Question>
            )}
            {step.kind === "review" && (
              <Question id="review-title" sub="Check once, then make the real photo.">
                All ready?
              </Question>
            )}
          </motion.div>

          {/* Big while marking (a finger needs room to paint), smaller while choosing tiles so the tiles show sooner. */}
          <div className={cn("min-w-0 lg:sticky lg:top-6 lg:col-start-1 lg:row-span-2 lg:row-start-1", step.kind === "style" && "hidden lg:block")}>
            <div className="relative">
              {photoView(step.kind === "mark" ? "mark" : "look", step.kind === "mark" ? "[--photo-vh:46vh] lg:[--photo-vh:74vh]" : "[--photo-vh:34vh] lg:[--photo-vh:70vh]")}
              {step.kind === "mark" && aiWorking && (
                <span className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-white/95 px-3.5 py-2 text-sm font-extrabold text-ink shadow-md" role="status">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-champagne-400 border-t-stone-900" aria-hidden="true" />
                  AI is marking the {activeTitle}…
                </span>
              )}
            </div>
            {step.kind !== "mark" && list.some((a) => chosen(a).length > 0 && isMarked(a)) && (
              <p className="mt-2 text-center text-[13px] text-ink-secondary">Quick look · the real photo shows the tiles truly laid, with grout and real light.</p>
            )}
          </div>

          <motion.div key={`${step.kind}-${activeKey ?? ""}`} className="min-w-0 lg:col-start-2 lg:row-start-2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
            {step.kind === "mark" && active && (
              <section aria-labelledby="mark-title" className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Marking tool">
                  <ToolButton active={tool === "add"} onClick={() => setTool("add")} icon="plus" label={`Add ${colour}`} />
                  <ToolButton active={tool === "remove"} onClick={() => setTool("remove")} icon="eraser" label={`Remove ${colour}`} />
                </div>
                {lastFill && lastFill.key === active.key && tool === "add" && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-sage-200 px-3 py-2.5 text-[15px] text-ink" role="group" aria-label="Adjust the last fill">
                    <span className="flex-1 font-bold">Coloured the right part?</span>
                    <button type="button" onClick={() => nudgeFill(-1)} disabled={lastFill.level === 1} className="h-11 rounded-xl border-[1.5px] border-[#C9D2C6] bg-white px-3.5 font-extrabold disabled:opacity-40">
                      − Less
                    </button>
                    <button type="button" onClick={() => nudgeFill(1)} disabled={lastFill.level === 5} className="h-11 rounded-xl border-[1.5px] border-[#C9D2C6] bg-white px-3.5 font-extrabold disabled:opacity-40">
                      + More
                    </button>
                  </div>
                )}
                {markNote && (
                  <p role="status" className="rounded-2xl bg-[#FBF1DC] px-3 py-2.5 text-[15px] text-[#5C3D00]">
                    {markNote}
                  </p>
                )}
                <div className="flex gap-2">
                  <SmallTool onClick={undo} disabled={undoStack.length === 0} icon="undo">
                    Undo
                  </SmallTool>
                  <SmallTool onClick={() => setBrush((b) => (b === "thick" ? "thin" : "thick"))} label={brush === "thick" ? "Brush size: big. Tap for small" : "Brush size: small. Tap for big"}>
                    <span className={cn("rounded-full bg-ink", brush === "thick" ? "h-[18px] w-[18px]" : "h-2 w-2")} aria-hidden="true" />
                    Size
                  </SmallTool>
                  <SmallTool onClick={clearActive} disabled={!active.mask} icon="retry">
                    Start again
                  </SmallTool>
                </div>
                <p className="text-[15px] text-ink-secondary">
                  {tool === "add" ? "Tap a surface to fill it. Rub your finger to paint." : "Tap a surface to clear it. Rub your finger to rub away."}
                  {!marked && (onlyOfKind ? ` No time? Skip, and the AI tiles the whole ${activeTitle}.` : ` You have more than one ${activeTitle}: colour where this one is.`)}
                </p>
              </section>
            )}

            {step.kind === "tile" && active && (
              <section aria-labelledby="tile-title" className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border-[1.5px] border-hairline bg-white px-3 text-[15px]">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: maskCss(activeIndex) }} aria-hidden="true" />
                    <span className="truncate">
                      <b>{surfaceTitle(active.surface)}:</b> {chosen(active).map((t) => t.name).join(" + ") || "no tile yet"}
                    </span>
                  </span>
                  <button type="button" onClick={() => setStep({ kind: "style", key: active.key })} className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl bg-sage-200 px-3 text-[15px] font-extrabold text-ink hover:bg-sage-300">
                    <Icon name="layers" className="h-5 w-5" />
                    Style: {STYLE_NAMES[active.pattern]}
                  </button>
                </div>
                {PATTERNS[active.pattern].max > 1 && (
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which tile you are choosing">
                    {rolesFor(active.pattern, active.surface)
                      .slice(0, PATTERNS[active.pattern].max)
                      .map((role, i) => {
                        const tile = active.slots[i];
                        return (
                          <button key={role} type="button" role="radio" aria-checked={slot === i} onClick={() => setSlot(i)} className={cn("flex items-center gap-2 rounded-2xl px-2 py-1.5 text-left text-sm", slot === i ? "border-[2.5px] border-stone-900 bg-sage-200" : "border-[1.5px] border-hairline bg-white")}>
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-100 text-base font-bold text-ink-secondary">{tile ? <TileThumb tile={tile} /> : i + 1}</span>
                            <span>
                              <span className="block font-extrabold capitalize text-ink">{role}</span>
                              <span className="block text-ink-secondary">{tile ? tile.name : i < PATTERNS[active.pattern].min ? "Tap a tile below" : "Optional"}</span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
                <TileChooser tiles={catalog} loading={catalogLoading} surface={active.surface} recommendedIds={recommended} chosenIds={active.slots.map((t) => t?.id ?? "")} onPick={pickTile} onAddPhoto={() => setAddingTile(true)} />
              </section>
            )}

            {step.kind === "style" && active && (
              <section aria-labelledby="style-title" className="space-y-3">
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
                <div className="rounded-[18px] border-[1.5px] border-hairline bg-white px-3 pb-1.5 pt-3">
                  <h2 className="font-sans text-[15px] font-extrabold text-ink">
                    {PATTERNS[active.pattern].max > 1 ? `Pick a tile for each part (${PATTERNS[active.pattern].min === PATTERNS[active.pattern].max ? PATTERNS[active.pattern].max : `${PATTERNS[active.pattern].min}-${PATTERNS[active.pattern].max}`} tiles)` : `One tile for the whole ${activeTitle}`}
                  </h2>
                  {rolesFor(active.pattern, active.surface)
                    .slice(0, PATTERNS[active.pattern].max)
                    .map((role, i) => {
                      const tile = active.slots[i];
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => {
                            keepSlot.current = true;
                            setSlot(i);
                            setStep({ kind: "tile", key: active.key });
                          }}
                          className="flex min-h-[52px] w-full items-center gap-2.5 border-t border-[#EEF1EC] py-1.5 text-left first-of-type:border-t-0"
                        >
                          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-sage-200 text-sm font-extrabold">{i + 1}</span>
                          <span className="min-w-0 flex-1 text-[15px] leading-5">
                            <b className="capitalize">{role}</b>
                            <span className="block text-ink-secondary">{tile ? tile.name : i < PATTERNS[active.pattern].min ? "Not chosen yet" : "Optional"}</span>
                          </span>
                          {tile && (
                            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                              <TileThumb tile={tile} />
                            </span>
                          )}
                          <span className="shrink-0 text-sm font-extrabold underline">{tile ? "Change" : "Pick"}</span>
                        </button>
                      );
                    })}
                </div>
              </section>
            )}

            {step.kind === "review" && (
              <section aria-labelledby="review-title" className="space-y-3">
                <ul className="space-y-2.5">
                  {list.map((area, i) => {
                    const tiles = chosen(area);
                    const problem = issues[area.key]?.[0];
                    return (
                      <li key={area.key} className={cn("rounded-[18px] border-[1.5px] bg-white p-3", problem ? "border-amber-300" : "border-hairline")} aria-label={`Part ${i + 1}: ${surfaceTitle(area.surface)}`}>
                        <div className="flex items-center gap-2.5">
                          <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: maskCss(i) }} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="font-sans font-extrabold text-ink">{surfaceTitle(area.surface)}</p>
                            <p className="truncate text-sm text-ink-secondary">
                              {isMarked(area) ? "Marked on the photo" : `The whole ${surfaceTitle(area.surface).toLowerCase()}`} · {STYLE_NAMES[area.pattern]}
                            </p>
                          </div>
                          <div className="flex -space-x-2">
                            {tiles.map((t) => (
                              <span key={t.id} className="h-11 w-11 overflow-hidden rounded-[10px] border-2 border-white shadow">
                                <TileThumb tile={t} />
                              </span>
                            ))}
                          </div>
                        </div>
                        {tiles.length > 0 && <p className="mt-1.5 truncate text-[15px] text-ink">{tiles.map((t) => t.name).join(" + ")}</p>}
                        {problem && <p className="mt-1.5 text-[15px] text-amber-800">{problem}</p>}
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <MiniButton onClick={() => setStep({ kind: "tile", key: area.key })}>{tiles.length > 0 ? "Change tile" : "Pick tile"}</MiniButton>
                          <MiniButton onClick={() => setStep({ kind: "mark", key: area.key })}>Change marking</MiniButton>
                          <MiniButton onClick={() => setStep({ kind: "style", key: area.key })}>Style</MiniButton>
                          {list.length > 1 && (
                            <MiniButton danger onClick={() => setAreas((prev) => prev?.filter((a) => a.key !== area.key) ?? prev)}>
                              Remove
                            </MiniButton>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {list.length < MAX_AREAS &&
                  (addingPart ? (
                    <div className="rounded-[18px] border-[1.5px] border-dashed border-[#8E9A8F] p-3">
                      <p className="text-[15px] font-extrabold text-ink">What else should get new tiles?</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {QUICK_SURFACES.map((s) => (
                          <button key={s.surface} type="button" onClick={() => addArea(s.surface)} className="flex h-11 items-center gap-1.5 rounded-full border-[1.5px] border-[#C9D2C6] bg-white px-3.5 text-[15px] font-bold text-ink hover:border-stone-900">
                            <Icon name={SURFACE_ICON[s.surface]} className="h-5 w-5" /> + {s.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setAddingPart(true)} className="flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#8E9A8F] text-base font-extrabold text-ink hover:bg-sage-100">
                      <Icon name="plus" />
                      Add another part (floor, steps…)
                    </button>
                  ))}

                <NoteBox note={note} setNote={setNote} />

                <div className="flex items-center gap-3 rounded-2xl border-[1.5px] border-hairline bg-white px-3 py-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1E4C8] text-[#6B5326]">
                    <Icon name="camera" />
                  </span>
                  <div className="text-[15px] leading-5">
                    <p>
                      <b>Uses 1 photo</b>
                      {photosLeft !== null && <> · you have {photosLeft} left</>}
                    </p>
                    <p className="text-ink-secondary">If it fails, nothing is used.</p>
                  </div>
                </div>
                {(noCredits || lowCredits) && (
                  <div className="flex items-center gap-3 rounded-2xl bg-[#FBF1DC] px-3 py-2.5 text-[15px] font-bold text-[#5C3D00]">
                    <span className="flex-1">Not enough photos left.</span>
                    <Link to="/credits" className="rounded-xl bg-stone-900 px-3.5 py-2 text-white">
                      Add photos
                    </Link>
                  </div>
                )}
                {generationError && <ErrorState message={generationError} onRetry={generate} />}
                {waitingForCheck && !analysisError && (
                  <p className="text-[15px] text-ink-secondary" role="status">
                    Finishing the photo check, then your photo starts by itself…
                  </p>
                )}
              </section>
            )}
          </motion.div>
        </div>
      )}

      {/* One big button that always does the next right thing. Sticky inside the page column, so it never covers the photo controls. */}
      <ActionBar>
        <button
          type="button"
          onClick={nextAction.run}
          disabled={nextAction.disabled}
          className={bigButton("primary", cn(step.kind === "review" && "text-[19px]"))}
        >
          {step.kind === "review" && !nextAction.disabled && <Icon name="sparkles" />}
          {step.kind === "mark" && marked && <Icon name="check" strokeWidth={2.6} />}
          {nextAction.label}
          {(step.kind === "what" || step.kind === "tile" || (step.kind === "mark" && !marked)) && <Icon name="next" />}
        </button>
        {nextAction.hint && <p className="mt-1.5 truncate text-center text-sm text-ink-secondary">{nextAction.hint}</p>}
      </ActionBar>

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
    </Screen>
  );
}

function PartBadge({ index, title }: { index: number; title: string }) {
  return (
    <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-sage-200 px-3 py-1 text-sm font-bold text-ink">
      <span className="h-3.5 w-3.5 rounded-full" style={{ background: maskCss(index) }} aria-hidden="true" />
      Part {index + 1}: {title}
    </span>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: IconName; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn("flex h-16 items-center justify-center gap-2 rounded-2xl text-[17px] font-extrabold capitalize", active ? "border-2 border-stone-900 bg-stone-900 text-white" : "border-2 border-[#C9D2C6] bg-white text-ink hover:border-[#8E9A8F]")}
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

function SmallTool({ onClick, disabled, icon, label, children }: { onClick: () => void; disabled?: boolean; icon?: IconName; label?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[#C9D2C6] bg-white text-[15px] font-bold text-ink disabled:opacity-40">
      {icon && <Icon name={icon} className="h-5 w-5" />}
      {children}
    </button>
  );
}

function MiniButton({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("h-10 rounded-[10px] border-[1.5px] bg-white px-3 text-sm font-bold", danger ? "border-red-200 text-[#A23B2A] hover:bg-red-50" : "border-[#C9D2C6] text-ink hover:bg-sage-100")}>
      {children}
    </button>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
const speechRecognition = (): (new () => SpeechRecognitionLike) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** "Anything special?" — typed, or spoken where the phone can turn speech into text. */
function NoteBox({ note, setNote }: { note: string; setNote: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognizer = useRef<SpeechRecognitionLike | null>(null);
  const Recognition = speechRecognition();
  useEffect(() => () => recognizer.current?.stop(), []);
  function speak() {
    if (!Recognition) return;
    if (listening) return recognizer.current?.stop();
    const r = new Recognition();
    r.lang = "en-IN";
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (said) setNote([note.trim(), said].filter(Boolean).join(" ").slice(0, 1500));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognizer.current = r;
    setListening(true);
    r.start();
  }
  return (
    <div>
      <label htmlFor="design-note" className="mb-1.5 block text-[15px] font-extrabold text-ink">
        Anything special? <span className="font-medium text-ink-secondary">(you can skip)</span>
      </label>
      <div className="flex gap-2">
        <textarea
          id="design-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1500}
          rows={2}
          aria-label="Note for the designer"
          placeholder="e.g. dark grout, keep the window white"
          className="min-h-[52px] min-w-0 flex-1 rounded-2xl border-[1.5px] border-[#C9D2C6] bg-white px-3 py-3 text-base text-ink"
        />
        {Recognition && (
          <button type="button" onClick={speak} aria-pressed={listening} className={cn("flex h-[52px] shrink-0 items-center gap-1.5 rounded-2xl px-3.5 text-[15px] font-extrabold", listening ? "bg-stone-900 text-white" : "bg-sage-200 text-ink")}>
            <Icon name="mic" />
            {listening ? "Stop" : "Speak"}
          </button>
        )}
      </div>
    </div>
  );
}

function RoomCheck({ analysis, error, onRetry }: { analysis: RoomAnalysis | null; error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-[#A23B2A] shadow" role="alert">
        Photo check failed
        <button type="button" onClick={onRetry} className="underline">
          Try again
        </button>
      </span>
    );
  }
  if (!analysis) {
    return (
      <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-ink shadow" role="status">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" aria-hidden="true" />
        Checking your photo…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-extrabold text-[#1F6B43] shadow" role="status">
      <Icon name="check" className="h-4 w-4" strokeWidth={3} />
      Photo checked{analysis.roomType !== "other" ? `: ${analysis.roomType.replace(/_/g, " ")}` : ""}
    </span>
  );
}
