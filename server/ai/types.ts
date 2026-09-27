/**
 * Shared types for the AI service layer.
 *
 * These mirror the Postgres enums / columns defined in the Phase 0
 * migration (room_analyses, tiles, visualizations tables) so the future
 * database service layer can persist these values without translation.
 * This file has zero dependency on Supabase or any HTTP framework.
 */

// ---------- Enums (must stay in sync with the SQL migration) ----------

export const ROOM_TYPES = [
  "kitchen",
  "bedroom",
  "bathroom",
  "living_room",
  "dining_room",
  "balcony",
  "corridor",
  "other",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const CONSTRUCTION_STATES = [
  "unfinished",
  "under_construction",
  "finished_needs_renovation",
] as const;
export type ConstructionState = (typeof CONSTRUCTION_STATES)[number];

export const SURFACE_TYPES = ["floor", "wall"] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

export const TILE_CATEGORIES = ["floor", "wall", "both"] as const;
export type TileCategory = (typeof TILE_CATEGORIES)[number];

export const LIGHTING_TYPES = ["natural", "artificial", "mixed", "low_light"] as const;
export type LightingType = (typeof LIGHTING_TYPES)[number];

export const PERSPECTIVE_TYPES = ["straight_on", "angled", "wide_angle"] as const;
export type PerspectiveType = (typeof PERSPECTIVE_TYPES)[number];

// ---------- Image input ----------

export interface ImageInput {
  /** Raw image bytes. Never a URL — caller must already have fetched it server-side. */
  buffer: Buffer;
  mimeType: string;
}

// ---------- Room analysis (maps 1:1 to the room_analyses table) ----------

export interface RoomAnalysis {
  roomUploadId: string;
  roomType: RoomType;
  confidence: number; // 0..1
  constructionState: ConstructionState;
  floorVisible: boolean;
  floorCurrentMaterial: string | null;
  floorConditionNotes: string | null;
  wallVisible: boolean;
  wallCurrentMaterial: string | null;
  wallConditionNotes: string | null;
  recommendedSurfaces: SurfaceType[];
  doorCount: number;
  windowCount: number;
  fixtures: string[];
  lighting: LightingType | null;
  perspective: PerspectiveType | null;
  warnings: string[];
  /** Full validated raw model response, stored as-is for audit/debugging (jsonb column). */
  rawAiResponse: unknown;
  analysisModel: string;
}

// ---------- Tile candidate (subset of the `tiles` table — DB is source of truth) ----------

export interface TileCandidate {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: TileCategory;
  material: string | null;
  finish: string | null;
  colorFamily: string | null;
  sizeMm: string | null;
  pricePerSqft: number | null;
  suitableRooms: RoomType[];
  storagePath: string;
  isActive: boolean;
}

// ---------- Tile recommendation (maps 1:1 to tile_recommendations table) ----------

export interface TileRecommendation {
  tileId: string;
  surface: SurfaceType;
  rank: number;
  reason: string;
}

// ---------- Visualization generation ----------

export interface GenerateVisualizationInput {
  roomImage: ImageInput;
  tileImage: ImageInput;
  roomAnalysis: RoomAnalysis;
  tile: TileCandidate;
  surfaces: SurfaceType[];
  /** Sanitized customer requirements (untrusted free text, or null/undefined for defaults). */
  requirements?: string | null;
  /** Identifiers used only for logging/correlation — never for authorization decisions here. */
  context: {
    roomUploadId: string;
    visualizationId: string;
    generationJobId: string;
  };
}

export interface GeneratedVisualizationResult {
  imageBuffer: Buffer;
  mimeType: string;
  model: string;
  /** Non-sensitive metadata useful for the caller to log/store. */
  finishReason: string | null;
  durationMs: number;
}
