import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createFakeTablesClient } from "./helpers/fakeTable";
import { makeReq, makeRes } from "./helpers/fakeHttp";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let currentUser = A;
const uploaded: string[] = [];
const removed: string[] = [];

const client = createFakeTablesClient(
  {},
  {
    unique: { tiles: [["owner_id", "sku"]] },
    restrictDelete: (table, row) => table === "tiles" && client._dump("visualizations").some((v) => v.tile_id === row.id),
  },
);

jest.mock("../server/lib/supabaseServerClient", () => ({ getSupabaseServerClient: () => client }));
jest.mock("../server/lib/auth", () => ({ authenticateRequest: async () => ({ id: currentUser, email: null }) }));
jest.mock("../server/lib/rateLimit", () => ({ checkRateLimit: jest.fn(), RateLimits: {} }));
jest.mock("../server/storage/imageStorage", () => ({
  uploadImage: async (_bucket: string, path: string) => {
    uploaded.push(path);
  },
  deleteImageQuietly: async (_bucket: string, path: string) => {
    removed.push(path);
  },
}));

import handler from "../api/_routes/tilesManage";

let png: string;
beforeAll(async () => {
  const buf = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 190, b: 170 } } }).png().toBuffer();
  png = buf.toString("base64");
});

beforeEach(() => {
  client._reset();
  uploaded.length = 0;
  removed.length = 0;
  currentUser = A;
});

async function call(method: string, opts: { body?: unknown; query?: Record<string, unknown> } = {}) {
  const res = makeRes();
  await handler(makeReq({ method, headers: { authorization: "Bearer x" }, body: opts.body, query: opts.query }), res);
  return { status: res.statusCode as number, json: res._json as any };
}

const newTile = (extra: Record<string, unknown> = {}) => ({
  name: "Carrara White Marble",
  sku: "MAR-001",
  brand: "Acme",
  category: "both",
  material: "porcelain",
  finish: "glossy",
  colorFamily: "white",
  sizeMm: "600x1200",
  pricePerSqft: 125,
  description: "Polished marble-look porcelain.",
  tileType: "Porcelain",
  pattern: "Veined",
  stockStatus: "in_stock",
  suitableRooms: ["bathroom", "kitchen"],
  mimeType: "image/png",
  base64Data: png,
  ...extra,
});

async function createAs(user: string, extra: Record<string, unknown> = {}) {
  currentUser = user;
  return call("POST", { body: newTile(extra) });
}

describe("POST /api/tiles/manage (create)", () => {
  test("creates a tile owned by the caller with all catalog fields and an image under the caller's folder", async () => {
    const r = await createAs(A);
    expect(r.status).toBe(201);
    const row = client._dump("tiles")[0]!;
    expect(row.owner_id).toBe(A);
    expect(row.sku).toBe("MAR-001");
    expect(row).toMatchObject({ description: "Polished marble-look porcelain.", tile_type: "Porcelain", pattern: "Veined", stock_status: "in_stock", price_per_sqft: 125 });
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]!.startsWith(`${A}/`)).toBe(true);
    expect(row.storage_path).toBe(uploaded[0]);
  });

  test("generates a SKU when none is given", async () => {
    const r = await createAs(A, { sku: undefined });
    expect(r.status).toBe(201);
    expect(client._dump("tiles")[0]!.sku).toMatch(/^T-[0-9A-F]{8}$/);
  });

  test("the same SKU can exist in two showrooms but not twice in one", async () => {
    expect((await createAs(A)).status).toBe(201);
    expect((await createAs(B)).status).toBe(201);
    const dup = await createAs(A);
    expect(dup.status).toBe(400);
    expect(dup.json.error.message).toMatch(/already have a tile with this SKU/);
    expect(removed).toContain(uploaded[uploaded.length - 1]); // the orphaned upload is cleaned up
  });

  test("rejects non-image bytes and stores nothing", async () => {
    const r = await createAs(A, { base64Data: Buffer.from("this is not an image at all, just text").toString("base64") });
    expect(r.status).toBe(400);
    expect(uploaded).toHaveLength(0);
    expect(client._dump("tiles")).toHaveLength(0);
  });

  test.each([
    ["owner_id in body (mass assignment)", { owner_id: B }],
    ["ownerId in body", { ownerId: B }],
    ["is_active in body", { is_active: false }],
    ["invalid stockStatus", { stockStatus: "plenty" }],
    ["negative price", { pricePerSqft: -1 }],
    ["missing name", { name: "" }],
    ["overlong description", { description: "x".repeat(1001) }],
  ])("rejects %s", async (_label, extra) => {
    const r = await createAs(A, extra);
    expect(r.status).toBe(400);
    expect(client._dump("tiles")).toHaveLength(0);
  });
});

describe("GET /api/tiles/manage (list) and isolation", () => {
  test("each showroom sees only its own tiles", async () => {
    await createAs(A, { sku: "A-1" });
    await createAs(B, { sku: "B-1" });
    currentUser = A;
    expect((await call("GET")).json.tiles.map((t: any) => t.sku)).toEqual(["A-1"]);
    currentUser = B;
    expect((await call("GET")).json.tiles.map((t: any) => t.sku)).toEqual(["B-1"]);
  });

  test("another showroom cannot edit, deactivate or delete my tile (reported as not found)", async () => {
    const created = (await createAs(A)).json.tile;
    currentUser = B;
    expect((await call("PUT", { body: { tileId: created.id, name: "hacked" } })).status).toBe(404);
    expect((await call("PATCH", { body: { tileId: created.id, isActive: false } })).status).toBe(404);
    expect((await call("DELETE", { query: { tileId: created.id } })).status).toBe(404);
    const row = client._dump("tiles")[0]!;
    expect(row.name).toBe("Carrara White Marble");
    expect(row.is_active).toBe(true);
    expect(removed).toHaveLength(0);
  });
});

describe("PUT /api/tiles/manage (edit)", () => {
  test("changes only the supplied fields; empty string clears a field", async () => {
    const t = (await createAs(A)).json.tile;
    const r = await call("PUT", { body: { tileId: t.id, name: "Carrara Bianco", finish: "", stockStatus: "low_stock", pricePerSqft: 99 } });
    expect(r.status).toBe(200);
    const row = client._dump("tiles")[0]!;
    expect(row).toMatchObject({ name: "Carrara Bianco", finish: null, stock_status: "low_stock", price_per_sqft: 99, brand: "Acme", material: "porcelain" });
  });

  test("replacing the photo uploads the new one and removes the old one", async () => {
    const t = (await createAs(A)).json.tile;
    const oldPath = client._dump("tiles")[0]!.storage_path as string;
    const r = await call("PUT", { body: { tileId: t.id, mimeType: "image/png", base64Data: png } });
    expect(r.status).toBe(200);
    const row = client._dump("tiles")[0]!;
    expect(row.storage_path).not.toBe(oldPath);
    expect((row.storage_path as string).startsWith(`${A}/`)).toBe(true);
    expect(removed).toContain(oldPath);
  });

  test("a bad replacement photo changes nothing", async () => {
    const t = (await createAs(A)).json.tile;
    const before = { ...client._dump("tiles")[0]! };
    const r = await call("PUT", { body: { tileId: t.id, mimeType: "image/png", base64Data: Buffer.from("nope nope nope nope").toString("base64") } });
    expect(r.status).toBe(400);
    expect(client._dump("tiles")[0]).toEqual(before);
  });

  test("a new image needs both mimeType and base64Data", async () => {
    const t = (await createAs(A)).json.tile;
    expect((await call("PUT", { body: { tileId: t.id, base64Data: png } })).status).toBe(400);
  });

  test("renaming the SKU to one already used by the same owner is rejected", async () => {
    await createAs(A, { sku: "ONE" });
    const two = (await createAs(A, { sku: "TWO" })).json.tile;
    const r = await call("PUT", { body: { tileId: two.id, sku: "ONE" } });
    expect(r.status).toBe(400);
  });

  test.each([[{ owner_id: B }], [{ ownerId: B }], [{ storagePath: "x/y.jpg" }], [{ storage_path: "x/y.jpg" }]])("cannot mass-assign %p", async (extra) => {
    const t = (await createAs(A)).json.tile;
    expect((await call("PUT", { body: { tileId: t.id, ...extra } })).status).toBe(400);
  });

  test("unknown tile id -> 404", async () => {
    expect((await call("PUT", { body: { tileId: randomUUID(), name: "x" } })).status).toBe(404);
  });
});

describe("DELETE /api/tiles/manage", () => {
  test("deletes an unused tile and its image", async () => {
    const t = (await createAs(A)).json.tile;
    const path = client._dump("tiles")[0]!.storage_path as string;
    const r = await call("DELETE", { query: { tileId: t.id } });
    expect(r.status).toBe(200);
    expect(client._dump("tiles")).toHaveLength(0);
    expect(removed).toContain(path);
  });

  test("refuses to delete a tile used by a visualization (409 TILE_IN_USE) and keeps its image", async () => {
    const t = (await createAs(A)).json.tile;
    client._seed("visualizations", [{ id: randomUUID(), tile_id: t.id, user_id: A }]);
    const r = await call("DELETE", { query: { tileId: t.id } });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("TILE_IN_USE");
    expect(client._dump("tiles")).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  test("the in-use tile can still be deactivated instead", async () => {
    const t = (await createAs(A)).json.tile;
    client._seed("visualizations", [{ id: randomUUID(), tile_id: t.id, user_id: A }]);
    const r = await call("PATCH", { body: { tileId: t.id, isActive: false } });
    expect(r.status).toBe(200);
    expect(client._dump("tiles")[0]!.is_active).toBe(false);
  });

  test("requires a valid tileId", async () => {
    expect((await call("DELETE", { query: {} })).status).toBe(400);
    expect((await call("DELETE", { query: { tileId: "not-a-uuid" } })).status).toBe(400);
  });

  test("never removes a storage path outside the owner's folder (defense in depth)", async () => {
    const t = (await createAs(A)).json.tile;
    client._dump("tiles")[0]!.storage_path = `${B}/someone-elses.png`; // simulate a corrupted row
    await call("DELETE", { query: { tileId: t.id } });
    expect(removed).toHaveLength(0);
  });
});
