import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { Errors } from "../lib/apiError.js";
import { apiLogger } from "../lib/logger.js";

export interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

function mapRow(row: { id: string; user_id: string; name: string; created_at: string }): ProjectRow {
  return { id: row.id, userId: row.user_id, name: row.name, createdAt: row.created_at };
}

export async function createProject(userId: string, name: string): Promise<ProjectRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: userId, name })
    .select("id, user_id, name, created_at")
    .single();

  if (error || !data) {
    apiLogger.error("createProject failed", { operation: "createProject", userId, errorCategory: error?.code });
    throw Errors.internal("Failed to create project.");
  }

  return mapRow(data);
}

export async function listProjectsForUser(userId: string): Promise<ProjectRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    apiLogger.error("listProjectsForUser failed", { operation: "listProjectsForUser", errorCategory: error.code });
    throw Errors.internal("Failed to load projects.");
  }

  return (data ?? []).map(mapRow);
}

/**
 * Loads a project and verifies it belongs to `userId`. Throws NOT_FOUND
 * (not FORBIDDEN) when the project exists but belongs to someone else, to
 * avoid confirming resource existence to an unauthorized caller.
 */
export async function verifyProjectOwnership(projectId: string, userId: string): Promise<ProjectRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, user_id, name, created_at")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    apiLogger.error("verifyProjectOwnership query failed", { operation: "verifyProjectOwnership", errorCategory: error.code });
    throw Errors.internal("Failed to verify project.");
  }

  if (!data || data.user_id !== userId) {
    throw Errors.projectNotFound();
  }

  return mapRow(data);
}

/** Owner-scoped delete of a project; cascades to all its rooms and everything under them. */
export async function deleteOwnedProject(projectId: string, userId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("projects").delete().eq("id", projectId).eq("user_id", userId).select("id").maybeSingle();
  if (error) {
    apiLogger.error("deleteOwnedProject failed", { operation: "deleteOwnedProject", errorCategory: error.code });
    throw Errors.internal("Failed to delete the project.");
  }
  return Boolean(data);
}
