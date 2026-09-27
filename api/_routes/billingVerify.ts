import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { parseOrThrow, verifyCheckoutBodySchema } from "../../server/lib/validation.js";
import { getOwnedPayment, applyPaidPayment, getBillingSummary } from "../../server/db/billing.js";
import { verifyCheckoutSignature } from "../../server/billing/razorpay.js";
import { Errors } from "../../server/lib/apiError.js";
import { apiLogger } from "../../server/lib/logger.js";

/**
 * Called by the browser right after Razorpay's checkout.js reports success,
 * so the UI can show the new balance immediately instead of waiting for the
 * webhook. This is a UX shortcut, NEVER the authority: the browser's claim
 * of success is meaningless on its own — everything here is re-verified
 * server-side (HMAC signature, then payment_apply_paid's own amount check),
 * and the webhook (razorpayWebhook.ts) independently does the same crediting,
 * idempotently, so whichever request lands first wins and the other is a
 * harmless no-op.
 */
export default createHandler({ methods: ["POST"], operation: "billingVerify" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  const body = parseOrThrow(verifyCheckoutBodySchema, req.body);

  if (!verifyCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    apiLogger.warn("razorpay checkout signature verification failed", { operation: "billingVerify", userId: user.id });
    throw Errors.paymentVerificationFailed();
  }

  // Ownership: a caller can only verify/credit an order that IS their own pending payment.
  const payment = await getOwnedPayment(user.id, body.razorpay_order_id);
  if (!payment) throw Errors.paymentNotFound();

  try {
    await applyPaidPayment(payment.providerOrderId, body.razorpay_payment_id, payment.amountPaise, payment.currency);
  } catch (err) {
    apiLogger.error("applyPaidPayment failed", { operation: "billingVerify", userId: user.id, errorCategory: err instanceof Error ? err.message : "unknown" });
    throw Errors.internal("Payment verified but crediting failed. Please contact support with your payment id.");
  }

  res.status(200).json({ summary: await getBillingSummary(user.id) });
});
