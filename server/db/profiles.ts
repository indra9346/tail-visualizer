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
