import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { getTileRecommendations } from "@/api/tiles";
import { generateVisualization } from "@/api/visualizations";
import { getBillingSummary, getCreditPackages } from "@/api/billing";
import { ApiClientError, friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import { SURFACES, SURFACE_ORDER } from "@/lib/designPatterns";
import {
  MAX_AREAS,
  chosenTiles,
  distinctTileCount,
  loadDraft,
  newArea,
  saveDraft,
  tileFitsSurface,
  toPayload,
  validateDraft,
  type DraftArea,
} from "@/lib/designDraft";
import type { RoomLayout } from "@/lib/roomLayouts";
import { TEMPLATES, applyTemplate, ensureFace, faceOfArea, isTemplateId, keptLabels, templateForLayout, toggleFace, type TemplateId } from "@/lib/roomTemplates";
import type { RoomAnalysis, SurfaceType, Tile } from "@/api/types";

const GENERATION_STAGES = ["Preparing your room", "Placing each tile in its area", "Laying out your patterns", "Rendering realistic lighting", "Finalizing visualization"];

/** First unused preset name for a surface, so a second wall area doesn't collide with "All walls". */
function nextLocation(surface: SurfaceType, areas: DraftArea[]): string {
  const used = new Set(areas.filter((a) => a.surface === surface).map((a) => a.location.trim().toLowerCase()));
  const presets = SURFACES[surface].locations;
  return presets.find((p) => !used.has(p.toLowerCase())) ?? "";
}

export function TilesPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { analysis: cachedAnalysis, selectedTile, setAnalysis } = useWorkflow();

  const [analysis, setLocalAnalysis] = useState<RoomAnalysis | null>(cachedAnalysis);
  const [analysisLoading, setAnalysisLoading] = useState(!cachedAnalysis);
  const [roomImage, setRoomImage] = useState<string | null>(null);

  const [areas, setAreas] = useState<DraftArea[] | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId>("free");
  // The layout (numbered connected walls) always follows the chosen room template.
  const layout: RoomLayout = TEMPLATES[templateId].layout;
  const [picker, setPicker] = useState<{ areaKey: string; slot: number } | null>(null);
  const [recommendedIds, setRecommendedIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});

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
      .finally(() => !cancelled && setAnalysisLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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

  // Starting design: the draft from a refresh, else one area per surface the analysis found worth tiling.
  useEffect(() => {
    if (!roomId || !analysis || areas !== null) return;
    const draft = loadDraft(roomId);
    if (draft && draft.areas.length > 0) {
      setTemplateId(isTemplateId(draft.template) ? draft.template : templateForLayout(draft.layout));
      setAreas(draft.areas);
      return;
    }
    const surfaces: SurfaceType[] = analysis.recommendedSurfaces.length > 0 ? analysis.recommendedSurfaces : ["wall"];
    const seeded = surfaces.map((s) => newArea(s));
    // A tile picked on the catalog page ("Try in my space") goes straight into the first area it fits.
    if (selectedTile && selectedTile.isActive) {
      const target = seeded.find((a) => tileFitsSurface(selectedTile, a.surface));
      if (target) target.slots[0] = selectedTile;
    }
    setAreas(seeded);
  }, [roomId, analysis, areas, selectedTile]);

  useEffect(() => {
    if (roomId && areas) saveDraft(roomId, areas, layout, templateId);
  }, [roomId, areas, layout, templateId]);

  const issues = useMemo(() => validateDraft(areas ?? [], layout), [areas, layout]);
  const template = TEMPLATES[templateId];
  // Surfaces of the template the owner did not switch on: they stay exactly as in the photo.
  const keptLabelList = useMemo(() => (template.faces.length > 0 ? keptLabels(template, areas ?? []) : []), [template, areas]);
  const ready = areas !== null && Object.keys(issues).length === 0;
  const tileTotal = areas ? distinctTileCount(areas) : 0;
  const lowCredits = balance !== null && generationCost !== null && balance < generationCost;

  const updateArea = useCallback((key: string, next: DraftArea) => setAreas((prev) => prev?.map((a) => (a.key === key ? next : a)) ?? prev), []);

  function changeTemplate(next: TemplateId) {
    setAreas((prev) => applyTemplate(prev ?? [], next, templateId));
    setTemplateId(next);
    setShowIssues(false);
  }

  function pickFace(faceKey: string) {
    if (!areas) return;
    const { areas: next, area } = ensureFace(areas, templateId, faceKey);
    if (!area) return;
    setAreas(next);
    setPicker({ areaKey: area.key, slot: 0 });
  }

  function addArea(surface: SurfaceType) {
    setAreas((prev) => {
      const list = prev ?? [];
      return list.length >= MAX_AREAS ? list : [...list, newArea(surface, nextLocation(surface, list))];
    });
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
        ...(requirements.trim().length > 0 ? { requirements: requirements.trim() } : {}),
      });
      clearInterval(stageTimer);
      navigate(`/result/${visualization.id}`);
    } catch (err) {
      clearInterval(stageTimer);
      if (err instanceof ApiClientError && err.code === "INSUFFICIENT_CREDITS") setInsufficientCredits(true);
      else setGenerationError(friendlyErrorMessage(err, "We couldn't generate the visualization this time. Please try again."));
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
        <p className="mt-2 max-w-3xl text-stone-600">
          Decide, area by area, which tiles go where. Combine several tiles on one wall with a pattern, then preview the whole room.
        </p>
      </div>

      {generationError && (
        <div className="mt-6">
          <ErrorState message={generationError} onRetry={handleGenerate} />
        </div>
      )}

      {analysisLoading || areas === null ? (
        <p className="mt-8 text-stone-400">Loading room details…</p>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
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

          <div className="space-y-5">
            <RoomTemplatePicker
              templateId={templateId}
              areas={areas}
              onTemplateChange={changeTemplate}
              onToggleFace={(key) => setAreas((prev) => toggleFace(prev ?? [], templateId, key))}
              onPickFace={pickFace}
            />

            {areas.map((area, i) => (
              <AreaCard
                key={area.key}
                index={i}
                area={area}
                issues={showIssues ? (issues[area.key] ?? []) : []}
                onChange={(next) => updateArea(area.key, next)}
                onRemove={() => setAreas((prev) => prev?.filter((a) => a.key !== area.key) ?? prev)}
                onPickTile={(slot) => setPicker({ areaKey: area.key, slot })}
                lockedNote={faceOfArea(template, area)?.note || undefined}
              />
            ))}

            {areas.length < MAX_AREAS && (
              <div className="rounded-2xl border border-dashed border-stone-300 p-4">
                <p className="mb-2.5 text-sm font-medium text-stone-700">Add another area</p>
                <div className="flex flex-wrap gap-2">
                  {/* In an L / C room the walls are chosen in "Room shape" above, so a loose "Wall" area is not offered. */}
                  {SURFACE_ORDER.filter((s) => layout === "open" || (s !== "wall" && !template.faces.some((f) => f.surface === s))).map((s) => (
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
        <Card className="sticky bottom-4 z-10 mt-10 border-stone-900 shadow-xl">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-lg text-stone-900">
                {areas.length} area{areas.length === 1 ? "" : "s"} · {tileTotal} tile{tileTotal === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-stone-500">
                {ready
                  ? areas.map((a) => `${a.location}: ${chosenTiles(a).map((t) => t.name).join(" + ")}`).join("  |  ").slice(0, 140)
                  : "Choose the required tiles for every area to continue."}
              </p>
              {keptLabelList.length > 0 && <p className="text-xs font-medium text-stone-600">Kept as in the photo: {keptLabelList.join(", ")}</p>}
              {generationCost !== null && (
                <p className="mt-1 text-xs text-stone-400">
                  Generation cost: {generationCost} credits{balance !== null && <> · Balance: {balance}</>}
                </p>
              )}
            </div>
            <Button size="lg" onClick={handleGenerate} disabled={lowCredits && ready}>
              Preview This Design
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
