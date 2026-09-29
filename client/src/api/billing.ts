import { apiGet, apiPost } from "./client";

export interface BillingSummary {
  balance: number;
  used: { today: number; week: number; month: number; total: number; reserved: number };
  generations: { total: number; completed: number; failed: number; inProgress: number };
  payments: { paid: number; pending: number; failed: number; refunded: number; paidPaise: number; refundedPaise: number };
}

export interface CreditTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  status: string;
  referenceType: string | null;
  referenceId: string | null;
  description: string;
  createdAt: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  bonusCredits: number;
  pricePaise: number;
  currency: string;
}

export interface Payment {
  id: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  packageId: string;
  packageName: string;
  amountPaise: number;
  currency: string;
  credits: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

export interface CheckoutInfo {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  packageName: string;
  credits: number;
  paymentId: string;
}

export async function getBillingSummary(): Promise<BillingSummary> {
  return (await apiGet<{ summary: BillingSummary }>("/api/billing/summary")).summary;
}

export async function getCreditTransactions(): Promise<CreditTransaction[]> {
  return (await apiGet<{ transactions: CreditTransaction[] }>("/api/billing/transactions")).transactions;
}

export async function getPayments(): Promise<Payment[]> {
  return (await apiGet<{ payments: Payment[] }>("/api/billing/payments")).payments;
}

export async function getCreditPackages(): Promise<{ packages: CreditPackage[]; generationCreditCost: number }> {
  return apiGet<{ packages: CreditPackage[]; generationCreditCost: number }>("/api/billing/packages");
}

export async function createCheckout(packageId: string): Promise<CheckoutInfo> {
  return (await apiPost<{ checkout: CheckoutInfo }>("/api/billing/checkout", { packageId })).checkout;
}

export async function verifyCheckout(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<BillingSummary> {
  return (await apiPost<{ summary: BillingSummary }>("/api/billing/verify", payload)).summary;
}

// ---- Razorpay checkout.js loader (loaded on demand, only on the Credits page) ----

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (arg: unknown) => void) => void };
  }
}

let checkoutScriptPromise: Promise<void> | null = null;

/** Loads Razorpay's hosted checkout.js widget script once. The Gemini/Razorpay SECRET keys never appear in this file or anywhere in the browser. */
export function loadRazorpayCheckoutScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment widget. Check your connection and try again."));
    document.body.appendChild(script);
  });
  return checkoutScriptPromise;
}

/**
 * Opens Razorpay's hosted checkout for one order and resolves once the
 * browser reports success — the server independently re-verifies the
 * signature (billingVerify.ts) and the webhook is the authoritative
 * crediting path (razorpayWebhook.ts); this promise is only a UX signal
 * for when to refresh the balance, never trusted as "payment complete".
 */
export function openRazorpayCheckout(checkout: CheckoutInfo, userEmail: string | undefined): Promise<{ razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error("Payment widget did not load."));
      return;
    }
    const rzp = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amountPaise,
      currency: checkout.currency,
      name: "SDS TILES & CERAMICS",
      description: `${checkout.packageName} — ${checkout.credits} credits`,
      prefill: userEmail ? { email: userEmail } : undefined,
      theme: { color: "#1c1917" },
      handler: (response: unknown) => resolve(response as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }),
      modal: { ondismiss: () => reject(new Error("Payment cancelled.")) },
    });
    rzp.on("payment.failed", () => reject(new Error("Payment failed. No charge was made.")));
    rzp.open();
  });
}
