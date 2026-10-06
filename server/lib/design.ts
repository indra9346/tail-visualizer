import { createHash } from "node:crypto";
import type { DesignInput } from "./validation.js";
import type { DesignPattern } from "../ai/designPatterns.js";
import { wallSpec, type RoomLayout, type WallId } from "../ai/roomLayouts.js";
import type { SurfaceType } from "../ai/types.js";

export interface NormalizedArea {
  surface: SurfaceType;
  location: string;
  /** Present only for a numbered wall of an L / C layout. */
  wall?: WallId;
  /** Optional owner measurement in mm; absent for every design saved before sizes existed. */
  dimensions?: { widthMm: number; heightMm: number };
  pattern: DesignPattern;
  patternNote: string | null;
  tileIds: string[];
}

export interface NormalizedDesign {
  /** Present only for an L / C layout; absent = free naming (and for every design saved before layouts existed). */
  layout?: RoomLayout;
  areas: NormalizedArea[];
}

/** Accepts either a design or the legacy tileId + surfaces pair and returns the one canonical shape the server works with. */
export function normalizeDesign(body: { design?: DesignInput; tileId?: string; surfaces?: SurfaceType[] }): NormalizedDesign {
  if (body.design) {
    const layout = body.design.layout;
    return {
      ...(layout !== "open" ? { layout } : {}),
      areas: body.design.areas.map((a) => {
        // A numbered wall's name is always the canonical label, never client text, so it cannot be mistyped or spoofed.
        const spec = layout !== "open" && a.wall ? wallSpec(layout, a.wall) : undefined;
        return {
          surface: a.surface,
          location: spec ? spec.label : a.location,
          ...(spec ? { wall: spec.id } : {}),
          ...(a.dimensions ? { dimensions: { widthMm: a.dimensions.widthMm, heightMm: a.dimensions.heightMm } } : {}),
          pattern: a.pattern,
          patternNote: a.patternNote ?? null,
          tileIds: [...a.tileIds],
        };
      }),
    };
  }
  return {
    areas: (body.surfaces ?? []).map((surface) => ({
      surface,
      location: "entire surface",
      pattern: "single" as const,
      patternNote: null,
      tileIds: [body.tileId as string],
    })),
  };
}

export function designSurfaces(design: NormalizedDesign): SurfaceType[] {
  return [...new Set(design.areas.map((a) => a.surface))];
}

export function designTileIds(design: NormalizedDesign): string[] {
  return [...new Set(design.areas.flatMap((a) => a.tileIds))];
}

/**
 * Stable fingerprint of WHAT is being generated (areas, patterns, tiles — not the
 * free-text requirements). Order of areas does not matter; tile order inside an
 * area does (it assigns pattern roles). Used so an identical request after a
 * failure or a double-click maps to the same visualization and its retry budget.
 *
 * A free-naming design hashes exactly as it did before layouts existed, so
 * visualizations saved earlier keep matching their retries. Layout and wall ids
 * only enter the hash when a layout is in use.
 */
export function designHash(design: NormalizedDesign): string {
  const canonical = [...design.areas]
    .map((a) => ({ s: a.surface, l: a.location.toLowerCase(), p: a.pattern, n: (a.patternNote ?? "").toLowerCase(), t: a.tileIds, ...(a.wall ? { w: a.wall } : {}), ...(a.dimensions ? { d: [a.dimensions.widthMm, a.dimensions.heightMm] } : {}) }))
    .sort((x, y) => `${x.s}|${x.l}`.localeCompare(`${y.s}|${y.l}`));
  const payload = design.layout && design.layout !== "open" ? { layout: design.layout, areas: canonical } : canonical;
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
