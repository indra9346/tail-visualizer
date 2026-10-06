/**
 * Shared types for the AI service layer.
 *
 * These mirror the Postgres enums / columns defined in the Phase 0
 * migration (room_analyses, tiles, visualizations tables) so the future
 * database service layer can persist these values without translation.
 * This file has zero dependency on Supabase or any HTTP framework.
 */

import type { DesignPattern } from "./designPatterns.js";
import type { RoomLayout, WallId } from "./roomLayouts.js";

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

/**
 * Surfaces a generation can target. Add a new surface here (plus a DB enum value,
 * a prompt label in prompts/visualizationPrompt.ts and a UI label) to extend the
 * engine to it; nothing else is room-specific.
 */
export const SURFACE_TYPES = ["floor", "wall", "backsplash", "shower_wall", "step_tread", "step_riser"] as const;
export type SurfaceType = (typeof SURFACE_TYPES)[number];

/** Surfaces the room analysis (and tile recommendation) reason about. */
export const ANALYSIS_SURFACES = ["floor", "wall"] as const;

/** Which tile category a surface needs: floors and stair treads take floor tiles; every other surface is vertical (wall-kind). */
export function surfaceKind(surface: SurfaceType): "floor" | "wall" {
  return surface === "floor" || surface === "step_tread" ? "floor" : "wall";
}

/** True if a tile of `category` may be applied to `surface`. */
export function tileSupportsSurface(category: TileCategory, surface: SurfaceType): boolean {
  return category === "both" || category === surfaceKind(surface);
}

export const TILE_STOCK_STATUSES = ["in_stock", "low_stock", "out_of_stock", "made_to_order"] as const;
export type TileStockStatus = (typeof TILE_STOCK_STATUSES)[number];

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
  /** Optional catalog details (used in the prompt when present). */
  description?: string | null;
  tileType?: string | null;
  pattern?: string | null;
  stockStatus?: TileStockStatus;
}

// ---------- Tile recommendation (maps 1:1 to tile_recommendations table) ----------

export interface TileRecommendation {
  tileId: string;
  surface: SurfaceType;
  rank: number;
  reason: string;
}

// ---------- Visualization generation ----------

/** One area of the room (e.g. "back wall") with the ordered tiles and the layout pattern chosen for it. */
export interface DesignAreaInput {
  surface: SurfaceType;
  /** Short sanitized label naming the area (untrusted text, restricted charset). */
  location: string;
  /** Set only for a wall of an L / C layout: which numbered wall this area is (the location is then its canonical label). */
  wall?: WallId;
  /** Optional owner measurement in mm (walls: width x height; floors: length x depth). */
  dimensions?: { widthMm: number; heightMm: number };
  pattern: DesignPattern;
  /** Optional sanitized note refining the pattern (e.g. "dado up to 4 ft"). */
  patternNote?: string | null;
  /** Ordered: position i fills role i of the pattern. */
  tiles: TileCandidate[];
}

export interface GenerateVisualizationInput {
  roomImage: ImageInput;
  /** One reference photo per DISTINCT tile used anywhere in the design. */
  tileImages: Array<{ tileId: string; image: ImageInput }>;
  roomAnalysis: RoomAnalysis;
  areas: DesignAreaInput[];
  /** How the room's walls are connected; `open` (or absent) = free naming, no numbered walls. */
  layout?: RoomLayout;
  /** Sanitized customer requirements (untrusted free text, or null/undefined for defaults). */
  requirements?: string | null;
  /** Room type chosen by the showroom owner (overrides the analysis' guess in the prompt). */
  roomType?: RoomType;
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
