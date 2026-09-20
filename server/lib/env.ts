/**
 * Central place that reads server-only environment variables.
 *
 * These names deliberately have NO `VITE_` prefix so Vite can never
 * expose them to a browser bundle even by accident. Nothing in this file
 * should ever be imported from `src/` (browser) code.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export const serverEnv = {
  get supabaseUrl(): string {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  // The Gemini secret is read exclusively by server/ai/geminiClient.ts, not
  // here, to keep a single point of access for that specific credential.
};
