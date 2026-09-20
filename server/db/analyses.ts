import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { Errors } from "../lib/apiError.js";
import { apiLogger } from "../lib/logger.js";
import type { RoomAnalysis } from "../ai/types.js";

interface RawAnalysisRow {
  id: string;
  room_upload_id: string;
  room_type: RoomAnalysis["roomType"];
  confidence: number;
  construction_state: RoomAnalysis["constructionState"];
  floor_visible: boolean;
  floor_current_material: string | null;
  floor_condition_notes: string | null;
  wall_visible: boolean;
  wall_current_material: string | null;
  wall_condition_notes: string | null;
  recommended_surfaces: RoomAnalysis["recommendedSurfaces"];
  door_count: number;
  window_count: number;
  fixtures: string[];
  lighting: RoomAnalysis["lighting"];
  perspective: RoomAnalysis["perspective"];
  warnings: string[];
  raw_ai_response: unknown;
  analysis_model: string;
  created_at: string;
}

export interface AnalysisRow extends RoomAnalysis {
  id: string;
  createdAt: string;
}

function mapRow(row: RawAnalysisRow): AnalysisRow {
  return {
    id: row.id,
    roomUploadId: row.room_upload_id,
    roomType: row.room_type,
    confidence: row.confidence,
    constructionState: row.construction_state,
    floorVisible: row.floor_visible,
    floorCurrentMaterial: row.floor_current_material,
    floorConditionNotes: row.floor_condition_notes,
    wallVisible: row.wall_visible,
    wallCurrentMaterial: row.wall_current_material,
    wallConditionNotes: row.wall_condition_notes,
    recommendedSurfaces: row.recommended_surfaces,
    doorCount: row.door_count,
    windowCount: row.window_count,
    fixtures: row.fixtures,
    lighting: row.lighting,
    perspective: row.perspective,
    warnings: row.warnings,
    rawAiResponse: row.raw_ai_response,
    analysisModel: row.analysis_model,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  "id, room_upload_id, room_type, confidence, construction_state, floor_visible, floor_current_material, floor_condition_notes, wall_visible, wall_current_material, wall_condition_notes, recommended_surfaces, door_count, window_count, fixtures, lighting, perspective, warnings, raw_ai_response, analysis_model, created_at";

/** Returns null if no analysis exists yet — callers must treat that as "analyze first", never auto-trigger analysis. */
export async function getAnalysisByRoomUploadId(roomUploadId: string): Promise<AnalysisRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("room_analyses").select(SELECT_COLUMNS).eq("room_upload_id", roomUploadId).maybeSingle();

  if (error) {
    apiLogger.error("getAnalysisByRoomUploadId failed", { operation: "getAnalysisByRoomUploadId", errorCategory: error.code });
    throw Errors.internal("Failed to load room analysis.");
  }

  return data ? mapRow(data) : null;
}

/**
 * Inserts a new analysis. If a concurrent request already inserted one
 * for the same room_upload_id (unique constraint), this treats that as
 * success and returns the existing row rather than erroring — analysis
 * is meant to be idempotent per room upload.
 */
export async function insertAnalysis(analysis: RoomAnalysis): Promise<AnalysisRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("room_analyses")
    .insert({
      room_upload_id: analysis.roomUploadId,
      room_type: analysis.roomType,
      confidence: analysis.confidence,
      construction_state: analysis.constructionState,
      floor_visible: analysis.floorVisible,
      floor_current_material: analysis.floorCurrentMaterial,
      floor_condition_notes: analysis.floorConditionNotes,
      wall_visible: analysis.wallVisible,
      wall_current_material: analysis.wallCurrentMaterial,
      wall_condition_notes: analysis.wallConditionNotes,
      recommended_surfaces: analysis.recommendedSurfaces,
      door_count: analysis.doorCount,
      window_count: analysis.windowCount,
      fixtures: analysis.fixtures,
      lighting: analysis.lighting,
      perspective: analysis.perspective,
      warnings: analysis.warnings,
      raw_ai_response: analysis.rawAiResponse,
      analysis_model: analysis.analysisModel,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique violation on room_upload_id: another concurrent request won the race.
      const existing = await getAnalysisByRoomUploadId(analysis.roomUploadId);
      if (existing) return existing;
    }
    apiLogger.error("insertAnalysis failed", { operation: "insertAnalysis", errorCategory: error.code });
    throw Errors.internal("Failed to store room analysis.");
  }

  return mapRow(data);
}
