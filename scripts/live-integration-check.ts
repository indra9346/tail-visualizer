/**
 * Phase 4 live-integration check — LOCAL/DEV ONLY.
 *
 * Calls the REAL application AI service layer (server/ai/*) directly
 * against the real Gemini API using GEMINI_API_KEY from a root .env file.
 * Never imported by api/ or server/ application code — this is a
 * standalone diagnostic script, run via `npm run live-check`.
 *
 * SECURITY: this script must never print, log, or return the API key
 * itself. Only presence/length checks and safe error categories are
 * reported.
 */
import "../server/lib/loadLocalEnv.js";

import { randomUUID } from "node:crypto";
import { getGeminiClient, classifyGeminiError } from "../server/ai/geminiClient.js";
import { aiConfig } from "../server/ai/config.js";
import { analyzeRoom } from "../server/ai/analyzeRoom.js";
import { recommendTiles } from "../server/ai/recommendTiles.js";
import { generateVisualization } from "../server/ai/generateVisualization.js";
import { AiServiceError } from "../server/ai/errors.js";
import type { RoomAnalysis, TileCandidate } from "../server/ai/types.js";

// A real, minimal, valid 1x1 JPEG — passes our own magic-byte validation
// and is a real (if trivial) image for Gemini to actually process.
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

function tinyJpegBuffer(): Buffer {
  return Buffer.from(TINY_JPEG_BASE64, "base64");
}

function reportError(label: string, err: unknown) {
  if (err instanceof AiServiceError) {
    console.log(`  [FAIL] ${label}: code=${err.code} retryable=${err.retryable} safeMessage="${err.safeMessage}"`);
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  // Defensive redaction in case an SDK error message ever echoed a header/key fragment.
  const redacted = message.replace(/[A-Za-z0-9_-]{20,}/g, "<redacted>");
  console.log(`  [FAIL] ${label}: ${redacted}`);
}

async function checkGeminiKeyPresence(): Promise<boolean> {
  const present = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
  console.log(`GEMINI_API_KEY exists: ${present ? "YES" : "NO"} (value never printed)`);
  return present;
}

async function checkRawConnectivity(): Promise<boolean> {
  console.log("\n=== 1. Raw Gemini connectivity (text) via existing geminiClient.ts ===");
  try {
    const client = getGeminiClient();
    const model = aiConfig.models.roomAnalysis;
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "Reply with exactly the single word: ok" }] }],
    });
    const text = (response.text ?? "").trim();
    console.log(`  [OK] model="${model}" reachable, authenticated, responded (${text.length} chars)`);
    return true;
  } catch (err) {
    const category = classifyGeminiError(err);
    console.log(`  errorCategory=${category}`);
    reportError("raw connectivity", err);
    return false;
  }
}

async function checkImageModelAvailability(): Promise<boolean> {
  console.log("\n=== 2. Image-capable model availability (text-only ping) ===");
  try {
    const client = getGeminiClient();
    const model = aiConfig.models.visualization;
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "Reply with exactly the single word: ok" }] }],
    });
    console.log(`  [OK] model="${model}" accepted the request (finishReason=${response.candidates?.[0]?.finishReason ?? "n/a"})`);
    return true;
  } catch (err) {
    reportError(`image model "${aiConfig.models.visualization}" availability`, err);
    return false;
  }
}

async function checkRoomAnalysis(): Promise<RoomAnalysis | null> {
  console.log("\n=== 3. Real analyzeRoom() — structured JSON response, real image ===");
  try {
    const result = await analyzeRoom({ roomUploadId: randomUUID(), image: { buffer: tinyJpegBuffer(), mimeType: "image/jpeg" } });
    console.log(
      `  [OK] roomType=${result.roomType} confidence=${result.confidence} constructionState=${result.constructionState} recommendedSurfaces=[${result.recommendedSurfaces.join(",")}] warnings=${result.warnings.length}`,
    );
    return result;
  } catch (err) {
    reportError("analyzeRoom", err);
    return null;
  }
}

async function checkTileRecommendation(analysisFromRoom: RoomAnalysis): Promise<void> {
  console.log("\n=== 4. Real recommendTiles() — anti-hallucination against a fabricated candidate set ===");
  // Forces a non-empty recommendedSurfaces regardless of what the trivial
  // test image produced, so the deterministic filter actually finds an
  // eligible candidate and the real Gemini ranking call fires (rather
  // than being correctly skipped for lack of any eligible surface).
  const analysis: RoomAnalysis = { ...analysisFromRoom, recommendedSurfaces: ["floor"] };
  const realTileId = randomUUID();
  const candidates: TileCandidate[] = [
    {
      id: realTileId,
      sku: "LIVE-TEST-SKU-1",
      name: "Live Test Porcelain Floor Tile",
      brand: "TestBrand",
      category: "floor",
      material: "porcelain",
      finish: "matte",
      colorFamily: "grey",
      sizeMm: "600x600",
      pricePerSqft: 45,
      suitableRooms: [analysis.roomType],
      storagePath: "catalog/live-test-tile.jpg",
      isActive: true,
    },
  ];

  try {
    const recs = await recommendTiles(analysis, candidates);
    const allIdsAreReal = recs.every((r) => r.tileId === realTileId);
    console.log(`  [OK] ${recs.length} recommendation(s) returned; all reference the real candidate id: ${allIdsAreReal}`);
    if (!allIdsAreReal) {
      console.log("  [SECURITY] a recommendation referenced an id NOT in the candidate set — this should be impossible; investigate immediately.");
    }
  } catch (err) {
    reportError("recommendTiles", err);
  }
}

async function checkVisualizationGeneration(analysis: RoomAnalysis): Promise<void> {
  console.log("\n=== 5. Real generateVisualization() — image generation ===");
  const tile: TileCandidate = {
    id: randomUUID(),
    sku: "LIVE-TEST-SKU-1",
    name: "Live Test Porcelain Floor Tile",
    brand: "TestBrand",
    category: "floor",
    material: "porcelain",
    finish: "matte",
    colorFamily: "grey",
    sizeMm: "600x600",
    pricePerSqft: 45,
    suitableRooms: [analysis.roomType],
    storagePath: "catalog/live-test-tile.jpg",
    isActive: true,
  };

  try {
    const result = await generateVisualization({
      roomImage: { buffer: tinyJpegBuffer(), mimeType: "image/jpeg" },
      tileImages: [{ tileId: tile.id, image: { buffer: tinyJpegBuffer(), mimeType: "image/jpeg" } }],
      roomAnalysis: analysis,
      areas: [{ surface: "floor", location: "entire floor", pattern: "single", tiles: [tile] }],
      context: { roomUploadId: analysis.roomUploadId, visualizationId: randomUUID(), generationJobId: randomUUID() },
    });
    console.log(`  [OK] generated image: ${result.imageBuffer.length} bytes, mimeType=${result.mimeType}, model=${result.model}`);
  } catch (err) {
    reportError("generateVisualization", err);
  }
}

async function main() {
  console.log("Phase 4 live Gemini integration check — using the real application AI service layer.\n");

  const hasKey = await checkGeminiKeyPresence();
  if (!hasKey) {
    console.log("\nGEMINI_API_KEY not found even after loading .env — stopping. Check server/lib/loadLocalEnv.ts and .env contents.");
    process.exit(1);
  }

  const connectivityOk = await checkRawConnectivity();
  if (!connectivityOk) {
    console.log("\nStopping further checks — base connectivity/auth failed.");
    process.exit(1);
  }

  await checkImageModelAvailability();

  const analysis = await checkRoomAnalysis();
  if (analysis) {
    await checkTileRecommendation(analysis);
    await checkVisualizationGeneration(analysis);
  } else {
    console.log("\nSkipping recommendation/visualization checks — room analysis failed.");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  reportError("unexpected top-level failure", err);
  process.exit(1);
});
