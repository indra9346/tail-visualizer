import { apiPost } from "./client";
import type { Project } from "./types";

export async function createProject(name: string): Promise<Project> {
  const res = await apiPost<{ project: Project }>("/api/projects", { name });
  return res.project;
}
