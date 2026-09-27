import { apiGet, apiPost } from "./client";
import type { SurfaceType, Visualization } from "./types";

interface GenerateVisualizationResponse {
  visualization: {
    id: string;
    status: Visualization["status"];
    tileId: string;
    surfaces: SurfaceType[];
    resultImageUrl: string;
    attemptNumber: number;
  };
}

/**
 * Only ever sends the authoritative identifiers (roomUploadId, tileId,
 * surfaces, and — for a retry — the existing visualizationId). Never
 * sends tile name/price/brand/image as if they were authoritative; the
 * server always re-derives the real tile from the database.
 */
export async function generateVisualization(input: {
  roomUploadId: string;
  tileId: string;
  surfaces: SurfaceType[];
  /** Optional natural-language design instructions (sanitized and length-checked by the server). */
  requirements?: string;
  visualizationId?: string;
}): Promise<GenerateVisualizationResponse["visualization"]> {
  const res = await apiPost<GenerateVisualizationResponse>("/api/visualizations/generate", input);
  return res.visualization;
}

export async function getVisualization(visualizationId: string): Promise<Visualization> {
  const res = await apiGet<{ visualization: Visualization }>(`/api/visualizations/${visualizationId}`);
  return res.visualization;
}

export async function getRoomVisualizations(roomUploadId: string): Promise<Visualization[]> {
  const res = await apiGet<{ visualizations: Visualization[] }>(`/api/visualizations/room/${roomUploadId}`);
  return res.visualizations;
}

export async function listMyVisualizations(): Promise<Visualization[]> {
  const res = await apiGet<{ visualizations: Visualization[] }>("/api/visualizations/history");
  return res.visualizations;
}
