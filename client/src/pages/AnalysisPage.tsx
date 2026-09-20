import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { ProgressSteps, type Step } from "@/components/ui/ProgressSteps";
import { AnalysisSummary } from "@/components/analysis/AnalysisSummary";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { getRoomAnalysis, analyzeRoom } from "@/api/rooms";
import { friendlyErrorMessage } from "@/api/client";
import { useWorkflow } from "@/context/WorkflowContext";
import type { RoomAnalysis } from "@/api/types";

const ANALYZING_STAGES = ["Uploading room", "Preparing image", "Analyzing room", "Identifying surfaces", "Preparing recommendations"];

export function AnalysisPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { setRoom, setAnalysis: setWorkflowAnalysis } = useWorkflow();

  const [phase, setPhase] = useState<"checking" | "analyzing" | "done" | "error">("checking");
  const [analysis, setAnalysis] = useState<RoomAnalysis | null>(null);
  const [wasReused, setWasReused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setRoom(roomId);
    let cancelled = false;

    async function run() {
      setPhase("checking");
      setError(null);
      try {
        // Never re-triggers Gemini: this is a read-only lookup of the reusable artifact.
        const existing = await getRoomAnalysis(roomId!);
        if (cancelled) return;

        if (existing) {
          setAnalysis(existing);
          setWorkflowAnalysis(existing);
          setWasReused(true);
          setPhase("done");
          return;
        }

        setPhase("analyzing");
        setActiveStageIndex(2); // "Uploading room" and "Preparing image" are already behind us at this point
        stageTimer.current = setInterval(() => {
          setActiveStageIndex((i) => Math.min(i + 1, ANALYZING_STAGES.length - 1));
        }, 1800);

        const result = await analyzeRoom(roomId!);
        if (cancelled) return;

        if (stageTimer.current) clearInterval(stageTimer.current);
        setActiveStageIndex(ANALYZING_STAGES.length - 1);
        setAnalysis(result.analysis);
        setWorkflowAnalysis(result.analysis);
        setWasReused(result.reused);
        setPhase("done");
      } catch (err) {
        if (cancelled) return;
        if (stageTimer.current) clearInterval(stageTimer.current);
        setError(friendlyErrorMessage(err, "We couldn't analyze this room. Please try again."));
        setPhase("error");
      }
    }

    run();
    return () => {
      cancelled = true;
      if (stageTimer.current) clearInterval(stageTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const steps: Step[] = ANALYZING_STAGES.map((label, i): Step => ({
    label,
    status: i < activeStageIndex ? "done" : i === activeStageIndex ? "active" : "pending",
  }));

  return (
    <PageContainer className="max-w-2xl">
      <h1 className="font-display text-3xl text-stone-900">Room Analysis</h1>
      <p className="mt-2 text-stone-600">
        {phase === "done" && wasReused
          ? "We already have an analysis for this room, so no new AI analysis was needed."
          : "Our AI is identifying the room type, surfaces, and construction state."}
      </p>

      <div className="mt-8">
        {(phase === "checking" || phase === "analyzing") && (
          <div className="rounded-2xl border border-stone-200 bg-white p-8">
            <ProgressSteps steps={steps} />
          </div>
        )}

        {phase === "error" && error && (
          <ErrorState
            message={error}
            onRetry={() => {
              if (roomId) {
                setPhase("checking");
                analyzeRoom(roomId)
                  .then((result) => {
                    setAnalysis(result.analysis);
                    setWorkflowAnalysis(result.analysis);
                    setPhase("done");
                  })
                  .catch((err) => {
                    setError(friendlyErrorMessage(err, "We couldn't analyze this room. Please try again."));
                    setPhase("error");
                  });
              }
            }}
          />
        )}

        {phase === "done" && analysis && (
          <div className="space-y-6">
            <AnalysisSummary analysis={analysis} />
            <Button size="lg" onClick={() => navigate(`/tiles/${roomId}`)}>
              See recommended tiles
            </Button>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
