import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { Errors } from "../lib/apiError.js";
import { apiLogger } from "../lib/logger.js";
import type { SurfaceType } from "../ai/types.js";

export type VisualizationStatus = "pending" | "generating" | "completed" | "failed";

export interface VisualizationRow {
  id: string;
  roomUploadId: string;
  userId: string;
  tileId: string;
  appliedSurfaces: SurfaceType[];
  status: VisualizationStatus;
  resultStoragePath: string | null;
  errorMessage: string | null;
  requirements: string | null;
  roomType: string | null;
  creditsCharged: number;
  /** Owner-controlled: false (default) = visible only to the owner; true = also visible to anonymous callers. See migration 0011. */
  isPublic: boolean;
  createdAt: string;
  completedAt: string | null;
}

interface RawVisualizationRow {
  id: string;
  room_upload_id: string;
  user_id: string;
  tile_id: string;
  applied_surfaces: SurfaceType[];
  status: VisualizationStatus;
  result_storage_path: string | null;
  error_message: string | null;
  requirements: string | null;
  room_type: string | null;
  credits_charged: number;
  is_public: boolean;
  created_at: string;
  completed_at: string | null;
}

function mapRow(row: RawVisualizationRow): VisualizationRow {
  return {
    id: row.id,
    roomUploadId: row.room_upload_id,
    userId: row.user_id,
    tileId: row.tile_id,
    appliedSurfaces: row.applied_surfaces,
    status: row.status,
    resultStoragePath: row.result_storage_path,
    errorMessage: row.error_message,
    requirements: row.requirements,
    roomType: row.room_type,
    creditsCharged: row.credits_charged,
    isPublic: row.is_public,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const SELECT_COLUMNS =
  "id, room_upload_id, user_id, tile_id, applied_surfaces, status, result_storage_path, error_message, requirements, room_type, credits_charged, is_public, created_at, completed_at";

export async function createVisualization(input: {
  roomUploadId: string;
  userId: string;
  tileId: string;
  surfaces: SurfaceType[];
  requirements?: string | null;
  roomType?: string | null;
}): Promise<VisualizationRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("visualizations")
    .insert({
      room_upload_id: input.roomUploadId,
      user_id: input.userId,
      tile_id: input.tileId,
      applied_surfaces: input.surfaces,
      requirements: input.requirements ?? null,
      room_type: input.roomType ?? null,
      status: "pending",
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    apiLogger.error("createVisualization failed", { operation: "createVisualization", errorCategory: error?.code });
    throw Errors.internal("Failed to create visualization.");
  }

  return mapRow(data);
}

export async function verifyVisualizationOwnership(visualizationId: string, userId: string): Promise<VisualizationRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("visualizations").select(SELECT_COLUMNS).eq("id", visualizationId).maybeSingle();

  if (error) {
    apiLogger.error("verifyVisualizationOwnership query failed", { operation: "verifyVisualizationOwnership", errorCategory: error.code });
    throw Errors.internal("Failed to verify visualization.");
  }

  if (!data || data.user_id !== userId) {
    throw Errors.visualizationNotFound();
  }

  return mapRow(data);
}

/**
 * Fetches a visualization by id with NO ownership check — the caller
 * decides what's allowed to see it (an owner, or anyone if isPublic).
 * Never use this to answer an authorization question by itself.
 */
export async function getVisualizationById(visualizationId: string): Promise<VisualizationRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("visualizations").select(SELECT_COLUMNS).eq("id", visualizationId).maybeSingle();

  if (error) {
    apiLogger.error("getVisualizationById query failed", { operation: "getVisualizationById", errorCategory: error.code });
    throw Errors.internal("Failed to load visualization.");
  }

  return data ? mapRow(data) : null;
}

/**
 * Owner-only: flips a visualization's public/private flag. Ownership is
 * enforced in the same query (`.eq("user_id", userId)`), so a mismatched
 * id/owner pair silently updates zero rows rather than someone else's row.
 */
export async function setVisualizationVisibility(visualizationId: string, userId: string, isPublic: boolean): Promise<VisualizationRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("visualizations")
    .update({ is_public: isPublic })
    .eq("id", visualizationId)
    .eq("user_id", userId)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    apiLogger.error("setVisualizationVisibility failed", { operation: "setVisualizationVisibility", errorCategory: error.code });
    throw Errors.internal("Failed to update visualization visibility.");
  }

  if (!data) throw Errors.visualizationNotFound();
  return mapRow(data);
}

/** Every visualization explicitly marked public by its owner, newest first — the only thing an unauthenticated caller may ever list. */
export async function listPublicVisualizations(limit = 100): Promise<VisualizationRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("visualizations")
    .select(SELECT_COLUMNS)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    apiLogger.error("listPublicVisualizations failed", { operation: "listPublicVisualizations", errorCategory: error.code });
    throw Errors.internal("Failed to list public visualizations.");
  }

  return (data ?? []).map(mapRow);
}

/**
 * Idempotency guard for POST /api/visualizations/generate: finds an
 * existing pending/generating/failed visualization for the exact same
 * (room, tile, surfaces) combo, so a double-click, network retry, or a
 * client re-submitting after a failure reuses it instead of spawning a
 * fresh visualization.
 *
 * Deliberately excludes "completed" — a genuinely new request for the
 * same (room, tile, surfaces) after a prior success should be allowed to
 * regenerate as its own attempt, not silently reuse the old result.
 *
 * "failed" is included specifically because the generate endpoint's
 * error response never includes the visualizationId it created (the
 * request throws before any body is returned), so the frontend has no
 * way to pass that id back explicitly on a plain retry. Without this,
 * every retry of an identical failed request would create a brand-new
 * visualization row with its own fresh attempt counter, silently
 * bypassing MAX_GENERATION_ATTEMPTS for that (room, tile, surfaces).
 */
export async function findInFlightVisualization(
  roomUploadId: string,
  tileId: string,
  surfaces: SurfaceType[],
): Promise<VisualizationRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("visualizations")
    .select(SELECT_COLUMNS)
    .eq("room_upload_id", roomUploadId)
    .eq("tile_id", tileId)
    .in("status", ["pending", "generating", "failed"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    apiLogger.error("findInFlightVisualization query failed", { operation: "findInFlightVisualization", errorCategory: error.code });
    throw Errors.internal("Failed to check existing visualizations.");
  }

  const sameSurfaces = (data ?? []).find((row) => {
    const rowSurfaces = [...(row.applied_surfaces as SurfaceType[])].sort();
    const requested = [...surfaces].sort();
    return rowSurfaces.length === requested.length && rowSurfaces.every((s, i) => s === requested[i]);
  });

  return sameSurfaces ? mapRow(sameSurfaces) : null;
}

export async function updateVisualizationStatus(
  visualizationId: string,
  update: { status: VisualizationStatus; resultStoragePath?: string | null; errorMessage?: string | null; completedAt?: string | null; requirements?: string | null; creditsCharged?: number },
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const patch: Record<string, unknown> = { status: update.status };
  if (update.resultStoragePath !== undefined) patch.result_storage_path = update.resultStoragePath;
  if (update.errorMessage !== undefined) patch.error_message = update.errorMessage;
  if (update.completedAt !== undefined) patch.completed_at = update.completedAt;
  if (update.requirements !== undefined) patch.requirements = update.requirements;
  if (update.creditsCharged !== undefined) patch.credits_charged = update.creditsCharged;

  const { error } = await supabase.from("visualizations").update(patch).eq("id", visualizationId);

  if (error) {
    apiLogger.error("updateVisualizationStatus failed", { operation: "updateVisualizationStatus", visualizationId, errorCategory: error.code });
    throw Errors.internal("Failed to update visualization status.");
  }
}

export async function listVisualizationsForRoom(roomUploadId: string): Promise<VisualizationRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("visualizations")
    .select(SELECT_COLUMNS)
    .eq("room_upload_id", roomUploadId)
    .order("created_at", { ascending: false });

  if (error) {
    apiLogger.error("listVisualizationsForRoom failed", { operation: "listVisualizationsForRoom", errorCategory: error.code });
    throw Errors.internal("Failed to list visualizations.");
  }

  return (data ?? []).map(mapRow);
}

/** All visualizations owned by this user (for "My Visualizations" history), newest first. */
export async function listVisualizationsForUser(userId: string, limit = 50): Promise<VisualizationRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("visualizations")
    .select(SELECT_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    apiLogger.error("listVisualizationsForUser failed", { operation: "listVisualizationsForUser", errorCategory: error.code });
    throw Errors.internal("Failed to list your visualizations.");
  }

  return (data ?? []).map(mapRow);
}
