import { apiGet } from "./client";
import type { Tile, TileCategory, TileRecommendation } from "./types";

export interface TileSearchFilters {
  category?: TileCategory;
  colorFamily?: string;
  material?: string;
  finish?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface TileSearchResult {
  tiles: Tile[];
  page: number;
  pageSize: number;
  total: number;
}

export async function searchTiles(filters: TileSearchFilters = {}): Promise<TileSearchResult> {
  return apiGet<TileSearchResult>("/api/tiles/search", {
    category: filters.category,
    colorFamily: filters.colorFamily,
    material: filters.material,
    finish: filters.finish,
    q: filters.q,
    page: filters.page?.toString(),
    pageSize: filters.pageSize?.toString(),
  });
}

/** Never triggers duplicate work: the API itself reuses prior recommendations for the same room analysis. */
export async function getTileRecommendations(roomUploadId: string): Promise<{ recommendations: TileRecommendation[]; reused: boolean }> {
  return apiGet<{ recommendations: TileRecommendation[]; reused: boolean }>("/api/tiles/recommend", { roomUploadId });
}
