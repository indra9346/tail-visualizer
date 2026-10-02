import { deleteImageQuietly } from "./imageStorage.js";
import { isOwnedPath } from "./ownedPath.js";

/**
 * Best-effort removal of stored images after their database rows are gone.
 * Only paths that belong to `userId` (first path segment) are ever touched, so
 * even a corrupted row can never make this delete someone else's files.
 * Never throws: the rows are already deleted, a leftover file is only logged.
 */
export async function removeOwnedImagesQuietly(bucket: string, paths: Array<string | null | undefined>, userId: string): Promise<void> {
  const owned = [...new Set(paths.filter((p): p is string => typeof p === "string" && isOwnedPath(p, userId)))];
  await Promise.all(owned.map((path) => deleteImageQuietly(bucket, path)));
}
