import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The ONLY file that reads RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 * RAZORPAY_WEBHOOK_SECRET (see test/secrets.test.ts, which enforces this
 * the same way it does for GEMINI_API_KEY and SUPABASE_SERVICE_ROLE_KEY).
 * Nothing here is ever sent to the browser — the client only ever
 * receives an order id, amount and currency (see billing.ts), which
 * Razorpay's own checkout.js widget needs to open the hosted payment UI.
 *
 * Uses Razorpay's plain REST API over fetch (Basic Auth with
 * key_id:key_secret) rather than the official Node SDK, to avoid adding a
 * dependency for two HTTP calls and one HMAC check.
 */

export class RazorpayConfigError extends Error {
  constructor(missingVar: string) {
    super(`Razorpay is not configured: missing ${missingVar}.`);
    this.name = "RazorpayConfigError";
  }
}

function required(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET"): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) throw new RazorpayConfigError(name);
  return value;
}

/** The publishable key id — safe to send to the client (it names Razorpay's own checkout widget, not a secret). */
export function razorpayKeyId(): string {
  return required("RAZORPAY_KEY_ID");
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${required("RAZORPAY_KEY_ID")}:${required("RAZORPAY_KEY_SECRET")}`).toString("base64");
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/** Creates a Razorpay order server-side. `receipt` should be a short internal reference (e.g. the local payment row id). */
export async function createRazorpayOrder(amountPaise: number, currency: string, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency, receipt, notes, payment_capture: 1 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as RazorpayOrder;
  return data;
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time hex-string compare (mismatched lengths are never a timing signal — always false). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Verifies the signature checkout.js hands back to the browser after a
 * successful payment: HMAC-SHA256(order_id + "|" + payment_id, key_secret).
 * This is a UX convenience for an immediate credit — the webhook (below)
 * is the authoritative source and both paths are idempotent, so whichever
 * arrives first credits the user and the other is a harmless no-op.
 */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  try {
    return safeEqualHex(hmacHex(required("RAZORPAY_KEY_SECRET"), `${orderId}|${paymentId}`), signature);
  } catch {
    return false;
  }
}

/** Verifies X-Razorpay-Signature against the exact raw request body bytes (must be computed before any JSON parsing). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  try {
    return safeEqualHex(hmacHex(required("RAZORPAY_WEBHOOK_SECRET"), rawBody.toString("utf8")), signature);
  } catch {
    return false;
  }
}

export interface RazorpayWebhookEvent {
  id: string;
  event: string;
  payload: {
    payment?: { entity?: { id: string; order_id: string; amount: number; currency: string; status: string } };
    refund?: { entity?: { id: string; payment_id: string } };
  };
}
