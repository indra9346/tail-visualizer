import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHandler } from "../../server/lib/httpHandler.js";
import { authenticateRequest } from "../../server/lib/auth.js";
import { checkRateLimit } from "../../server/lib/rateLimit.js";
import { parseOrThrow, createCheckoutBodySchema } from "../../server/lib/validation.js";
import { getCreditPackage, createPendingPayment } from "../../server/db/billing.js";
import { createRazorpayOrder, razorpayKeyId } from "../../server/billing/razorpay.js";
import { Errors } from "../../server/lib/apiError.js";
import { apiLogger } from "../../server/lib/logger.js";

/**
 * Starts a purchase: creates a real Razorpay order (server-side, with our
 * secret key) and a local "created" payment row, then returns only what
 * the browser's checkout.js widget needs (order id, amount, currency, the
 * PUBLISHABLE key id) — never the secret key, and never a credited balance.
 * Credits are added later, only after payment_apply_paid runs (see
 * billingVerify.ts and razorpayWebhook.ts), and only once (idempotent).
 */
export default createHandler({ methods: ["POST"], operation: "billingCheckout" }, async (req: VercelRequest, res: VercelResponse) => {
  const user = await authenticateRequest(req);
  checkRateLimit(`checkout:${user.id}`, 20, 60 * 60 * 1000);

  const body = parseOrThrow(createCheckoutBodySchema, req.body);
  const pkg = await getCreditPackage(body.packageId);
  if (!pkg) throw Errors.validation("That credit package is not available.");

  const totalCredits = pkg.credits + pkg.bonusCredits;

  let order;
  try {
    order = await createRazorpayOrder(pkg.pricePaise, pkg.currency, `pkg:${pkg.id}:${user.id.slice(0, 8)}:${Date.now()}`, {
      user_id: user.id,
      package_id: pkg.id,
    });
  } catch (err) {
    apiLogger.error("createRazorpayOrder failed", { operation: "billingCheckout", userId: user.id, errorCategory: err instanceof Error ? err.name : "unknown" });
    throw Errors.internal("Could not start checkout. Please try again.");
  }

  const payment = await createPendingPayment({
    userId: user.id,
    providerOrderId: order.id,
    packageId: pkg.id,
    packageName: pkg.name,
    amountPaise: pkg.pricePaise,
    currency: pkg.currency,
    credits: totalCredits,
  });

  res.status(201).json({
    checkout: {
      orderId: order.id,
      amountPaise: pkg.pricePaise,
      currency: pkg.currency,
      keyId: razorpayKeyId(),
      packageName: pkg.name,
      credits: totalCredits,
      paymentId: payment.id,
    },
  });
});
