import { supabase } from "./supabaseClient";

/**
 * The `tile-images` bucket is public-read by design (Phase 0 storage
 * design), so the client may construct its public URL directly — this is
 * NOT a signed URL and never expires, which is only safe because this
 * one bucket holds catalog images, never room photos or generated
 * visualizations (both of those are private and only ever reach the
 * client as short-lived signed URLs from the API).
 */
export function getPublicTileImageUrl(storagePath: string): string {
  return supabase.storage.from("tile-images").getPublicUrl(storagePath).data.publicUrl;
}
