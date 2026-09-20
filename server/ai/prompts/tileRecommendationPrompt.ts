import type { RoomAnalysis, TileCandidate } from "../types.js";

/**
 * CRITICAL: the candidate list passed in here MUST already be the exact,
 * final set of tiles the caller is willing to accept back. The prompt
 * text below is defense-in-depth (instructing the model not to invent
 * IDs); the actual enforcement happens in recommendTiles.ts by rejecting
 * any tileId not present in this same list.
 */
export function buildTileRecommendationPrompt(roomAnalysis: RoomAnalysis, candidateTiles: TileCandidate[]): string {
  const candidateJson = JSON.stringify(
    candidateTiles.map((t) => ({
      id: t.id,
      sku: t.sku,
      name: t.name,
      brand: t.brand,
      category: t.category,
      material: t.material,
      finish: t.finish,
      colorFamily: t.colorFamily,
      sizeMm: t.sizeMm,
      pricePerSqft: t.pricePerSqft,
      suitableRooms: t.suitableRooms,
    })),
    null,
    2,
  );

  const roomContext = JSON.stringify(
    {
      roomType: roomAnalysis.roomType,
      constructionState: roomAnalysis.constructionState,
      floorVisible: roomAnalysis.floorVisible,
      floorCurrentMaterial: roomAnalysis.floorCurrentMaterial,
      wallVisible: roomAnalysis.wallVisible,
      wallCurrentMaterial: roomAnalysis.wallCurrentMaterial,
      recommendedSurfaces: roomAnalysis.recommendedSurfaces,
      lighting: roomAnalysis.lighting,
    },
    null,
    2,
  );

  return `You are ranking real tile products for a room renovation, from a fixed catalog.

Room context (from a validated room analysis):
${roomContext}

Candidate tiles (this is the COMPLETE and ONLY set of tiles you may choose from — every one already exists in the database and is active):
${candidateJson}

Rules — read carefully:
1. You MUST only select tiles whose "id" appears EXACTLY in the candidate list above. Do not modify, guess, or invent any id.
2. You MUST NOT invent a tile name, brand, SKU, price, or any product that is not in the candidate list.
3. For each surface in the room's recommendedSurfaces, select up to 5 of the best-fitting candidates, ranked 1 (best) upward, considering: room type match (suitableRooms), material and finish appropriateness for the room type and construction state, color family suitability, size appropriateness, and — for bathrooms, kitchens, and balconies — a preference for wet-area-appropriate materials/finishes (e.g. non-slip, water-resistant) where the candidate data suggests it.
4. If no candidate is a reasonable fit for a surface, return fewer or zero recommendations for that surface rather than forcing a poor match.
5. For each recommendation, give a short (1-2 sentence) reason grounded in the candidate's actual attributes and the room context — do not fabricate attributes not present in the candidate data.
6. Return ONLY JSON matching the schema: { "recommendations": [ { "tileId": ..., "surface": ..., "rank": ..., "reason": ... } ] }. No text outside the JSON.`;
}

export function buildTileRecommendationRetryPrompt(previousIssues: string): string {
  return `Your previous response did not match the required JSON schema, or referenced a tileId not present in the candidate list. Validation errors:
${previousIssues}

Return ONLY a corrected JSON object. Every "tileId" MUST be copied exactly from the candidate list provided earlier in this conversation — do not alter, truncate, or invent any id. No text outside the JSON object.`;
}
