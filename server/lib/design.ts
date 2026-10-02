import { createHash } from "node:crypto";
import type { DesignInput } from "./validation.js";
import type { DesignPattern } from "../ai/designPatterns.js";
import type { SurfaceType } from "../ai/types.js";

export interface NormalizedArea {
  surface: SurfaceType;
  location: string;
  pattern: DesignPattern;
  patternNote: string | null;
  tileIds: string[];
}

export interface NormalizedDesign {
  areas: NormalizedArea[];
}

/** Accepts either a design or the legacy tileId + surfaces pair and returns the one canonical shape the server works with. */
export function normalizeDesign(body: { design?: DesignInput; tileId?: string; surfaces?: SurfaceType[] }): NormalizedDesign {
  if (body.design) {
    return {
      areas: body.design.areas.map((a) => ({
        surface: a.surface,
        location: a.location,
        pattern: a.pattern,
        patternNote: a.patternNote ?? null,
        tileIds: [...a.tileIds],
      })),
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
 */
export function designHash(design: NormalizedDesign): string {
  const canonical = [...design.areas]
    .map((a) => ({ s: a.surface, l: a.location.toLowerCase(), p: a.pattern, n: (a.patternNote ?? "").toLowerCase(), t: a.tileIds }))
    .sort((x, y) => `${x.s}|${x.l}`.localeCompare(`${y.s}|${y.l}`));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
