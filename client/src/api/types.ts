/**
 * Client-side mirrors of the Phase 2 API's JSON response shapes.
 * Kept local to the client (rather than importing server/ai/types.ts)
 * so the frontend build has zero dependency on server source files.
 */

export type RoomType = "kitchen" | "bedroom" | "bathroom" | "living_room" | "dining_room" | "balcony" | "corridor" | "other";
export type ConstructionState = "unfinished" | "under_construction" | "finished_needs_renovation";
export type SurfaceType = "floor" | "wall" | "backsplash" | "shower_wall" | "step_tread" | "step_riser";
export type TileCategory = "floor" | "wall" | "both";
export type LightingType = "natural" | "artificial" | "mixed" | "low_light";
export type PerspectiveType = "straight_on" | "angled" | "wide_angle";
export type RoomUploadStatus = "uploaded" | "analyzing" | "analyzed" | "failed";
export type VisualizationStatus = "pending" | "generating" | "completed" | "failed";

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface RoomUpload {
  id: string;
  projectId: string;
  status: RoomUploadStatus;
  errorMessage?: string | null;
  createdAt: string;
  imageUrl?: string;
}

export interface RoomAnalysis {
  id: string;
  roomUploadId: string;
  roomType: RoomType;
  confidence: number;
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
  createdAt: string;
}

export interface Tile {
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
  currency: string;
  suitableRooms: RoomType[];
  storagePath: string;
  isActive: boolean;
}

export interface TileRecommendation {
  tileId: string;
  surface: SurfaceType;
  rank: number;
  reason: string;
  tile: Tile;
}

export type DesignPatternId =
  | "single"
  | "checkerboard"
  | "horizontal_bands"
  | "vertical_stripes"
  | "dado"
  | "highlighter_strip"
  | "border_frame"
  | "feature_panel"
  | "herringbone"
  | "diagonal"
  | "random_mix";

/** One area of the room with the ordered tiles and layout chosen for it (as stored by the server). */
export interface DesignArea {
  surface: SurfaceType;
  location: string;
  pattern: DesignPatternId;
  patternNote: string | null;
  tileIds: string[];
}

export interface Design {
  areas: DesignArea[];
}

export interface Visualization {
  id: string;
  roomUploadId?: string;
  status: VisualizationStatus;
  appliedSurfaces: SurfaceType[];
  tileId?: string;
  tile?: Tile | null;
  /** Per-area tiles and layouts; null for visualizations made before the Design Studio. */
  design?: Design | null;
  /** The tiles referenced by `design`, so the result page can show names and photos. */
  designTiles?: Tile[];
  errorMessage: string | null;
  requirements?: string | null;
  roomType?: string | null;
  creditsCharged?: number;
  /** Owner-controlled: true if visible on the signed-out public feed. Absent on some list shapes (always true there, by construction). */
  isPublic?: boolean;
  /** Only present on the single-visualization GET (result page): whether the current caller is its owner. */
  isOwner?: boolean;
  createdAt: string;
  completedAt: string | null;
  resultImageUrl: string | null;
  attemptNumber?: number;
  latestAttempt?: { attemptNumber: number; status: string } | null;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}
