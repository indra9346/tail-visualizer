import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { Errors } from "../lib/apiError.js";
import { apiLogger } from "../lib/logger.js";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export const MAX_GENERATION_ATTEMPTS = 3;

export interface GenerationJobRow {
  id: string;
  visualizationId: string;
  status: JobStatus;
  attemptNumber: number;
  generationModel: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface RawJobRow {
  id: string;
  visualization_id: string;
  status: JobStatus;
  attempt_number: number;
  generation_model: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

function mapRow(row: RawJobRow): GenerationJobRow {
  return {
    id: row.id,
    visualizationId: row.visualization_id,
    status: row.status,
    attemptNumber: row.attempt_number,
    generationModel: row.generation_model,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = "id, visualization_id, status, attempt_number, generation_model, error_message, started_at, completed_at, created_at";

export async function countJobsForVisualization(visualizationId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("visualization_id", visualizationId);

  if (error) {
    apiLogger.error("countJobsForVisualization failed", { operation: "countJobsForVisualization", errorCategory: error.code });
    throw Errors.internal("Failed to check generation attempts.");
  }

  return count ?? 0;
}

export async function getLatestJobForVisualization(visualizationId: string): Promise<GenerationJobRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("generation_jobs")
    .select(SELECT_COLUMNS)
    .eq("visualization_id", visualizationId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    apiLogger.error("getLatestJobForVisualization failed", { operation: "getLatestJobForVisualization", errorCategory: error.code });
    throw Errors.internal("Failed to load generation job.");
  }

  return data ? mapRow(data) : null;
}

/**
 * Creates the next attempt for a visualization, enforcing
 * MAX_GENERATION_ATTEMPTS in application code (no schema change).
 */
export async function createNextGenerationJob(visualizationId: string): Promise<GenerationJobRow> {
  const existingCount = await countJobsForVisualization(visualizationId);
  if (existingCount >= MAX_GENERATION_ATTEMPTS) {
    throw Errors.retryLimitExceeded(MAX_GENERATION_ATTEMPTS);
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("generation_jobs")
    .insert({ visualization_id: visualizationId, attempt_number: existingCount + 1, status: "pending" })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      // Concurrent request already created this attempt number; surface the real current state.
      const latest = await getLatestJobForVisualization(visualizationId);
      if (latest) return latest;
    }
    apiLogger.error("createNextGenerationJob failed", { operation: "createNextGenerationJob", errorCategory: error?.code });
    throw Errors.internal("Failed to create generation job.");
  }

  return mapRow(data);
}

export async function markJobProcessing(jobId: string, generationModel?: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({ status: "processing", started_at: new Date().toISOString(), generation_model: generationModel ?? null })
    .eq("id", jobId);

  if (error) {
    apiLogger.error("markJobProcessing failed", { operation: "markJobProcessing", jobId, errorCategory: error.code });
    throw Errors.internal("Failed to update generation job status.");
  }
}

export async function markJobCompleted(jobId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    apiLogger.error("markJobCompleted failed", { operation: "markJobCompleted", jobId, errorCategory: error.code });
    throw Errors.internal("Failed to update generation job status.");
  }
}

export async function markJobFailed(jobId: string, safeErrorMessage: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString(), error_message: safeErrorMessage })
    .eq("id", jobId);

  if (error) {
    apiLogger.error("markJobFailed failed", { operation: "markJobFailed", jobId, errorCategory: error.code });
    // Do not throw further here — we are already in a failure path; throwing would mask the original error.
  }
}
