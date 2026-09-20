import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { apiLogger } from "../lib/logger.js";
import { Errors } from "../lib/apiError.js";
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from "./buckets.js";
import { assertOwnedPath } from "./ownedPath.js";

export async function uploadImage(bucket: string, path: string, buffer: Buffer, mimeType: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    apiLogger.error("storage upload failed", { operation: "uploadImage", errorCategory: error.name, bucket });
    throw Errors.internal("Failed to store image.");
  }
}

/** Best-effort cleanup — logs but never throws, since it usually runs inside an existing catch/rollback path. */
export async function deleteImageQuietly(bucket: string, path: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    apiLogger.error("storage cleanup failed — possible orphaned object", {
      operation: "deleteImageQuietly",
      errorCategory: error.name,
      bucket,
    });
  }
}

export async function downloadImage(bucket: string, path: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    apiLogger.error("storage download failed", { operation: "downloadImage", errorCategory: error?.name, bucket });
    throw Errors.internal("Failed to load image.");
  }
  const arrayBuffer = await data.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: data.type || "application/octet-stream" };
}

/**
 * Signs a short-lived URL for a user-owned object. `userId` is required so an
 * unchecked call cannot compile: the path must live under `${userId}/`
 * (see assertOwnedPath) before the service role is allowed to sign it.
 */
export async function createSignedUrl(
  bucket: string,
  path: string,
  userId: string,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  assertOwnedPath(path, userId);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    apiLogger.error("signed url creation failed", { operation: "createSignedUrl", errorCategory: error?.name, bucket });
    throw Errors.internal("Failed to generate a temporary image link.");
  }
  return data.signedUrl;
}

/** Room photos are user data: the path must live under `${userId}/` before the service role reads it. */
export async function downloadRoomImage(path: string, userId: string) {
  assertOwnedPath(path, userId);
  return downloadImage(BUCKETS.roomImages, path);
}

export async function downloadTileImage(path: string) {
  return downloadImage(BUCKETS.tileImages, path);
}
