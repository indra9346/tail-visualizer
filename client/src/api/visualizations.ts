import { apiGet, apiPost, apiSend } from "./client";
import type { Design, SurfaceType, Visualization } from "./types";

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
  /** Per-area tiles and layout patterns. The server re-reads every tile from the catalog. */
  design: {
    /** L / C connected-wall layout; omitted = free naming. */
    layout?: "l_shape" | "c_shape";
    areas: Array<{ surface: SurfaceType; location: string; wall?: string; pattern: string; patternNote?: string; tileIds: string[] }>;
  };
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

/**
 * Public "My Visualizations" feed — real, database-backed visualizations
 * their owners have explicitly made public. No authentication required or
 * sent. See api/_routes/vizPublic.ts.
 */
export async function listPublicVisualizations(): Promise<Visualization[]> {
  const res = await apiGet<{ visualizations: Visualization[] }>("/api/visualizations/public");
  return res.visualizations;
}

/** Owner-only: mark one of the caller's own visualizations public or private again. */
export async function setVisualizationVisibility(visualizationId: string, isPublic: boolean): Promise<void> {
  await apiSend<{ visualization: { id: string; isPublic: boolean } }>("PATCH", `/api/visualizations/${visualizationId}/visibility`, { isPublic });
}

/** Owner-only: permanently deletes one visualization and its generated image. */
export async function deleteVisualization(visualizationId: string): Promise<void> {
  await apiSend<{ deleted: boolean }>("DELETE", `/api/visualizations/${visualizationId}`);
}

export type { Design };
