import type { VercelRequest } from "@vercel/node";
import { getSupabaseServerClient } from "./supabaseServerClient.js";
import { Errors } from "./apiError.js";
import { apiLogger } from "./logger.js";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

function extractBearerToken(req: VercelRequest): string | null {
  const header = req.headers["authorization"] ?? req.headers["Authorization" as never];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== "string") return null;

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

/**
 * Verifies the caller's Supabase JWT and returns the authenticated user.
 *
 * `req.body.user_id` (or any client-supplied identity claim) is never
 * consulted here or anywhere downstream — the only trusted identity is
 * whatever this function returns, derived solely from a token Supabase
 * itself validates.
 */
export async function authenticateRequest(req: VercelRequest): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req);
  if (!token) {
    throw Errors.unauthenticated("Missing bearer token.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    apiLogger.warn("authentication failed", {
      operation: "authenticateRequest",
      errorCategory: error?.name ?? "no_user",
    });
    throw Errors.unauthenticated("Invalid or expired session.");
  }

  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Like authenticateRequest, but for endpoints that serve BOTH signed-in
 * owners and anonymous visitors (e.g. a public visualization result):
 * returns null instead of throwing when there's no token, or the token is
 * invalid/expired. A present-but-invalid token still resolves to null
 * rather than a hard error — the caller is treated as anonymous, and the
 * handler itself decides what an anonymous caller may see.
 */
export async function authenticateRequestOptional(req: VercelRequest): Promise<AuthenticatedUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}
