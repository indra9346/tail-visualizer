import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ROOM_ID = "33333333-3333-3333-3333-333333333333";

let geminiReply: () => Promise<{ text: string }> = async () => ({ text: "[]" });
const generateContent = jest.fn((..._args: unknown[]) => geminiReply());
jest.mock("../server/ai/geminiClient", () => ({
  getGeminiClient: () => ({ models: { generateContent } }),
  classifyGeminiError: () => "upstream",
}));
jest.mock("../server/lib/auth", () => ({ authenticateRequest: async () => ({ id: USER_ID, email: null }) }));
jest.mock("../server/db/rooms", () => ({
  verifyRoomOwnership: async () => ({ id: ROOM_ID, userId: USER_ID, storagePath: `${USER_ID}/p1/${ROOM_ID}.jpg` }),
}));
jest.mock("../server/lib/rateLimit", () => ({ checkRateLimit: jest.fn(), RateLimits: { roomAutoMark: { limit: 5, windowMs: 1000 } } }));
const roomPhoto = fs.readFileSync(path.join(__dirname, "fixtures", "room.jpeg"));
jest.mock("../server/storage/imageStorage", () => ({ downloadRoomImage: async () => ({ buffer: roomPhoto, mimeType: "image/jpeg" }) }));

import { autoMarkSurfaces, buildAutoMarkPrompt, parseSegmentation, segmentationToMasks } from "../server/ai/autoMark";
import { decodeMask, maskGrid, paintedCount } from "../server/ai/areaMask";
import * as clientMask from "../client/src/lib/areaMask";
import handler from "../api/_routes/roomAutoMark";
import { makeReq, makeRes } from "./helpers/fakeHttp";

/** A mask picture as Gemini sends it: a grey PNG, white where the surface is. */
async function maskPng(width: number, height: number, white: (x: number, y: number) => boolean): Promise<string> {
  const px = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) px[y * width + x] = white(x, y) ? 255 : 0;
  const png = await sharp(px, { raw: { width, height, channels: 1 } }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
const all = () => true;

describe("reading the model's reply", () => {
  test("a fenced JSON list is read; broken entries are skipped; anything else is no answer", () => {
    const reply = '```json\n[{"label":"floor","box_2d":[500,0,1000,1000],"mask":"data:image/png;base64,AA"},{"label":"wall"},{"box_2d":[1,2,3]}]\n```';
    expect(parseSegmentation(reply)).toEqual([{ label: "floor", box_2d: [500, 0, 1000, 1000], mask: "data:image/png;base64,AA" }]);
    expect(parseSegmentation('{"label":"floor"}')).toBeNull();
    expect(parseSegmentation("Sorry, I cannot")).toBeNull();
  });

  test("the prompt names exactly the surfaces asked, with what each one means", () => {
    const prompt = buildAutoMarkPrompt(["floor", "wall"]);
    expect(prompt).toContain('label "floor"');
    expect(prompt).toContain('label "wall"');
    expect(prompt).not.toContain('label "backsplash"');
    expect(prompt).toMatch(/Not doors, windows/);
  });
});

describe("turning boxes and mask pictures into the owner's mask format", () => {
  const photo = { width: 400, height: 200 }; // grid 256 x 128

  test("the floor box fills the bottom half of the grid, and the masks are the UI's own format", async () => {
    const [floor] = await segmentationToMasks([{ label: "floor", box_2d: [500, 0, 1000, 1000], mask: await maskPng(20, 10, all) }], ["floor"], photo);
    const mask = decodeMask(floor!.mask)!;
    expect([mask.width, mask.height]).toEqual([256, 128]);
    expect(paintedCount(mask)).toBe(256 * 64);
    expect(mask.cells[10 * 256]).toBe(0);
    expect(mask.cells[100 * 256 + 5]).toBe(1);
    // The UI reads it back exactly.
    expect(clientMask.encodeMask(clientMask.decodeMask(floor!.mask)!)).toBe(floor!.mask);
  });

  test("only the white part of a mask picture is marked", async () => {
    // Left half of the box only.
    const [wall] = await segmentationToMasks([{ label: "wall", box_2d: [0, 0, 1000, 1000], mask: await maskPng(40, 20, (x) => x < 20) }], ["wall"], photo);
    const mask = decodeMask(wall!.mask)!;
    expect(mask.cells[64 * 256 + 10]).toBe(1);
    expect(mask.cells[64 * 256 + 240]).toBe(0);
  });

  test("two surfaces never share a cell, labels not asked for are ignored, and a speck counts as not found", async () => {
    const masks = await segmentationToMasks(
      [
        { label: "Floor", box_2d: [400, 0, 1000, 1000], mask: await maskPng(10, 10, all) },
        { label: "wall", box_2d: [0, 0, 600, 1000], mask: await maskPng(10, 10, all) },
        { label: "ceiling", box_2d: [0, 0, 100, 1000], mask: await maskPng(10, 10, all) },
        { label: "step_tread", box_2d: [0, 0, 2, 2], mask: await maskPng(4, 4, all) },
      ],
      ["floor", "wall", "step_tread"],
      photo,
    );
    expect(masks.map((m) => m.surface)).toEqual(["floor", "wall"]);
    const [floor, wall] = masks.map((m) => decodeMask(m.mask)!);
    for (let i = 0; i < floor!.cells.length; i++) expect(floor!.cells[i]! + wall!.cells[i]!).toBeLessThanOrEqual(1);
    expect(paintedCount(floor!) + paintedCount(wall!)).toBe(256 * 128);
  });

  test("a mask that is not a picture is skipped, not fatal", async () => {
    const masks = await segmentationToMasks([{ label: "floor", box_2d: [500, 0, 1000, 1000], mask: "data:image/png;base64,bm90IGFuIGltYWdl" }], ["floor"], photo);
    expect(masks).toEqual([]);
  });

  test("the server's grid is the UI's grid for every photo shape", () => {
    for (const [w, h] of [[4000, 3000], [724, 1600], [100, 100], [3000, 20]]) expect(maskGrid(w!, h!)).toEqual(clientMask.maskGrid(w!, h!));
  });
});

describe("autoMarkSurfaces", () => {
  test("asks Gemini once with the photo and the surfaces, and returns the masks it found", async () => {
    const floor = await maskPng(10, 10, all);
    geminiReply = async () => ({ text: JSON.stringify([{ label: "floor", box_2d: [600, 0, 1000, 1000], mask: floor }]) });
    generateContent.mockClear();
    const masks = await autoMarkSurfaces({ roomUploadId: ROOM_ID, image: { buffer: roomPhoto, mimeType: "image/jpeg" }, surfaces: ["floor", "wall", "floor"] });
    expect(generateContent).toHaveBeenCalledTimes(1);
    const call = generateContent.mock.calls[0]![0] as { contents: Array<{ parts: Array<{ text?: string; inlineData?: unknown }> }> };
    expect(call.contents[0]!.parts.some((p) => p.inlineData)).toBe(true);
    expect(call.contents[0]!.parts.find((p) => p.text)!.text).toContain('label "wall"');
    expect(masks.map((m) => m.surface)).toEqual(["floor"]);
  });

  test("a reply that is not a list gives no masks (the owner marks by hand)", async () => {
    geminiReply = async () => ({ text: "I see a bathroom." });
    expect(await autoMarkSurfaces({ roomUploadId: ROOM_ID, image: { buffer: roomPhoto, mimeType: "image/jpeg" }, surfaces: ["floor"] })).toEqual([]);
  });
});

describe("POST /api/rooms/:id/auto-mark", () => {
  const call = async (body: unknown) => {
    const res = makeRes();
    await handler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, query: { id: ROOM_ID }, body }), res);
    return res;
  };
  afterEach(() => {
    delete process.env.AUTO_MARK_ENABLED;
  });

  test("switched off (the default): answers enabled false and never calls the AI", async () => {
    generateContent.mockClear();
    const res = await call({ surfaces: ["floor"] });
    expect(res.statusCode).toBe(200);
    expect(res._json).toEqual({ enabled: false, masks: [] });
    expect(generateContent).not.toHaveBeenCalled();
  });

  test("switched on: returns the AI's masks", async () => {
    process.env.AUTO_MARK_ENABLED = "1";
    const floor = await maskPng(10, 10, all);
    geminiReply = async () => ({ text: JSON.stringify([{ label: "floor", box_2d: [600, 0, 1000, 1000], mask: floor }]) });
    const res = await call({ surfaces: ["floor"] });
    expect(res.statusCode).toBe(200);
    expect((res._json as { enabled: boolean }).enabled).toBe(true);
    expect((res._json as { masks: Array<{ surface: string }> }).masks.map((m) => m.surface)).toEqual(["floor"]);
  });

  test("an unknown surface or an empty list is refused", async () => {
    process.env.AUTO_MARK_ENABLED = "1";
    expect((await call({ surfaces: ["ceiling"] })).statusCode).toBe(400);
    expect((await call({ surfaces: [] })).statusCode).toBe(400);
  });
});
