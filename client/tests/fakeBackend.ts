import { vi } from "vitest";
// The REAL request schema of POST /api/visualizations/generate: whatever the Design Studio sends must pass it.
import { generateVisualizationBodySchema } from "../../server/lib/validation";
import type { RoomAnalysis, Tile, Visualization } from "@/api/types";

export const ROOM_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_ROOM_ID = "99999999-9999-4999-8999-999999999999";

/** 72 tiles (more than one 50-tile page), newest first like the server: tile 72 is the newest, tile 1 the oldest. */
export function makeCatalog(count = 72): Tile[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`,
      sku: `SDS-${n}`,
      name: `Tile ${n}`,
      brand: null,
      category: n % 3 === 0 ? "floor" : n % 3 === 1 ? "wall" : "both",
      material: "ceramic",
      finish: "matte",
      colorFamily: "beige",
      sizeMm: "600x600",
      pricePerSqft: 50,
      currency: "INR",
      suitableRooms: [],
      storagePath: `owner-1/tile-${n}.jpg`,
      isActive: true,
    } satisfies Tile;
  }).reverse();
}

export function makeAnalysis(roomUploadId: string, recommendedSurfaces: RoomAnalysis["recommendedSurfaces"] = ["floor", "wall"]): RoomAnalysis {
  return {
    id: `analysis-${roomUploadId}`,
    roomUploadId,
    roomType: "bathroom",
    confidence: 0.9,
    constructionState: "unfinished",
    floorVisible: true,
    floorCurrentMaterial: null,
    floorConditionNotes: null,
    wallVisible: true,
    wallCurrentMaterial: null,
    wallConditionNotes: null,
    recommendedSurfaces,
    doorCount: 1,
    windowCount: 1,
    fixtures: [],
    lighting: "natural",
    perspective: "straight_on",
    warnings: [],
    createdAt: "2026-10-24T00:00:00Z",
  };
}

type Json = Record<string, unknown>;
type Handler = (url: URL, body: unknown) => { status?: number; json: unknown } | undefined;

export interface FakeBackend {
  tiles: Tile[];
  analyses: Record<string, RoomAnalysis>;
  balance: number;
  /** Every generate body the page sent, as JSON. */
  generateBodies: unknown[];
  /** Every request path, e.g. "GET /api/tiles/search?page=2&pageSize=50". */
  calls: string[];
  /** Answer the next generate call with this error instead of success. */
  generateError: { status: number; code: string; message: string } | null;
  history: Visualization[];
  payments: unknown[];
  /** Extra or overriding routes for one test. */
  extra: Handler | null;
  /** Rooms the page asked the AI to check (POST /api/rooms/:id/analyze). */
  analyzed: string[];
  projects: Array<{ id: string; name: string; createdAt: string }>;
  /** Room photos uploaded, as { projectId }. */
  uploads: Array<{ projectId: string }>;
}

/** Installs a fetch stub that answers like the real API, and returns its state for assertions. */
export function installFakeBackend(): FakeBackend {
  const state: FakeBackend = {
    tiles: makeCatalog(),
    analyses: { [ROOM_ID]: makeAnalysis(ROOM_ID) },
    balance: 50,
    generateBodies: [],
    calls: [],
    generateError: null,
    history: [],
    payments: [],
    extra: null,
    analyzed: [],
    projects: [],
    uploads: [],
  };

  const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  const error = (status: number, code: string, message: string) => reply(status, { error: { code, message } });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://localhost:3000");
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
      state.calls.push(`${method} ${url.pathname}${url.search}`);
      const custom = state.extra?.(url, body);
      if (custom) return reply(custom.status ?? 200, custom.json);

      const p = url.pathname;
      const analyze = /^\/api\/rooms\/([0-9a-z-]{4,36})\/analyze$/.exec(p);
      if (analyze && method === "POST") {
        const id = analyze[1]!;
        state.analyzed.push(id);
        state.analyses[id] ??= makeAnalysis(id);
        return reply(200, { analysis: state.analyses[id], reused: false });
      }
      if (p === "/api/projects" && method === "GET") return reply(200, { projects: state.projects });
      if (p === "/api/projects" && method === "POST") {
        const project = { id: `project-${state.projects.length + 1}`, name: (body as { name: string }).name, createdAt: "2026-10-26T00:00:00Z" };
        state.projects.unshift(project);
        return reply(200, { project });
      }
      if (p === "/api/rooms/upload" && method === "POST") {
        const { projectId } = body as { projectId: string };
        state.uploads.push({ projectId });
        return reply(200, { room: { id: ROOM_ID, projectId, status: "uploaded", createdAt: "2026-10-26T00:00:00Z" } });
      }
      const room = /^\/api\/rooms\/([0-9a-f-]{36})(\/analysis)?$/.exec(p);
      if (room) {
        const id = room[1]!;
        if (room[2]) return state.analyses[id] ? reply(200, { analysis: state.analyses[id] }) : error(404, "ANALYSIS_NOT_FOUND", "No analysis exists for this room yet.");
        return reply(200, { room: { id, projectId: "p1", status: "analyzed", createdAt: "2026-10-24T00:00:00Z", imageUrl: "https://img.test/room.jpg" } });
      }
      if (p === "/api/tiles/search") {
        const page = Number(url.searchParams.get("page") ?? 1);
        const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
        if (pageSize > 50) return error(400, "VALIDATION_ERROR", "pageSize must be at most 50");
        const q = url.searchParams.get("q")?.toLowerCase();
        const list = state.tiles.filter((t) => t.isActive && (!q || t.name.toLowerCase().includes(q)));
        return reply(200, { tiles: list.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: list.length });
      }
      if (p === "/api/tiles/recommend") return reply(200, { recommendations: [], reused: true });
      if (p === "/api/tiles/manage" && method === "GET") return reply(200, { tiles: state.tiles });
      if (p === "/api/tiles/manage" && method === "PATCH") {
        const { tileId, isActive } = body as { tileId: string; isActive: boolean };
        const t = state.tiles.find((x) => x.id === tileId);
        if (!t) return error(404, "TILE_NOT_FOUND", "Tile not found.");
        t.isActive = isActive;
        return reply(200, { tile: t });
      }
      if (p === "/api/billing/payments") return reply(200, { payments: state.payments });
      if (p === "/api/billing/transactions") return reply(200, { transactions: [] });
      if (p === "/api/billing/summary") return reply(200, { summary: { balance: state.balance, used: {}, generations: {}, payments: {} } });
      if (p === "/api/billing/packages") return reply(200, { packages: [], generationCreditCost: 10 });
      if (p === "/api/visualizations/history") {
        const before = url.searchParams.get("before");
        const list = state.history.filter((v) => !before || v.createdAt < before);
        return reply(200, { visualizations: list.slice(0, 50), hasMore: list.length > 50 });
      }
      if (p === "/api/visualizations/generate" && method === "POST") {
        state.generateBodies.push(body);
        const parsed = generateVisualizationBodySchema.safeParse(body);
        if (!parsed.success) return error(400, "VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(" "));
        if (state.generateError) return error(state.generateError.status, state.generateError.code, state.generateError.message);
        return reply(200, { visualization: { id: "33333333-3333-4333-8333-333333333333", status: "completed", tileId: "x", surfaces: [], resultImageUrl: "https://img.test/r.png", attemptNumber: 1 } });
      }
      return error(404, "NOT_FOUND", `fake backend: no route for ${method} ${p}`);
    }),
  );
  return state;
}

export const lastJson = (state: FakeBackend) => state.generateBodies[state.generateBodies.length - 1] as Json;
