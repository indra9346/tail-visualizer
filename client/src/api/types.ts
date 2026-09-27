/**
 * Client-side mirrors of the Phase 2 API's JSON response shapes.
 * Kept local to the client (rather than importing server/ai/types.ts)
 * so the frontend build has zero dependency on server source files.
 */

export type RoomType = "kitchen" | "bedroom" | "bathroom" | "living_room" | "dining_room" | "balcony" | "corridor" | "other";
export type ConstructionState = "unfinished" | "under_construction" | "finished_needs_renovation";
export type SurfaceType = "floor" | "wall";
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

export interface Visualization {
  id: string;
  roomUploadId?: string;
  status: VisualizationStatus;
  appliedSurfaces: SurfaceType[];
  tileId?: string;
  tile?: Tile | null;
  errorMessage: string | null;
  requirements?: string | null;
  roomType?: string | null;
  creditsCharged?: number;
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
