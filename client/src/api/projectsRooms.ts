import { apiGet, apiSend } from "./client";
import type { Project, RoomUpload } from "./types";

export async function listProjects(): Promise<Project[]> {
  const res = await apiGet<{ projects: Project[] }>("/api/projects");
  return res.projects;
}

export async function listProjectRooms(projectId: string): Promise<RoomUpload[]> {
  const res = await apiGet<{ rooms: RoomUpload[] }>(`/api/projects/${projectId}/rooms`);
  return res.rooms;
}

/** Owner-only: permanently deletes a project with all its rooms and visualizations. */
export async function deleteProject(projectId: string): Promise<void> {
  await apiSend<{ deleted: boolean }>("DELETE", `/api/projects?id=${encodeURIComponent(projectId)}`);
}
