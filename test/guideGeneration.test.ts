import sharp from "sharp";

/**
 * The real generateVisualization() with only the Gemini client replaced: checks what is actually sent to the model
 * when areas were painted on the photo (the guide image right after the photo, the tiles after it, the prompt saying so).
 */

let calls: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];
jest.mock("../server/ai/geminiClient", () => ({
  getGeminiClient: () => ({
    models: {
      generateContent: async (req: { contents: Array<{ parts: never[] }> }) => {
        calls.push({ parts: req.contents[0]!.parts });
        return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("png").toString("base64") } }] }, finishReason: "STOP" }] };
      },
    },
  }),
  classifyGeminiError: () => "upstream",
}));

import { generateVisualization } from "../server/ai/generateVisualization";
import { encodeMask } from "../server/ai/areaMask";
import type { GenerateVisualizationInput, RoomAnalysis, TileCandidate } from "../server/ai/types";

const jpeg = async (w: number, h: number, colour: { r: number; g: number; b: number }) => ({
  buffer: await sharp({ create: { width: w, height: h, channels: 3, background: colour } }).jpeg().toBuffer(),
  mimeType: "image/jpeg",
});

const tile = (id: string, name: string): TileCandidate => ({ id, sku: id, name, brand: null, category: "both", material: null, finish: null, colorFamily: null, sizeMm: "600x600", pricePerSqft: null, suitableRooms: [], storagePath: `o/${id}.jpg`, isActive: true });

const analysis = { roomUploadId: "room", roomType: "bathroom", confidence: 1, constructionState: "unfinished", floorVisible: true, floorCurrentMaterial: null, floorConditionNotes: null, wallVisible: true, wallCurrentMaterial: null, wallConditionNotes: null, recommendedSurfaces: ["floor"], doorCount: 0, windowCount: 0, fixtures: [], lighting: null, perspective: null, warnings: [], rawAiResponse: {}, analysisModel: "m" } as RoomAnalysis;

function floorMask(width: number, height: number): string {
  const cells = new Uint8Array(width * height);
  cells.fill(1, Math.floor(height / 2) * width);
  return encodeMask({ width, height, cells });
}

async function input(withMask: boolean): Promise<GenerateVisualizationInput> {
  return {
    roomImage: await jpeg(320, 240, { r: 120, g: 120, b: 120 }),
    tileImages: [
      { tileId: "t1", image: await jpeg(64, 64, { r: 200, g: 180, b: 150 }) },
      { tileId: "t2", image: await jpeg(64, 64, { r: 40, g: 40, b: 40 }) },
    ],
    roomAnalysis: analysis,
    areas: [
      { surface: "floor", location: "Marked floor", pattern: "single", tiles: [tile("t1", "Beige Stone")], ...(withMask ? { mask: floorMask(64, 48) } : {}) },
      { surface: "wall", location: "All walls", pattern: "single", tiles: [tile("t2", "Charcoal")] },
    ],
    context: { roomUploadId: "room", visualizationId: "viz", generationJobId: "job" },
  };
}

beforeEach(() => {
  calls = [];
});

test("a painted design sends: prompt, photo, guide image, then the tiles in letter order", async () => {
  await generateVisualization(await input(true));
  expect(calls).toHaveLength(1);
  const parts = calls[0]!.parts;
  expect(parts).toHaveLength(5);
  expect(parts[0]!.text).toContain("GUIDE IMAGE (image 2)");
  expect(parts[0]!.text).toContain("AREA 1: ONLY the region painted RED in the GUIDE IMAGE");
  expect(parts[0]!.text).toMatch(/TILE A \(image 3\).*Beige Stone/);

  const photo = Buffer.from(parts[1]!.inlineData!.data, "base64");
  const guide = Buffer.from(parts[2]!.inlineData!.data, "base64");
  const [pm, gm] = await Promise.all([sharp(photo).metadata(), sharp(guide).metadata()]);
  // The guide is drawn on the same prepared copy of the photo, so the two line up exactly.
  expect([gm.width, gm.height]).toEqual([pm.width, pm.height]);
  const { data, info } = await sharp(guide).raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  const [r, g, b] = at(160, 220); // bottom half: painted red
  expect(r! - Math.max(g!, b!)).toBeGreaterThan(60);
  const top = at(160, 20); // top half: the untouched grey photo
  expect(Math.max(...top) - Math.min(...top)).toBeLessThan(12);
});

test("an unpainted design sends no guide image and keeps the old image numbering", async () => {
  await generateVisualization(await input(false));
  const parts = calls[0]!.parts;
  expect(parts).toHaveLength(4);
  expect(parts[0]!.text).not.toMatch(/guide/i);
  expect(parts[0]!.text).toMatch(/TILE A \(image 2\)/);
});
