import { createClient } from "@supabase/supabase-js";

/**
 * Browser-safe Supabase client. Uses the anon/publishable key only —
 * this file must NEVER read or reference SUPABASE_SERVICE_ROLE_KEY or
 * GEMINI_API_KEY. Only VITE_-prefixed vars are readable here at all
 * (Vite strips everything else from the client bundle).
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy client/.env.example to client/.env.local and fill in your Supabase project's public values.",
  );
}

// createClient() throws synchronously on an empty/invalid URL, which would
// otherwise crash the entire app to a blank screen before React even
// renders. Falling back to a syntactically valid placeholder lets the app
// boot and show a proper in-page configuration notice instead — every
// auth/API call against it will simply fail at request time, the same as
// any other network error the UI already handles.
export const supabase = createClient(url || "https://placeholder.supabase.co", anonKey || "placeholder-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
