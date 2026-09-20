/**
 * Centralized AI service configuration.
 *
 * Model names and timeouts live here ONLY. No other file in this
 * service layer should hard-code a Gemini model string or a magic
 * timeout number.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Defaults verified against a real Gemini API key during the Phase 4 live
// integration check (2026-09-17). "gemini-2.5-flash" is no longer
// available to new API keys — Google's own 404 response for it names
// "gemini-3.6-flash" as the replacement, which was then confirmed
// reachable and working end-to-end (including a real analyzeRoom() call).
// The image model could not be similarly confirmed working: EVERY
// image-capable model tested (gemini-2.5-flash-image, gemini-3.6-flash-image,
// gemini-3.1-flash-image) returned HTTP 429 with `limit: 0` for this
// account specifically — an account/billing-level quota restriction on
// image generation, not a wrong or unavailable model name. gemini-3.1-flash-image
// is kept as the default because `client.models.list()` confirms it exists
// and is the current non-preview "flash" tier image model (see
// scripts/list-gemini-models.ts) — whoever enables image-generation
// billing on the Google Cloud project should re-run the live check to
// confirm it actually works before relying on it in production.
export const aiConfig = {
  models: {
    roomAnalysis: process.env.GEMINI_ROOM_ANALYSIS_MODEL || "gemini-3.6-flash",
    tileRecommendation: process.env.GEMINI_TILE_RECOMMENDATION_MODEL || "gemini-3.6-flash",
    visualization: process.env.GEMINI_VISUALIZATION_MODEL || "gemini-3.1-flash-image",
  },
  timeoutsMs: {
    // Raised from 20 s (Phase 4): a real 4.7 MB phone photo took ~24 s at full size.
    // Images are now downscaled before the call (see prepareImageForModel), but
    // Gemini latency still varies, so keep generous headroom. Worst case with the
    // single bounded retry below is 2 x 50 s = 100 s, inside the 120 s route maxDuration.
    roomAnalysis: envInt("GEMINI_ROOM_ANALYSIS_TIMEOUT_MS", 50_000),
    tileRecommendation: envInt("GEMINI_TILE_RECOMMENDATION_TIMEOUT_MS", 15_000),
    visualization: envInt("GEMINI_VISUALIZATION_TIMEOUT_MS", 45_000),
  },
  retries: {
    roomAnalysis: 1,
    tileRecommendation: 1,
    visualization: 1,
  },
  image: {
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    maxRoomImageBytes: 10 * 1024 * 1024, // 10 MB, matches room-images bucket limit
    maxTileImageBytes: 5 * 1024 * 1024, // 5 MB, matches tile-images bucket limit
    // Size of the transient copy sent to Gemini (stored originals are never resized).
    analysisMaxDimension: 1600,
    generationMaxDimension: 2048,
    modelJpegQuality: 85,
    // Decompression-bomb guard for sharp: 100 megapixels.
    maxInputPixels: 100_000_000,
  },
  recommendation: {
    maxPerSurface: 5,
  },
} as const;
