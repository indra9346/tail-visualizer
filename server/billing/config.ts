/**
 * Centralized credit-cost configuration. No other file should hard-code a
 * credit amount for a generation — import GENERATION_CREDIT_COST from here.
 * The server is always the authority: the client only ever DISPLAYS this
 * number, it never sends a cost/amount that the server trusts.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const billingConfig = {
  /** Credits charged for one visualization generation attempt (a Gemini image call). */
  generationCreditCost: envInt("GENERATION_CREDIT_COST", 10),
  /** A held reservation older than this is considered abandoned by a crashed/timed-out request. */
  staleHoldMinutes: envInt("STALE_HOLD_MINUTES", 15),
  currency: "INR",
} as const;
