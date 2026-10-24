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

/** The search API returns at most this many tiles per page. */
export const TILE_PAGE_SIZE = 50;
/** Safety cap so a runaway catalog can never loop forever (40 pages = 2000 tiles). */
const MAX_CATALOG_PAGES = 40;

/**
 * Every active tile in the owner's catalog, newest first. The search API is paged (50 per page), so a picker that
 * read only the first page silently hid every older tile once a showroom had more than 50.
 */
export async function fetchAllTiles(): Promise<Tile[]> {
  const all: Tile[] = [];
  for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
    const res = await searchTiles({ page, pageSize: TILE_PAGE_SIZE });
    all.push(...res.tiles);
    if (res.tiles.length < TILE_PAGE_SIZE || all.length >= res.total) break;
  }
  // A tile added while paging can shift one onto two pages; keep the first copy.
  return all.filter((t, i) => all.findIndex((o) => o.id === t.id) === i);
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
