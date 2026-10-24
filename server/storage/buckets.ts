export const BUCKETS = {
  roomImages: "room-images",
  tileImages: "tile-images",
  generatedVisualizations: "generated-visualizations",
} as const;

export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes — short-lived by design

export function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`Unsupported mime type for storage extension: ${mimeType}`);
  }
}

export function roomImagePath(userId: string, projectId: string, roomUploadId: string, mimeType: string): string {
  return `${userId}/${projectId}/${roomUploadId}.${extensionForMimeType(mimeType)}`;
}

/**
 * Each attempt gets its own file (`<id>-a2.png`): uploads never overwrite (upsert false), so a shared name made every
 * later attempt fail once any earlier attempt had stored an image. The first attempt keeps the original name.
 */
export function generatedVisualizationPath(
  userId: string,
  projectId: string,
  visualizationId: string,
  mimeType: string,
  attemptNumber = 1,
): string {
  const suffix = attemptNumber > 1 ? `-a${attemptNumber}` : "";
  return `${userId}/${projectId}/${visualizationId}${suffix}.${extensionForMimeType(mimeType)}`;
}

export function tileImagePath(ownerId: string, tileId: string, mimeType: string): string {
  return `${ownerId}/${tileId}.${extensionForMimeType(mimeType)}`;
}
