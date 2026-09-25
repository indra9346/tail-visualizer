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

// ---- Showroom catalog management (owner's own tiles) ----

import { apiPost, apiSend } from "./client";
import { preprocessRoomImage } from "@/lib/imagePreprocess";
import type { RoomType } from "./types";

export interface NewTileForm {
  name: string;
  sku?: string;
  brand?: string;
  category: TileCategory;
  material?: string;
  finish?: string;
  colorFamily?: string;
  sizeMm?: string;
  pricePerSqft?: number | null;
  currency?: string;
  suitableRooms: RoomType[];
  image: File;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function listMyTiles(): Promise<Tile[]> {
  const res = await apiGet<{ tiles: Tile[] }>("/api/tiles/manage");
  return res.tiles;
}

export async function createMyTile(form: NewTileForm): Promise<Tile> {
  const prepared = await preprocessRoomImage(form.image); // downsizes so the request stays under Vercel's body limit
  const { image: _image, ...fields } = form;
  const res = await apiPost<{ tile: Tile }>("/api/tiles/manage", {
    ...fields,
    mimeType: prepared.type,
    base64Data: await readBase64(prepared),
  });
  return res.tile;
}

export async function setMyTileActive(tileId: string, isActive: boolean): Promise<Tile> {
  const res = await apiSend<{ tile: Tile }>("PATCH", "/api/tiles/manage", { tileId, isActive });
  return res.tile;
}
