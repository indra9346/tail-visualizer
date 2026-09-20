import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { Errors } from "../lib/apiError.js";
import { apiLogger } from "../lib/logger.js";
import type { RoomType, SurfaceType, TileCandidate } from "../ai/types.js";

/**
 * Strips PostgREST filter-grammar delimiter characters (`,`, `(`, `)`)
 * from a value before it is interpolated into a raw `.or(...)` filter
 * string. Supabase-js always parameterizes the underlying SQL — this is
 * not SQL injection — but PostgREST's filter mini-language treats these
 * characters as clause/group separators, so an unescaped search term
 * containing them (e.g. `q=x,category.eq.wall`) can inject additional
 * OR-ed filter clauses into the query. `.eq()`/`.ilike()` calls elsewhere
 * in this file are unaffected since they pass values as bind parameters,
 * not as part of a hand-built filter string.
 */
export function sanitizePostgrestFilterValue(value: string): string {
  return value.replace(/[,()]/g, "");
}

interface RawTileRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: TileCandidate["category"];
  material: string | null;
  finish: string | null;
  color_family: string | null;
  size_mm: string | null;
  price_per_sqft: number | null;
  currency: string;
  storage_path: string;
  suitable_rooms: RoomType[];
  is_active: boolean;
  created_at: string;
}

export interface TileRow extends TileCandidate {
  currency: string;
  createdAt: string;
}

function mapRow(row: RawTileRow): TileRow {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    category: row.category,
    material: row.material,
    finish: row.finish,
    colorFamily: row.color_family,
    sizeMm: row.size_mm,
    pricePerSqft: row.price_per_sqft,
    currency: row.currency,
    suitableRooms: row.suitable_rooms,
    storagePath: row.storage_path,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  "id, sku, name, brand, category, material, finish, color_family, size_mm, price_per_sqft, currency, storage_path, suitable_rooms, is_active, created_at";

export interface TileSearchFilters {
  category?: TileCandidate["category"];
  roomType?: RoomType;
  colorFamily?: string;
  material?: string;
  finish?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function searchTiles(filters: TileSearchFilters): Promise<{ tiles: TileRow[]; total: number }> {
  const supabase = getSupabaseServerClient();
  let query = supabase.from("tiles").select(SELECT_COLUMNS, { count: "exact" }).eq("is_active", true);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.roomType) query = query.contains("suitable_rooms", [filters.roomType]);
  if (filters.colorFamily) query = query.ilike("color_family", `%${filters.colorFamily}%`);
  if (filters.material) query = query.ilike("material", `%${filters.material}%`);
  if (filters.finish) query = query.ilike("finish", `%${filters.finish}%`);
  if (filters.q) {
    const safeQ = sanitizePostgrestFilterValue(filters.q);
    query = query.or(`name.ilike.%${safeQ}%,brand.ilike.%${safeQ}%,sku.ilike.%${safeQ}%`);
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    apiLogger.error("searchTiles failed", { operation: "searchTiles", errorCategory: error.code });
    throw Errors.internal("Failed to search tiles.");
  }

  return { tiles: (data ?? []).map(mapRow), total: count ?? 0 };
}

/** Candidate set for recommendTiles(): active tiles whose category matches one of the requested surfaces. */
export async function getCandidateTilesForSurfaces(surfaces: SurfaceType[]): Promise<TileRow[]> {
  const supabase = getSupabaseServerClient();
  const categories = [...surfaces, "both"];
  const { data, error } = await supabase.from("tiles").select(SELECT_COLUMNS).eq("is_active", true).in("category", categories);

  if (error) {
    apiLogger.error("getCandidateTilesForSurfaces failed", { operation: "getCandidateTilesForSurfaces", errorCategory: error.code });
    throw Errors.internal("Failed to load tile catalog.");
  }

  return (data ?? []).map(mapRow);
}

/**
 * Loads a tile by id regardless of active status. Callers that need to
 * distinguish "doesn't exist" (404) from "exists but inactive" (409) —
 * e.g. POST /api/visualizations/generate — must use this rather than
 * filtering is_active in the query, which collapses both cases into null.
 */
export async function getTileById(tileId: string): Promise<TileRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("tiles").select(SELECT_COLUMNS).eq("id", tileId).maybeSingle();

  if (error) {
    apiLogger.error("getTileById failed", { operation: "getTileById", errorCategory: error.code });
    throw Errors.internal("Failed to load tile.");
  }

  return data ? mapRow(data) : null;
}

/** Use only where an inactive tile should be indistinguishable from a nonexistent one (e.g. recommendation candidate lookups). */
export async function getActiveTileById(tileId: string): Promise<TileRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("tiles").select(SELECT_COLUMNS).eq("id", tileId).eq("is_active", true).maybeSingle();

  if (error) {
    apiLogger.error("getActiveTileById failed", { operation: "getActiveTileById", errorCategory: error.code });
    throw Errors.internal("Failed to load tile.");
  }

  return data ? mapRow(data) : null;
}
