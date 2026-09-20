import { GoogleGenAI } from "@google/genai";
import { GeminiConfigError } from "./errors.js";

/**
 * The ONLY place in the codebase that reads GEMINI_API_KEY.
 *
 * This module must never be imported from browser/client code. There is
 * no VITE_ prefix on the env var by design — Vite will not expose it to
 * the client bundle even if this file were accidentally imported there,
 * but the correct fix in that case is to remove the import, not rely on
 * that fallback.
 */

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new GeminiConfigError("GEMINI_API_KEY");
  }

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/**
 * Classifies a raw error thrown by the Gemini SDK into one of our
 * transient/permanent buckets, without leaking the raw error (which may
 * contain request details) to callers outside this module.
 */
export function classifyGeminiError(err: unknown): "rate_limited" | "upstream" {
  const message = err instanceof Error ? err.message : String(err);
  if (/429|rate.?limit|quota/i.test(message)) return "rate_limited";
  return "upstream";
}
