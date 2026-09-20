import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "./env.js";

/**
 * The ONLY Supabase client in this codebase that uses the service-role
 * key. It bypasses Row Level Security entirely, which is why every
 * db/* function that uses it MUST perform its own explicit ownership
 * check — RLS is not protecting these queries.
 *
 * This module must never be imported from browser/client code. The
 * browser gets its own client elsewhere (frontend phase) using
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 */

let cachedClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  cachedClient = createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}
