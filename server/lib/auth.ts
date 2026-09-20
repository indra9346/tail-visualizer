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
