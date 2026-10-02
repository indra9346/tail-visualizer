import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { Errors } from "../lib/apiError.js";
import { apiLogger } from "../lib/logger.js";

export type RoomUploadStatus = "uploaded" | "analyzing" | "analyzed" | "failed";

export interface RoomUploadRow {
  id: string;
  projectId: string;
  userId: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  status: RoomUploadStatus;
  errorMessage: string | null;
  createdAt: string;
}

interface RawRoomUploadRow {
  id: string;
  project_id: string;
  user_id: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  status: RoomUploadStatus;
  error_message: string | null;
  created_at: string;
}

function mapRow(row: RawRoomUploadRow): RoomUploadRow {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS = "id, project_id, user_id, storage_path, mime_type, file_size_bytes, status, error_message, created_at";

export async function createRoomUpload(input: {
  id: string;
  projectId: string;
  userId: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<RoomUploadRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("room_uploads")
    .insert({
      id: input.id,
      project_id: input.projectId,
      user_id: input.userId,
      storage_path: input.storagePath,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      status: "uploaded",
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    apiLogger.error("createRoomUpload failed", { operation: "createRoomUpload", errorCategory: error?.code });
    throw error ?? new Error("createRoomUpload: no row returned");
  }

  return mapRow(data);
}

export async function verifyRoomOwnership(roomUploadId: string, userId: string): Promise<RoomUploadRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("room_uploads").select(SELECT_COLUMNS).eq("id", roomUploadId).maybeSingle();

  if (error) {
    apiLogger.error("verifyRoomOwnership query failed", { operation: "verifyRoomOwnership", errorCategory: error.code });
    throw Errors.internal("Failed to verify room.");
  }

  if (!data || data.user_id !== userId) {
    throw Errors.roomNotFound();
  }

  return mapRow(data);
}

/** Ownership must already be verified by the caller (verifyProjectOwnership) before calling this. */
export async function listRoomUploadsForProject(projectId: string): Promise<RoomUploadRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("room_uploads")
    .select(SELECT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    apiLogger.error("listRoomUploadsForProject failed", { operation: "listRoomUploadsForProject", errorCategory: error.code });
    throw Errors.internal("Failed to load rooms for this project.");
  }

  return (data ?? []).map(mapRow);
}

export async function updateRoomStatus(
  roomUploadId: string,
  status: RoomUploadStatus,
  errorMessage: string | null = null,
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("room_uploads")
    .update({ status, error_message: errorMessage })
    .eq("id", roomUploadId);

  if (error) {
    apiLogger.error("updateRoomStatus failed", { operation: "updateRoomStatus", roomUploadId, errorCategory: error.code });
    throw Errors.internal("Failed to update room status.");
  }
}

/**
 * Owner-scoped delete of one room upload. Cascades to its analysis, saved tile
 * recommendations, visualizations and generation jobs (ON DELETE CASCADE).
 * Returns the removed row so the caller can delete the stored photo, or null
 * if it was not found / not owned.
 */
export async function deleteOwnedRoom(roomUploadId: string, userId: string): Promise<RoomUploadRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("room_uploads")
    .delete()
    .eq("id", roomUploadId)
    .eq("user_id", userId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) {
    apiLogger.error("deleteOwnedRoom failed", { operation: "deleteOwnedRoom", errorCategory: error.code });
    throw Errors.internal("Failed to delete the room.");
  }
  return data ? mapRow(data) : null;
}
