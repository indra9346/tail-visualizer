import { apiGet } from "./client";
import type { Project, RoomUpload } from "./types";

export async function listProjects(): Promise<Project[]> {
  const res = await apiGet<{ projects: Project[] }>("/api/projects");
  return res.projects;
}

export async function listProjectRooms(projectId: string): Promise<RoomUpload[]> {
  const res = await apiGet<{ rooms: RoomUpload[] }>(`/api/projects/${projectId}/rooms`);
  return res.rooms;
}
