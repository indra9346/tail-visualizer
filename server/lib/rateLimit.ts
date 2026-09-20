import { Errors } from "./apiError.js";

/**
 * MVP-ONLY in-memory sliding-window rate limiter, keyed per userId+operation.
 *
 * LIMITATION (documented, not silently glossed over): Vercel serverless
 * functions are not guaranteed to share memory across invocations or
 * regions — this Map resets on cold start and does not coordinate across
 * concurrent instances. It is a best-effort guard against accidental
 * abuse (double-clicks, tight retry loops), NOT a security boundary
 * against a determined attacker or a distributed abuse pattern.
 *
 * Before real production traffic, replace this with a shared store
 * (Vercel KV / Upstash Redis) using the same key shape.
 */

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const windowStart = now - windowMs;

  const existing = hits.get(key) ?? [];
  const withinWindow = existing.filter((ts) => ts > windowStart);

  if (withinWindow.length >= limit) {
    throw Errors.rateLimited();
  }

  withinWindow.push(now);
  hits.set(key, withinWindow);
}

export const RateLimits = {
  roomAnalyze: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5 per 10 min per user
  tileRecommend: { limit: 15, windowMs: 10 * 60 * 1000 },
  visualizationGenerate: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 per hour per user
  roomUpload: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;
