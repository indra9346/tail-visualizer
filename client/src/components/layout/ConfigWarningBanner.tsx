import { isSupabaseConfigured } from "@/lib/supabaseClient";

export function ConfigWarningBanner() {
  if (isSupabaseConfigured) return null;

  return (
    <div role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
      Supabase is not configured. Copy <code className="rounded bg-amber-200 px-1">client/.env.example</code> to{" "}
      <code className="rounded bg-amber-200 px-1">client/.env.local</code> and set your project's URL and anon key.
    </div>
  );
}
