import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyWebhookSignature, type RazorpayWebhookEvent } from "../server/billing/razorpay.js";
import { applyPaidPayment, markPaymentFailed, applyRefund, recordWebhookEventOnce, forgetWebhookEvent } from "../server/db/billing.js";
import { apiLogger } from "../server/lib/logger.js";

/**
 * Razorpay webhook endpoint. Disables Vercel's automatic body parsing
 * (`bodyParser: false`) because the signature must be computed over the
 * EXACT raw bytes Razorpay sent — re-serializing a parsed JSON object
 * would not reproduce the same bytes and the HMAC would never match.
 *
 * This is the AUTHORITATIVE crediting path: register this URL in the
 * Razorpay dashboard as the webhook endpoint. billingVerify.ts also credits
 * (for immediate UI feedback after checkout), but payment_apply_paid is
 * idempotent, so whichever of the two arrives first wins and the other is
 * a harmless no-op — a payment is never credited twice.
 *
 * No authentication here (Razorpay cannot present a user's session token);
 * the HMAC signature IS the authentication, checked before anything else
 * runs, using a constant-time comparison.
 */
export const config = { api: { bodyParser: false } };

function readRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Allowed methods: POST" } });
    return;
  }

  const signatureHeader = req.headers["x-razorpay-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  const rawBody = await readRawBody(req);

  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    apiLogger.warn("razorpay webhook signature invalid or missing", { operation: "razorpayWebhook" });
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid signature." } });
    return;
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Malformed payload." } });
    return;
  }

  // Replay/duplicate-delivery defense: Razorpay can and does redeliver the same event.
  // A duplicate event id is recorded as "already seen" and answered 200 without reprocessing.
  const eventId = (req.headers["x-razorpay-event-id"] as string | undefined) ?? event.id;
  const isNew = eventId ? await recordWebhookEventOnce(eventId, event.event, event) : true;
  if (!isNew) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  try {
    switch (event.event) {
      case "payment.captured": {
        const p = event.payload.payment?.entity;
        if (p) await applyPaidPayment(p.order_id, p.id, p.amount, p.currency);
        break;
      }
      case "payment.failed": {
        const p = event.payload.payment?.entity;
        if (p) await markPaymentFailed(p.order_id, "Payment failed at the provider.");
        break;
      }
      case "refund.processed": {
        const refund = event.payload.refund?.entity;
        const payment = event.payload.payment?.entity;
        const paymentId = payment?.id ?? refund?.payment_id;
        const orderId = payment?.order_id;
        // Only a FULL refund takes the pack's credits back (payment_apply_refund reclaims the whole pack). A partial
        // refund is logged for the owner to adjust by hand (scripts/grant-credits.ts) instead of wiping every credit.
        const refundedTotal = payment?.amount_refunded ?? refund?.amount ?? 0;
        const fullRefund = payment !== undefined && refundedTotal >= payment.amount;
        if (!orderId || !refund) apiLogger.warn("refund.processed webhook missing order_id", { operation: "razorpayWebhook", paymentId: paymentId ?? "unknown" });
        else if (!fullRefund) apiLogger.warn("partial refund: credits not reclaimed automatically", { operation: "razorpayWebhook", paymentId: paymentId ?? "unknown", refundedPaise: refundedTotal, paidPaise: payment?.amount ?? 0 });
        else await applyRefund(orderId, refund.id);
        break;
      }
      default:
        // Unhandled event types are acknowledged (200) and ignored — never retried forever by Razorpay.
        break;
    }
  } catch (err) {
    apiLogger.error("razorpay webhook processing failed", { operation: "razorpayWebhook", eventType: event.event, errorCategory: err instanceof Error ? err.message : "unknown" });
    // Answer with an error so Razorpay delivers this event again (it retries for about a day), and forget the event
    // id so that redelivery is processed. Crediting is idempotent, so a retry can never credit twice; answering 200
    // here used to drop the payment for good after one passing database error.
    if (eventId) await forgetWebhookEvent(eventId);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Processing failed; please retry." } });
    return;
  }

  res.status(200).json({ received: true });
}
