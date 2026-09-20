let geminiResponseText = "{}";

jest.mock("../server/ai/geminiClient", () => ({
  getGeminiClient: () => ({
    models: {
      generateContent: async () => ({ text: geminiResponseText }),
    },
  }),
  classifyGeminiError: () => "upstream",
}));

import { recommendTiles } from "../server/ai/recommendTiles";
import type { RoomAnalysis, TileCandidate } from "../server/ai/types";

const baseAnalysis: RoomAnalysis = {
  roomUploadId: "room-1",
  roomType: "bathroom",
  confidence: 0.9,
  constructionState: "unfinished",
  floorVisible: true,
  floorCurrentMaterial: "bare concrete",
  floorConditionNotes: null,
  wallVisible: true,
  wallCurrentMaterial: "plaster",
  wallConditionNotes: null,
  recommendedSurfaces: ["floor", "wall"],
  doorCount: 1,
  windowCount: 1,
  fixtures: ["sink"],
  lighting: "natural",
  perspective: "straight_on",
  warnings: [],
  rawAiResponse: {},
  analysisModel: "gemini-2.5-flash",
};

const validFloorTile: TileCandidate = {
  id: "real-floor-tile",
  sku: "SKU-1",
  name: "Real Floor Tile",
  brand: "Acme",
  category: "floor",
  material: "porcelain",
  finish: "matte",
  colorFamily: "grey",
  sizeMm: "600x600",
  pricePerSqft: 40,
  suitableRooms: ["bathroom"],
  storagePath: "catalog/real-floor-tile.jpg",
  isActive: true,
};

const inactiveWallTile: TileCandidate = {
  ...validFloorTile,
  id: "inactive-wall-tile",
  category: "wall",
  isActive: false,
};

describe("recommendTiles anti-hallucination safety", () => {
  test("inactive tiles are never sent to the AI and never returned", async () => {
    geminiResponseText = JSON.stringify({ recommendations: [] });

    const result = await recommendTiles(baseAnalysis, [validFloorTile, inactiveWallTile]);
    // No eligible wall candidate (inactive), and the AI returned nothing for floor.
    expect(result).toEqual([]);
    expect(result.some((r) => r.tileId === "inactive-wall-tile")).toBe(false);
  });

  test("a fake tileId invented by the AI is discarded, never returned to the caller", async () => {
    geminiResponseText = JSON.stringify({
      recommendations: [
        { tileId: "real-floor-tile", surface: "floor", rank: 1, reason: "Good match." },
        { tileId: "totally-fake-tile-id-not-in-db", surface: "floor", rank: 2, reason: "Invented product." },
      ],
    });

    const result = await recommendTiles(baseAnalysis, [validFloorTile]);

    expect(result).toHaveLength(1);
    expect(result[0]?.tileId).toBe("real-floor-tile");
    expect(result.some((r) => r.tileId === "totally-fake-tile-id-not-in-db")).toBe(false);
  });

  test("a real candidate tile assigned by the AI to an incompatible surface is discarded", async () => {
    // real-floor-tile (category: "floor") is a valid candidate for the "floor"
    // surface and therefore reaches the AI in the flattened candidate list,
    // but here the AI (hallucinating) assigns it to "wall" instead — the
    // category-vs-surface check must still reject it even though the ID itself is real.
    geminiResponseText = JSON.stringify({
      recommendations: [{ tileId: "real-floor-tile", surface: "wall", rank: 1, reason: "Mismatched surface." }],
    });

    const result = await recommendTiles({ ...baseAnalysis, recommendedSurfaces: ["floor", "wall"] }, [validFloorTile]);

    expect(result).toEqual([]);
  });

  test("falls back to deterministic ranking (no fake data) if the AI response is malformed after retry", async () => {
    geminiResponseText = "not valid json at all";

    const result = await recommendTiles(baseAnalysis, [validFloorTile]);

    expect(result).toHaveLength(1);
    expect(result[0]?.tileId).toBe("real-floor-tile");
    expect(result[0]?.reason).toContain("catalog");
  });
});
