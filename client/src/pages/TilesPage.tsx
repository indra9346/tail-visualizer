import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { ProgressSteps, type Step } from "@/components/ui/ProgressSteps";
import { AreaCard } from "@/components/design/AreaCard";
import { RoomTemplatePicker } from "@/components/design/RoomTemplatePicker";
import { TilePickerModal } from "@/components/design/TilePickerModal";
import { RequirementsInput } from "@/components/visualization/RequirementsInput";
import { getRoom, getRoomAnalysis } from "@/api/rooms";
import { fetchAllTiles, getTileRecommendations } from "@/api/tiles";
import { generateVisualization } from "@/api/visualizations";
import { getBillingSummary, getCreditPackages } from "@/api/billing";
import { ApiClientError, friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import { SURFACES, SURFACE_ORDER } from "@/lib/designPatterns";
import {
  MAX_AREAS,
  chosenTiles,
  distinctTileCount,
  draftFromDesign,
  loadDraft,
  newArea,
  saveDraft,
  tileFitsSurface,
  toPayload,
  uniqueLocation,
  validateDraft,
  type DraftArea,
  type LoadedDraft,
} from "@/lib/designDraft";
import type { RoomLayout } from "@/lib/roomLayouts";
import {
  TEMPLATES,
  applyTemplate,
  areaOfFace,
  ensureFace,
  faceOfArea,
  isTemplateId,
  keptLabels,
  templateForDesign,
  templateForLayout,
  toggleFace,
  type TemplateId,
} from "@/lib/roomTemplates";
import type { Design, RoomAnalysis, SurfaceType, Tile } from "@/api/types";

const GENERATION_STAGES = ["Preparing your room", "Placing each tile in its area", "Laying out your patterns", "Rendering realistic lighting", "Finalizing visualization"];

/** What "Edit Design / Try Another" on a result passes along: the design that was generated, to change it. */
interface EditState {
  editDesign?: Design;
  editTiles?: Tile[];
  editRequirements?: string;
}

export function TilesPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { analysis: workflowAnalysis, selectedTile, setAnalysis, clearSelectedTile } = useWorkflow();
  // The cached analysis is only this room's when its id says so: opening another room from Projects or History must
  // never seed its design (or show its warnings) from the previous room's photo.
  const cachedAnalysis = workflowAnalysis && workflowAnalysis.roomUploadId === roomId ? workflowAnalysis : null;
  // Read once: a refresh must restore the owner's latest draft, not this design again.
  const [editState] = useState<EditState | null>(() => (location.state as EditState | null) ?? null);

  const [analysis, setLocalAnalysis] = useState<RoomAnalysis | null>(cachedAnalysis);
  const [analysisLoading, setAnalysisLoading] = useState(!cachedAnalysis);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  // Said once after a click on a kept surface of the 3D box switched it on, so the change is never silent.
  const [faceNotice, setFaceNotice] = useState<string | null>(null);
  const [roomImage, setRoomImage] = useState<string | null>(null);

  const [areas, setAreas] = useState<DraftArea[] | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>("free");
  // The layout (numbered connected walls) always follows the chosen room template.
  const layout: RoomLayout = TEMPLATES[templateId].layout;
  const [picker, setPicker] = useState<{ areaKey: string; slot: number } | null>(null);
  const [recommendedIds, setRecommendedIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // The showroom's tiles, for the optional best-fit suggestions (the tile picker loads its own copy).
  const [catalog, setCatalog] = useState<Tile[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  // Only this surface is open for editing; the others show a one-line summary.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const closedAll = useRef(false);

  useEffect(() => {
    fetchAllTiles()
      .then(setCatalog)
      .catch(() => {
        /* suggestions are optional; the tile picker still works */
      })
      .finally(() => setCatalogLoaded(true));
  }, []);

  const [requirements, setRequirements] = useState("");
  const [showIssues, setShowIssues] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [insufficientCredits, setInsufficientCredits] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [generationCost, setGenerationCost] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getBillingSummary(), getCreditPackages()])
      .then(([summary, pkgs]) => {
        setBalance(summary.balance);
        setGenerationCost(pkgs.generationCreditCost);
      })
      .catch(() => {
        /* non-fatal: the server still enforces the real balance check on Generate */
      });
  }, []);

  // The room's analysis is reused (never re-run): from context if present, otherwise a read-only fetch.
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
      // Without this the page would say "Loading room details…" for ever after a network or server error.
      .catch((err) => !cancelled && setAnalysisError(friendlyErrorMessage(err, "We couldn't load this room. Check your connection and try again.")))
      .finally(() => !cancelled && setAnalysisLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, analysisAttempt]);

  // The customer's photo stays on screen so the owner can see which wall is which while designing.
  useEffect(() => {
    if (!roomId) return;
    getRoom(roomId)
      .then((room) => setRoomImage(room.imageUrl ?? null))
      .catch(() => setRoomImage(null));
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !analysis) return;
    getTileRecommendations(roomId)
      .then((res) => {
        setRecommendedIds(new Set(res.recommendations.map((r) => r.tileId)));
        setReasons(Object.fromEntries(res.recommendations.map((r) => [r.tileId, r.reason])));
      })
      .catch(() => {
        /* recommendations are a convenience; the full catalog is always available */
      });
  }, [roomId, analysis]);

  // Starting design: the result being edited, else the draft from a refresh, else one area per surface the analysis found worth tiling.
  useEffect(() => {
    if (!roomId || !analysis || areas !== null) return;
    // A design opened from History carries no tile details: they come from the catalog, so wait for it.
    if (editState?.editDesign && !editState.editTiles && !catalogLoaded) return;
    const edited = editState?.editDesign ? draftFromDesign(editState.editDesign, editState.editTiles ?? catalog) : null;
    const draft: LoadedDraft | null = edited ? { ...edited, requirements: editState?.editRequirements ?? "" } : loadDraft(roomId);
    if (edited) navigate(location.pathname, { replace: true, state: null });
    if (draft && draft.areas.length > 0) {
      if (edited) {
        // The server keeps only the layout: reuse the template of this room's draft when it matches, else infer it.
        const saved = loadDraft(roomId);
        setTemplateId(saved && saved.layout === draft.layout && isTemplateId(saved.template) ? saved.template : templateForDesign(draft.layout, draft.areas, analysis.roomType));
      } else setTemplateId(isTemplateId(draft.template) ? draft.template : templateForLayout(draft.layout));
      setAreas(draft.areas);
      // Opened in the same render as the design appears, so the first card never flashes closed.
      setActiveKey(draft.areas[0]!.key);
      if (draft.requirements) setRequirements(draft.requirements);
      return;
    }
    const surfaces: SurfaceType[] = analysis.recommendedSurfaces.length > 0 ? [...new Set(analysis.recommendedSurfaces)] : ["wall"];
    const seeded: DraftArea[] = surfaces.map((s) => ({ ...newArea(s), auto: true }));
    // A tile picked on the catalog page ("Try in my space") goes straight into the first area it fits, once.
    if (selectedTile && selectedTile.isActive) {
      const target = seeded.find((a) => tileFitsSurface(selectedTile, a.surface));
      if (target) target.slots[0] = selectedTile;
      clearSelectedTile();
    }
    setAreas(seeded);
    setActiveKey(seeded[0]?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, analysis, areas, catalogLoaded]);

  useEffect(() => {
    if (roomId && areas) saveDraft(roomId, areas, layout, templateId, requirements.trim() !== "" ? requirements : undefined);
  }, [roomId, areas, layout, templateId, requirements]);

  // Always keep one surface open: the first one, unless the owner closed them all on purpose or the open one was removed.
  useEffect(() => {
    if (!areas || areas.length === 0) return;
    if (activeKey !== null && !areas.some((a) => a.key === activeKey)) setActiveKey(areas[0]!.key);
    else if (activeKey === null && !closedAll.current) setActiveKey(areas[0]!.key);
  }, [areas, activeKey]);

  const issues = useMemo(() => validateDraft(areas ?? [], layout), [areas, layout]);
  const template = TEMPLATES[templateId];
  // Surfaces of the template the owner did not switch on: they stay exactly as in the photo.
  const keptLabelList = useMemo(() => (template.faces.length > 0 ? keptLabels(template, areas ?? []) : []), [template, areas]);
  const ready = areas !== null && Object.keys(issues).length === 0;
  const tileTotal = areas ? distinctTileCount(areas) : 0;
  const lowCredits = balance !== null && generationCost !== null && balance < generationCost;
  // Surfaces an extra area may use: not the template's own surfaces (they are switched on above), and in an L / C
  // room no loose "Wall" (the walls are the numbered ones).
  const extraSurfaces = SURFACE_ORDER.filter((s) => !template.faces.some((f) => !f.wall && f.surface === s) && (layout === "open" || s !== "wall"));
  // What still blocks Preview, said plainly in the bar (too many areas or tiles, a missing tile, a bad name).
  const firstIssue = (() => {
    if (!areas) return null;
    if (issues["_"]?.[0]) return issues["_"][0];
    const bad = areas.find((a) => issues[a.key]);
    return bad ? `${bad.location || "New area"}: ${issues[bad.key]![0]}` : null;
  })();

  const updateArea = useCallback((key: string, next: DraftArea) => setAreas((prev) => prev?.map((a) => (a.key === key ? next : a)) ?? prev), []);

  function changeTemplate(next: TemplateId) {
    setAreas((prev) => applyTemplate(prev ?? [], next, templateId));
    setTemplateId(next);
    setShowIssues(false);
    setFaceNotice(null);
  }

  /** Open a surface for editing and bring it into view. */
  function openArea(key: string) {
    closedAll.current = false;
    setActiveKey(key);
    // After the card has expanded.
    window.setTimeout(() => document.getElementById(`area-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  /** Clicking a surface of the 3D box: switch it on if it was kept, then edit it. */
  function pickFace(faceKey: string) {
    if (!areas) return;
    const face = template.faces.find((f) => f.key === faceKey);
    const wasKept = face ? !areaOfFace(areas, face) : false;
    const { areas: next, area } = ensureFace(areas, templateId, faceKey);
    if (!area) return;
    setAreas(next);
    setFaceNotice(wasKept && face ? `${face.label} is now switched on for tiling. Switch it off in the list to keep it as in the photo.` : null);
    openArea(area.key);
  }

  function addArea(surface: SurfaceType) {
    const created = newArea(surface, uniqueLocation(surface, areas ?? []));
    setAreas((prev) => {
      const list = prev ?? [];
      return list.length >= MAX_AREAS ? list : [...list, created];
    });
    openArea(created.key);
  }

  function pickTile(tile: Tile) {
    if (!picker) return;
    setAreas((prev) =>
      prev?.map((a) => (a.key === picker.areaKey ? { ...a, slots: a.slots.map((t, i) => (i === picker.slot ? tile : t)) } : a)) ?? prev,
    );
    setPicker(null);
  }

  async function handleGenerate() {
    if (!roomId || !areas) return;
    if (!ready) {
      setShowIssues(true);
      // Take the owner to the first surface that still needs something.
      const firstBad = areas.find((a) => issues[a.key]);
      if (firstBad) openArea(firstBad.key);
      return;
    }
    // A convenience check only: the server re-checks and atomically reserves the real balance.
    if (lowCredits) {
      setInsufficientCredits(true);
      return;
    }
    setGenerating(true);
    setGenerationError(null);
    setInsufficientCredits(false);
    setGenerationStage(0);
    const stageTimer = setInterval(() => setGenerationStage((s) => Math.min(s + 1, GENERATION_STAGES.length - 1)), 3500);

    try {
      const visualization = await generateVisualization({
        roomUploadId: roomId,
        design: toPayload(areas, layout),
        // Always sent, even empty: an emptied box must clear instructions given on an earlier try of this design.
        requirements: requirements.trim(),
      });
      clearInterval(stageTimer);
      navigate(`/result/${visualization.id}`);
    } catch (err) {
      clearInterval(stageTimer);
      if (err instanceof ApiClientError && err.code === "INSUFFICIENT_CREDITS") {
        setInsufficientCredits(true);
        // Show the real balance, so the next press is not let through by a stale number.
        getBillingSummary()
          .then((summary) => setBalance(summary.balance))
          .catch(() => undefined);
      } else if (err instanceof ApiClientError && err.code === "GENERATION_IN_PROGRESS") {
        // The same design is already being made (e.g. a double tap): History shows it and updates by itself.
        navigate("/my-visualizations");
        return;
      } else setGenerationError(friendlyErrorMessage(err, "We couldn't generate the visualization this time. Please try again."));
      setGenerating(false);
    }
  }

  if (generating) {
    const steps: Step[] = GENERATION_STAGES.map((label, i): Step => ({
      label,
      status: i < generationStage ? "done" : i === generationStage ? "active" : "pending",
    }));
    return (
      <PageContainer className="max-w-xl">
        <h1 className="font-display text-3xl text-stone-900">Generating your visualization</h1>
        <p className="mt-2 text-stone-600">Combining {tileTotal} tile{tileTotal === 1 ? "" : "s"} across {areas?.length ?? 0} area{areas?.length === 1 ? "" : "s"}. This usually takes under a minute.</p>
        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-8">
          <ProgressSteps steps={steps} />
        </div>
      </PageContainer>
    );
  }

  const pickerArea = picker && areas ? areas.find((a) => a.key === picker.areaKey) : undefined;

  return (
    <PageContainer>
      <div>
        <h1 className="font-display text-3xl text-stone-900">Design Studio</h1>
        <ol className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-stone-600">
          {["Pick your room", "Click a surface in the 3D box", "Choose a layout and its tiles", "Preview the whole room"].map((step, i) => (
            <li key={step} className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {generationError && (
        <div className="mt-6">
          <ErrorState message={generationError} onRetry={handleGenerate} />
        </div>
      )}

      {analysisError ? (
        <div className="mt-8">
          <ErrorState
            message={analysisError}
            onRetry={() => {
              setAnalysisError(null);
              setAnalysisLoading(true);
              setAnalysisAttempt((n) => n + 1);
            }}
          />
        </div>
      ) : analysisLoading || areas === null ? (
        <p className="mt-8 text-stone-400">Loading room details…</p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <Card className="overflow-hidden">
              {roomImage ? (
                <img src={roomImage} alt="The customer's room photo you are designing" className="max-h-72 w-full object-cover lg:max-h-none" />
              ) : (
                <div className="flex h-40 items-center justify-center bg-stone-100 text-sm text-stone-400">Room photo</div>
              )}
              <CardBody className="space-y-2 text-sm text-stone-600">
                <p className="font-medium text-stone-900">Your room</p>
                <p>Name each area using what you see in this photo, e.g. "Wall behind basin" or "Left wall (window side)".</p>
                {analysis && analysis.warnings.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-amber-800">
                    {analysis.warnings.slice(0, 3).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </aside>

          {/* min-w-0: a grid item never shrinks below its content otherwise; a long area name widened the page on a phone. */}
          <div className="min-w-0 space-y-5">
            <RoomTemplatePicker
              templateId={templateId}
              areas={areas}
              onTemplateChange={changeTemplate}
              onToggleFace={(key) => {
                setFaceNotice(null);
                setAreas((prev) => toggleFace(prev ?? [], templateId, key));
              }}
              notice={faceNotice}
              onPickFace={pickFace}
              activeAreaKey={activeKey}
            />

            {areas.map((area, i) => (
              <AreaCard
                key={area.key}
                index={i}
                area={area}
                issues={showIssues ? (issues[area.key] ?? []) : []}
                allAreas={areas}
                onChange={(next) => updateArea(area.key, next)}
                onRemove={() => setAreas((prev) => prev?.filter((a) => a.key !== area.key) ?? prev)}
                onPickTile={(slot) => setPicker({ areaKey: area.key, slot })}
                lockedNote={faceOfArea(template, area)?.note || undefined}
                // A numbered wall is shown by the name used in the switch list and the 3D box ("Back wall (C2)").
                title={faceOfArea(template, area)?.wall ? faceOfArea(template, area)!.label : undefined}
                surfaceOptions={extraSurfaces}
                open={area.key === activeKey}
                onToggleOpen={() => {
                  if (area.key === activeKey) {
                    closedAll.current = true;
                    setActiveKey(null);
                  } else openArea(area.key);
                }}
                roomType={analysis?.roomType}
                catalog={catalog}
                recommendedIds={recommendedIds}
              />
            ))}

            {areas.length < MAX_AREAS && (
              <div className="rounded-2xl border border-dashed border-stone-300 p-4">
                <p className="mb-2.5 text-sm font-medium text-stone-700">Add another area</p>
                <div className="flex flex-wrap gap-2">
                  {extraSurfaces.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addArea(s)}
                      className="rounded-full border border-stone-300 px-3.5 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-white"
                    >
                      + {SURFACES[s].label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {areas.length === 0 && showIssues && <p className="text-sm text-amber-800">{issues["_"]?.[0]}</p>}
            {showIssues && issues["_"] && areas.length > 0 && <p className="text-sm text-amber-800">{issues["_"][0]}</p>}

            <RequirementsInput value={requirements} onChange={setRequirements} />
          </div>
        </div>
      )}

      {insufficientCredits && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-medium">You've used all available credits.</p>
          <p className="mt-1">Buy credits to generate another visualization.</p>
          <Link to="/credits" className="mt-3 inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">
            Buy Credits
          </Link>
        </div>
      )}

      {areas !== null && (
        <Card className="sticky bottom-2 z-10 mt-8 border-stone-900 shadow-xl sm:bottom-4 sm:mt-10">
          <CardBody className="flex items-center justify-between gap-3 !py-3 sm:!py-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base leading-tight text-stone-900 sm:text-lg">
                {areas.length} area{areas.length === 1 ? "" : "s"} · {tileTotal} tile{tileTotal === 1 ? "" : "s"}
              </p>
              {/* The full list only where there is room; it wraps to at most two lines and is never cut mid-word. */}
              <p className="line-clamp-2 hidden text-xs text-stone-500 sm:block">
                {ready
                  ? areas.map((a) => `${a.location}: ${chosenTiles(a).map((t) => t.name).join(" + ")}`).join("  |  ")
                  : (firstIssue ?? "Choose the required tiles for every area to continue.")}
              </p>
              {!ready && <p className="line-clamp-2 text-xs text-stone-500 sm:hidden">{firstIssue ?? "Choose a tile for every area to continue."}</p>}
              {lowCredits && (
                <p className="text-xs font-medium text-amber-800">
                  Not enough credits.{" "}
                  <Link to="/credits" className="underline">
                    Buy credits
                  </Link>
                </p>
              )}
              {keptLabelList.length > 0 && <p className="truncate text-xs font-medium text-stone-600">Kept as in the photo: {keptLabelList.join(", ")}</p>}
              {generationCost !== null && (
                <p className="truncate text-[11px] text-stone-400 sm:text-xs">
                  Cost: {generationCost} credits{balance !== null && <> · Balance: {balance}</>}
                </p>
              )}
            </div>
            <Button size="md" className="shrink-0 sm:px-7 sm:py-3.5 sm:text-base" onClick={handleGenerate}>
              Preview<span className="hidden sm:inline">&nbsp;This Design</span>
            </Button>
          </CardBody>
        </Card>
      )}

      <TilePickerModal
        open={picker !== null && pickerArea !== undefined}
        onClose={() => setPicker(null)}
        surface={pickerArea?.surface ?? "wall"}
        slotLabel={pickerArea ? `${pickerArea.location || SURFACES[pickerArea.surface].label}` : ""}
        recommendedIds={recommendedIds}
        reasons={reasons}
        onPick={pickTile}
      />
    </PageContainer>
  );
}
