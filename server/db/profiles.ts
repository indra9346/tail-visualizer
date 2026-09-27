import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { apiLogger } from "../lib/logger.js";

/**
 * Auto-provisions a `profiles` row for a newly-seen authenticated user.
 * Safe to call on every request — uses upsert-on-conflict so it is a
 * no-op for existing users after the first call.
 */
export async function ensureProfile(userId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    // Non-fatal: profile provisioning failing should not block the actual request.
    apiLogger.error("ensureProfile upsert failed", { operation: "ensureProfile", userId, errorCategory: error.code });
  }
}

/** Authoritative admin check — always re-derived from the database, never from a client-supplied flag. */
export async function isAdminUser(userId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (error) {
    apiLogger.error("isAdminUser check failed", { operation: "isAdminUser", userId, errorCategory: error.code });
    return false; // fail closed
  }
  return data?.is_admin === true;
}
