import type { RoomAnalysis, SurfaceType, TileCandidate } from "../types.js";

export function buildVisualizationPrompt(
  roomAnalysis: RoomAnalysis,
  tile: TileCandidate,
  surfaces: SurfaceType[],
): string {
  const surfaceList = surfaces.join(" and ");

  return `You are editing a real photograph of a residential room to show it finished with a specific real tile product applied to the ${surfaceList}.

You are given two images, in this order:
1. The ORIGINAL ROOM PHOTOGRAPH — this defines the room's true geometry, camera viewpoint, and structure.
2. The TILE PRODUCT IMAGE — this is the authoritative visual reference for exactly what the tile looks like (its color, pattern, texture, and finish). Use this image, not the text description, as ground truth for the tile's appearance.

Room context (from a prior analysis of the original photo):
- Room type: ${roomAnalysis.roomType}
- Construction state: ${roomAnalysis.constructionState}
- Perspective: ${roomAnalysis.perspective ?? "unknown"}
- Lighting: ${roomAnalysis.lighting ?? "unknown"}
- Doors visible: ${roomAnalysis.doorCount}, Windows visible: ${roomAnalysis.windowCount}
- Existing fixtures: ${roomAnalysis.fixtures.join(", ") || "none noted"}

Tile being applied: "${tile.name}"${tile.brand ? ` by ${tile.brand}` : ""}, material: ${tile.material ?? "unspecified"}, finish: ${tile.finish ?? "unspecified"}, size: ${tile.sizeMm ?? "unspecified"}.

STRICTLY PRESERVE from the original photograph:
- The exact camera viewpoint, angle, and framing.
- Room geometry and architectural proportions.
- All walls, doors, windows, and their positions — do not move, resize, add, or remove any of them.
- The ceiling.
- All permanent fixtures and their positions (sinks, toilets, countertops, cabinets, plumbing/electrical fittings visible in the photo).
- The overall lighting direction and character of the original scene.
- Any surface NOT listed in "surfaces to change" below — leave it exactly as in the original.

SURFACES TO CHANGE: ${surfaceList}.
- Replace only the ${surfaceList} material with the tile shown in the tile product image.
- Render the tile at a physically realistic scale for a room of this type, with realistic, evenly spaced grout lines appropriate to the tile size.
- Match perspective distortion of the tile pattern to the room's existing camera angle.
- Match shadows, ambient occlusion, and highlights on the new tile surface to the scene's existing lighting direction so it looks physically integrated, not pasted on.
- Produce a photorealistic result — this must look like a real photograph of the finished room, not an illustration or render.

DO NOT:
- Do not redesign, restyle, or "improve" the room beyond applying the requested tile to the requested surface(s).
- Do not add furniture, decor, or fixtures that are not required to show the finished surface, unless something was already present in the original.
- Do not change the room type, layout, or add additional rooms.
- Do not alter doors, windows, or their positions.
- Do not substitute a different tile design than the one shown in the tile product image.

Output: a single photorealistic image of the same room from the same viewpoint, with the ${surfaceList} finished in the shown tile.`;
}
