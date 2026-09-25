import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { Errors } from "../lib/apiError.js";
import { apiLogger } from "../lib/logger.js";
import type { SurfaceType, TileRecommendation } from "../ai/types.js";
import type { TileRow } from "./tiles.js";

export interface RecommendationWithTile extends TileRecommendation {
  tile: TileRow;
}

/** True if we've already computed recommendations for this analysis — used to avoid redundant Gemini calls. */
export async function hasRecommendations(roomAnalysisId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from("tile_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("room_analysis_id", roomAnalysisId);

  if (error) {
    apiLogger.error("hasRecommendations failed", { operation: "hasRecommendations", errorCategory: error.code });
    throw Errors.internal("Failed to check existing recommendations.");
  }

  return (count ?? 0) > 0;
}

interface RawRecommendationJoinRow {
  tile_id: string;
  surface: string;
  rank: number;
  reason: string;
  tiles: {
    id: string;
    sku: string;
    name: string;
    brand: string | null;
    category: TileRow["category"];
    material: string | null;
    finish: string | null;
    color_family: string | null;
    size_mm: string | null;
    price_per_sqft: number | null;
    currency: string;
    storage_path: string;
    suitable_rooms: TileRow["suitableRooms"];
    is_active: boolean;
    owner_id: string | null;
    created_at: string;
  } | null;
}

export async function getRecommendationsWithTiles(roomAnalysisId: string): Promise<RecommendationWithTile[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tile_recommendations")
    .select(
      "tile_id, surface, rank, reason, tiles ( id, sku, name, brand, category, material, finish, color_family, size_mm, price_per_sqft, currency, storage_path, suitable_rooms, is_active, owner_id, created_at )",
    )
    .eq("room_analysis_id", roomAnalysisId)
    .order("surface", { ascending: true })
    .order("rank", { ascending: true });

  if (error) {
    apiLogger.error("getRecommendationsWithTiles failed", { operation: "getRecommendationsWithTiles", errorCategory: error.code });
    throw Errors.internal("Failed to load tile recommendations.");
  }

  // tile_id -> tiles is a to-one relationship via foreign key, but the
  // client's generic select-string type inference (no generated Database
  // types wired up) can't express that cardinality, so we assert the
  // shape we know is correct from the Phase 0 schema.
  const rows = (data ?? []) as unknown as RawRecommendationJoinRow[];

  return rows
    .filter((row): row is RawRecommendationJoinRow & { tiles: NonNullable<RawRecommendationJoinRow["tiles"]> } => Boolean(row.tiles))
    .map((row) => {
      const t = row.tiles;
      return {
        tileId: row.tile_id,
        surface: row.surface as SurfaceType,
        rank: row.rank,
        reason: row.reason,
        tile: {
          id: t.id,
          sku: t.sku,
          name: t.name,
          brand: t.brand,
          category: t.category,
          material: t.material,
          finish: t.finish,
          colorFamily: t.color_family,
          sizeMm: t.size_mm,
          pricePerSqft: t.price_per_sqft,
          currency: t.currency,
          suitableRooms: t.suitable_rooms,
          storagePath: t.storage_path,
          isActive: t.is_active,
          ownerId: t.owner_id,
          createdAt: t.created_at,
        },
      };
    });
}

/** Upserts so repeated recommendation runs for the same analysis don't create duplicate rows. */
export async function insertRecommendations(roomAnalysisId: string, recommendations: TileRecommendation[]): Promise<void> {
  if (recommendations.length === 0) return;

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("tile_recommendations").upsert(
    recommendations.map((r) => ({
      room_analysis_id: roomAnalysisId,
      tile_id: r.tileId,
      surface: r.surface,
      rank: r.rank,
      reason: r.reason,
    })),
    { onConflict: "room_analysis_id,tile_id,surface" },
  );

  if (error) {
    apiLogger.error("insertRecommendations failed", { operation: "insertRecommendations", errorCategory: error.code });
    throw Errors.internal("Failed to store tile recommendations.");
  }
}
