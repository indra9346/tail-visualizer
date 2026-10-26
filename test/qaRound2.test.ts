import { EventEmitter } from "node:events";
import { buildDesignPrompt } from "../server/ai/prompts/visualizationPrompt";
import { designAreaSchema } from "../server/lib/validation";
import { TEMPLATES, applyTemplate, keptFaces, sortByFaces, templateForDesign, toggleFace } from "../client/src/lib/roomTemplates";
import { chosenTiles, newArea, validateDraft, withPattern, type DraftArea } from "../client/src/lib/designDraft";
import type { DesignAreaInput, RoomAnalysis, TileCandidate } from "../server/ai/types";
import type { Tile } from "../client/src/api/types";
import { makeRes } from "./helpers/fakeHttp";

/** Round 2 of QA: findings from two independent reviews and hands-on testing, each pinned by a test. */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const analysis = { roomType: "kitchen", constructionState: "unfinished", perspective: "straight_on", lighting: "natural", doorCount: 1, windowCount: 0, fixtures: [] } as unknown as RoomAnalysis;
const candidate = (n: number, category: TileCandidate["category"] = "both"): TileCandidate => ({
  id: uuid(n),
  sku: `S${n}`,
  name: `Tile ${n}`,
  brand: null,
  category,
  material: null,
  finish: null,
  colorFamily: null,
  sizeMm: "600x600",
  pricePerSqft: null,
  suitableRooms: [],
  storagePath: `${n}.jpg`,
  isActive: true,
});
const tile = (id: string, category: Tile["category"] = "both"): Tile => ({ id, sku: id, name: `Tile ${id}`, brand: null, category, material: null, finish: null, colorFamily: null, sizeMm: "600x600", pricePerSqft: null, currency: "INR", suitableRooms: [], storagePath: `${id}.jpg`, isActive: true });
const fill = (area: DraftArea, ...tiles: Tile[]): DraftArea => ({ ...area, slots: area.slots.map((_, i) => tiles[i] ?? null) });

describe("the prompt never contradicts what the owner switched on", () => {
  test("kitchen with ONLY the backsplash tiled: the kept walls rule makes an exception for the backsplash zone", () => {
    const p = buildDesignPrompt(analysis, [{ surface: "backsplash", location: "Kitchen backsplash", pattern: "single", tiles: [candidate(1, "wall")] }], null, "REQ-x", "kitchen", "c_shape");
    expect(p).toMatch(/KEEP EXACTLY AS IN THE SOURCE PHOTO[^\n]*C1 \(left wall\), C2 \(middle wall\), C3 \(right wall\)\. The only exception: the backsplash listed below is its own target area/);
    expect(p).toMatch(/Backsplash rule: only the backsplash zone[^\n]*changes/);
  });

  test("no exception text when every wall is tiled or nothing sits on a kept wall", () => {
    const p = buildDesignPrompt(analysis, [{ surface: "wall", location: "C1 (left wall)", wall: "C1", pattern: "single", tiles: [candidate(1, "wall")] }], null, "REQ-x", "kitchen", "c_shape");
    expect(p).not.toMatch(/The only exception/);
  });

  test("a mandir platform is described as that part of the floor, never as the whole floor", () => {
    const p = buildDesignPrompt(analysis, [{ surface: "floor", location: "Mandir platform", pattern: "single", tiles: [candidate(1, "floor")] }], null, "REQ-x", "other", "open");
    expect(p).toMatch(/AREA 1: ONLY the part of the floor named by the label below/);
    expect(p).toMatch(/Floor rule: only the named part of the floor \("Mandir platform"\) changes/);
    expect(p).toMatch(/with only the part of the floor labelled "Mandir platform" \(the rest of the floor left unchanged\) finished/);
    const whole = buildDesignPrompt(analysis, [{ surface: "floor", location: "Entire floor", pattern: "single", tiles: [candidate(1, "floor")] }], null, "REQ-x", "other", "open");
    expect(whole).toMatch(/AREA 1: the floor\n/);
    expect(whole).not.toMatch(/Floor rule/);
  });

  test("the prompt ends with a final check that every target area shows its tile and nothing else changed", () => {
    const p = buildDesignPrompt(analysis, [{ surface: "floor", location: "Entire floor", pattern: "single", tiles: [candidate(1, "floor")] }], null, "REQ-x");
    expect(p).toMatch(/8\. FINAL CHECK[\s\S]*not faint, not partial[\s\S]*OUTPUT:/);
  });
});

describe("switching room templates keeps the owner's choices", () => {
  const washroomWithBackKept = () => {
    let areas = applyTemplate([], "washroom");
    areas = toggleFace(areas, "washroom", "C2");
    return areas.map((a) => (a.wall === "C1" ? fill(a, tile("a", "wall")) : a.wall === "C3" ? fill(a, tile("b", "wall")) : a));
  };

  test("Washroom -> Kitchen: each wall keeps its own tile, the kept back wall stays kept, the backsplash is added", () => {
    const kitchen = applyTemplate(washroomWithBackKept(), "kitchen", "washroom");
    const walls = Object.fromEntries(kitchen.filter((a) => a.wall).map((a) => [a.wall, chosenTiles(a).map((t) => t.id)]));
    expect(walls).toEqual({ C1: ["a"], C3: ["b"] });
    expect(keptFaces(TEMPLATES.kitchen, kitchen).map((f) => f.key)).toEqual(["C2"]);
    expect(kitchen.some((a) => a.surface === "backsplash")).toBe(true);
  });

  test("-> Free naming: the walls become 'Left wall' and 'Right wall' with their tiles; the kept wall is not tiled", () => {
    const free = applyTemplate(washroomWithBackKept(), "free", "washroom");
    const walls = free.filter((a) => a.surface === "wall").map((a) => [a.location, chosenTiles(a)[0]?.id]);
    expect(walls).toEqual([
      ["Left wall", "a"],
      ["Right wall", "b"],
    ]);
    expect(validateDraft(free.map((a) => (chosenTiles(a).length ? a : fill(a, tile("f", "floor")))), "open")).toEqual({});
  });

  test("Staircase -> Free naming -> Kitchen never drags untiled stair areas along (no 7th area)", () => {
    const stairs = applyTemplate([], "staircase");
    const free = applyTemplate(stairs, "free", "staircase");
    const kitchen = applyTemplate(free, "kitchen", "free");
    expect(kitchen.some((a) => a.surface === "step_tread" || a.surface === "step_riser")).toBe(false);
    expect(kitchen.length).toBeLessThanOrEqual(6);
  });

  test("a stair area the owner already tiled survives the same trip", () => {
    const stairs = applyTemplate([], "staircase").map((a) => (a.surface === "step_tread" ? fill(a, tile("t", "floor")) : a));
    const kitchen = applyTemplate(applyTemplate(stairs, "free", "staircase"), "kitchen", "free");
    expect(kitchen.some((a) => a.surface === "step_tread")).toBe(true);
  });

  test("a new room's first guess (floor + wall) -> Staircase leaves no hidden floor card behind", () => {
    const seeded: DraftArea[] = [{ ...newArea("floor"), auto: true }, { ...newArea("wall"), auto: true }];
    expect(applyTemplate(seeded, "staircase", "free").map((a) => a.surface).sort()).toEqual(["step_riser", "step_tread"]);
  });

  test("an area the owner added by hand stays, even untiled", () => {
    const own = newArea("shower_wall");
    expect(applyTemplate([own], "washroom", "free").some((a) => a.key === own.key)).toBe(true);
  });

  test("the template's surfaces are listed in its own order: floor, walls left to right, backsplash", () => {
    const kitchen = applyTemplate([newArea("wall")], "kitchen");
    expect(kitchen.map((a) => a.wall ?? a.surface)).toEqual(["floor", "C1", "C2", "C3", "backsplash"]);
    const shuffled = sortByFaces(TEMPLATES.kitchen, [...kitchen].reverse());
    expect(shuffled.map((a) => a.wall ?? a.surface)).toEqual(["floor", "C1", "C2", "C3", "backsplash"]);
  });

  test("the puja mandir floor is the platform, sent to the server under its own name", () => {
    const floor = applyTemplate([], "puja_mandir").find((a) => a.surface === "floor")!;
    expect(floor.location).toBe("Mandir platform");
  });

  test("'Edit design' reopens the template the design came from", () => {
    const kitchen = applyTemplate([], "kitchen");
    expect(templateForDesign("c_shape", kitchen, "kitchen")).toBe("kitchen");
    expect(templateForDesign("c_shape", applyTemplate([], "washroom"), "bathroom")).toBe("washroom");
    expect(templateForDesign("c_shape", applyTemplate([], "washroom"), "living_room")).toBe("three_walls");
    expect(templateForDesign("l_shape", [], "balcony")).toBe("balcony");
    expect(templateForDesign("l_shape", [], "bathroom")).toBe("washroom_corner");
    expect(templateForDesign("open", applyTemplate([], "staircase"))).toBe("staircase");
    expect(templateForDesign("open", [newArea("floor")])).toBe("free");
  });
});

describe("small things an owner would trip over", () => {
  test("a stair riser half a foot high is a valid measurement on the server too", () => {
    expect(designAreaSchema.safeParse({ surface: "step_riser", location: "All stair risers", pattern: "single", tileIds: [uuid(1)], dimensions: { widthMm: 1200, heightMm: 152 } }).success).toBe(true);
  });

  test("an empty slot before a filled one says exactly which slot to fill", () => {
    const area = fill(withPattern(newArea("wall"), "horizontal_bands"), tile("a", "wall"), tile("b", "wall"));
    const gap = { ...area, slots: [area.slots[0]!, null, tile("c", "wall"), null] };
    expect(validateDraft([gap])[gap.key]!.join(" ")).toMatch(/Choose a tile for "second band", or remove the tiles after it/);
  });
});

describe("the same design gives the same picture", () => {
  const { generationKey } = require("../server/ai/generateVisualization");
  const base = {
    areas: [{ surface: "floor", location: "Entire floor", pattern: "single", tiles: [candidate(1, "floor")] }] as DesignAreaInput[],
    requirements: "Keep the basin",
    layout: "open" as const,
    roomType: "bathroom" as const,
    context: { roomUploadId: "room-1", visualizationId: "v1", generationJobId: "j1", attemptNumber: 1 },
  };

  test("same room + design: same prompt fence and same seed; a retry gets a new seed but the same fence", () => {
    const a = generationKey(base);
    const b = generationKey({ ...base, context: { ...base.context, visualizationId: "v2", generationJobId: "j2" } });
    expect(b).toEqual(a);
    const retry = generationKey({ ...base, context: { ...base.context, attemptNumber: 2 } });
    expect(retry.boundary).toBe(a.boundary);
    expect(retry.seed).not.toBe(a.seed);
    expect(a.boundary).toMatch(/^REQ-[0-9a-f]{16}$/);
    expect(Number.isInteger(a.seed) && a.seed >= 0 && a.seed <= 0x7fffffff).toBe(true);
  });

  test("a different tile, room or requirement gives a different seed", () => {
    const a = generationKey(base).seed;
    expect(generationKey({ ...base, areas: [{ ...base.areas[0]!, tiles: [candidate(2, "floor")] }] }).seed).not.toBe(a);
    expect(generationKey({ ...base, context: { ...base.context, roomUploadId: "room-2" } }).seed).not.toBe(a);
    expect(generationKey({ ...base, requirements: "Matt finish" }).seed).not.toBe(a);
  });
});

describe("generateVisualization asks the model for a faithful, repeatable edit", () => {
  test("sends a low temperature and the design's seed", async () => {
    jest.resetModules();
    const calls: any[] = [];
    jest.doMock("../server/ai/geminiClient", () => ({
      getGeminiClient: () => ({
        models: {
          generateContent: async (req: any) => {
            calls.push(req);
            return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("png").toString("base64") } }] }, finishReason: "STOP" }] };
          },
        },
      }),
      classifyGeminiError: () => "upstream",
    }));
    const sharp = require("sharp");
    const jpeg = async (w: number, h: number) => ({ buffer: await sharp({ create: { width: w, height: h, channels: 3, background: "#cccccc" } }).jpeg().toBuffer(), mimeType: "image/jpeg" });
    const { generateVisualization, generationKey } = require("../server/ai/generateVisualization");
    const { aiConfig } = require("../server/ai/config");
    const input = {
      roomImage: await jpeg(800, 600),
      tileImages: [{ tileId: uuid(1), image: await jpeg(300, 300) }],
      roomAnalysis: analysis,
      areas: [{ surface: "floor", location: "Entire floor", pattern: "single", tiles: [candidate(1, "floor")] }],
      requirements: null,
      layout: "open",
      context: { roomUploadId: "room-1", visualizationId: "v1", generationJobId: "j1", attemptNumber: 1 },
    };
    await generateVisualization(input);
    expect(calls).toHaveLength(1);
    expect(calls[0].config.temperature).toBe(aiConfig.sampling.visualizationTemperature);
    expect(calls[0].config.temperature).toBeLessThanOrEqual(0.5);
    expect(calls[0].config.seed).toBe(generationKey(input).seed);
    jest.dontMock("../server/ai/geminiClient");
  });
});

describe("Razorpay webhook: no payment is ever lost, no refund takes too much", () => {
  function rawReq(body: object) {
    const req: any = new EventEmitter();
    req.method = "POST";
    req.headers = { "x-razorpay-signature": "sig", "x-razorpay-event-id": "evt_1" };
    setImmediate(() => {
      req.emit("data", Buffer.from(JSON.stringify(body)));
      req.emit("end");
    });
    return req;
  }

  function loadWebhook(overrides: Record<string, jest.Mock>) {
    jest.resetModules();
    const billing = {
      applyPaidPayment: jest.fn(async () => ({ credited: true, duplicate: false, credits: 50 })),
      markPaymentFailed: jest.fn(async () => undefined),
      applyRefund: jest.fn(async () => undefined),
      recordWebhookEventOnce: jest.fn(async () => true),
      forgetWebhookEvent: jest.fn(async () => undefined),
      ...overrides,
    };
    jest.doMock("../server/db/billing", () => billing);
    jest.doMock("../server/billing/razorpay", () => ({ verifyWebhookSignature: () => true }));
    const handler = require("../api/razorpayWebhook").default;
    return { handler, billing };
  }

  afterEach(() => {
    jest.dontMock("../server/db/billing");
    jest.dontMock("../server/billing/razorpay");
  });

  const captured = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 49900, currency: "INR", status: "captured" } } } };

  test("a database error while crediting answers 500 and forgets the event, so Razorpay's retry is processed", async () => {
    const { handler, billing } = loadWebhook({ applyPaidPayment: jest.fn(async () => Promise.reject(new Error("db down"))) });
    const res = makeRes();
    await handler(rawReq(captured), res);
    expect(res.statusCode).toBe(500);
    expect(billing.forgetWebhookEvent).toHaveBeenCalledWith("evt_1");
  });

  test("a successful credit answers 200 and keeps the event recorded", async () => {
    const { handler, billing } = loadWebhook({});
    const res = makeRes();
    await handler(rawReq(captured), res);
    expect(res.statusCode).toBe(200);
    expect(billing.applyPaidPayment).toHaveBeenCalledWith("order_1", "pay_1", 49900, "INR");
    expect(billing.forgetWebhookEvent).not.toHaveBeenCalled();
  });

  const refund = (refunded: number) => ({
    event: "refund.processed",
    payload: {
      payment: { entity: { id: "pay_1", order_id: "order_1", amount: 129900, currency: "INR", status: "refunded", amount_refunded: refunded } },
      refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: refunded } },
    },
  });

  test("a partial refund does NOT take the whole pack's credits back", async () => {
    const { handler, billing } = loadWebhook({});
    const res = makeRes();
    await handler(rawReq(refund(20000)), res);
    expect(res.statusCode).toBe(200);
    expect(billing.applyRefund).not.toHaveBeenCalled();
  });

  test("a full refund reclaims the pack", async () => {
    const { handler, billing } = loadWebhook({});
    const res = makeRes();
    await handler(rawReq(refund(129900)), res);
    expect(res.statusCode).toBe(200);
    expect(billing.applyRefund).toHaveBeenCalledWith("order_1", "rfnd_1");
  });
});
