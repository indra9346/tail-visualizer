import { createHmac } from "node:crypto";
import { makeReq, makeRes } from "./helpers/fakeHttp";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER_USER = "22222222-2222-2222-2222-222222222222";
const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

let currentUserId = USER;
jest.mock("../server/lib/auth", () => ({ authenticateRequest: async () => ({ id: currentUserId, email: null }) }));
jest.mock("../server/lib/rateLimit", () => ({ checkRateLimit: jest.fn(), RateLimits: {} }));

const packages: Record<string, any> = {
  starter: { id: "starter", name: "Starter", credits: 100, bonusCredits: 0, pricePaise: 49900, currency: "INR" },
};
const payments = new Map<string, any>();
let nextPaymentId = 1;
const applyPaidCalls: any[] = [];
const markFailedCalls: any[] = [];
const applyRefundCalls: any[] = [];
const webhookEventsSeen = new Set<string>();

jest.mock("../server/db/billing", () => ({
  getCreditPackage: async (id: string) => packages[id] ?? null,
  createPendingPayment: async (input: any) => {
    const row = { id: `pay-${nextPaymentId++}`, ...input, status: "created" };
    payments.set(input.providerOrderId, { ...row, userId: input.userId, amountPaise: input.amountPaise, currency: input.currency });
    return row;
  },
  getOwnedPayment: async (userId: string, orderId: string) => {
    const p = payments.get(orderId);
    return p && p.userId === userId ? p : null;
  },
  applyPaidPayment: async (orderId: string, paymentId: string, amountPaise: number, currency: string) => {
    applyPaidCalls.push({ orderId, paymentId, amountPaise, currency });
    return { credited: true, duplicate: false, credits: 100 };
  },
  markPaymentFailed: async (orderId: string, reason: string) => {
    markFailedCalls.push({ orderId, reason });
  },
  applyRefund: async (orderId: string, refundId: string) => {
    applyRefundCalls.push({ orderId, refundId });
  },
  recordWebhookEventOnce: async (eventId: string) => {
    if (webhookEventsSeen.has(eventId)) return false;
    webhookEventsSeen.add(eventId);
    return true;
  },
  getBillingSummary: async () => ({ balance: 90, used: {}, generations: {}, payments: {} }),
}));

let orderCreateShouldFail = false;
jest.mock("../server/billing/razorpay.ts", () => {
  const { createHmac: hmac, timingSafeEqual } = require("node:crypto");
  return {
    razorpayKeyId: () => "rzp_test_public_key",
    createRazorpayOrder: async (amountPaise: number, currency: string) => {
      if (orderCreateShouldFail) throw new Error("razorpay down");
      return { id: `order_${amountPaise}_${Date.now()}`, amount: amountPaise, currency, status: "created" };
    },
    verifyCheckoutSignature: (orderId: string, paymentId: string, signature: string) => {
      const expected = hmac("sha256", "test_key_secret").update(`${orderId}|${paymentId}`).digest("hex");
      return expected.length === signature.length && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
    },
    verifyWebhookSignature: (rawBody: Buffer, signature: string) => {
      const expected = hmac("sha256", "test_webhook_secret").update(rawBody.toString("utf8")).digest("hex");
      return expected.length === signature.length && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
    },
  };
});

import checkoutHandler from "../api/_routes/billingCheckout";
import verifyHandler from "../api/_routes/billingVerify";
import webhookHandler from "../api/razorpayWebhook";

function sign(orderId: string, paymentId: string): string {
  return createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}
function signWebhook(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function fakeStreamReq(body: string, headers: Record<string, string> = {}) {
  const listeners: Record<string, ((arg?: any) => void)[]> = {};
  return {
    method: "POST",
    headers,
    query: {},
    on(event: string, cb: (arg?: any) => void) {
      (listeners[event] ??= []).push(cb);
      if (event === "data") setImmediate(() => cb(Buffer.from(body)));
      if (event === "end") setImmediate(() => cb());
      return this;
    },
  } as any;
}

beforeEach(() => {
  currentUserId = USER;
  payments.clear();
  applyPaidCalls.length = 0;
  markFailedCalls.length = 0;
  applyRefundCalls.length = 0;
  webhookEventsSeen.clear();
  orderCreateShouldFail = false;
});

describe("POST /api/billing/checkout", () => {
  test("creates a Razorpay order and a local payment row; never returns the secret key", async () => {
    const res = makeRes();
    await checkoutHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { packageId: "starter" } }), res);
    expect(res.statusCode).toBe(201);
    const c = (res._json as any).checkout;
    expect(c.keyId).toBe("rzp_test_public_key");
    expect(c.amountPaise).toBe(49900);
    expect(c.credits).toBe(100);
    expect(JSON.stringify(res._json)).not.toMatch(/test_key_secret|test_webhook_secret/);
  });

  test("rejects an unknown package id", async () => {
    const res = makeRes();
    await checkoutHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { packageId: "nonexistent" } }), res);
    expect(res.statusCode).toBe(400);
  });

  test("surfaces order-creation failure as a safe 500, not a raw provider error", async () => {
    orderCreateShouldFail = true;
    const res = makeRes();
    await checkoutHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { packageId: "starter" } }), res);
    expect(res.statusCode).toBe(500);
    expect((res._json as any).error.message).not.toMatch(/razorpay down/);
  });
});

describe("POST /api/billing/verify", () => {
  async function makeOrder(userId = USER) {
    currentUserId = userId;
    const res = makeRes();
    await checkoutHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { packageId: "starter" } }), res);
    return (res._json as any).checkout.orderId as string;
  }

  test("valid signature + owned order -> credits applied exactly once", async () => {
    const orderId = await makeOrder();
    currentUserId = USER;
    const paymentId = "pay_abc123";
    const res = makeRes();
    await verifyHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) } }), res);
    expect(res.statusCode).toBe(200);
    expect(applyPaidCalls).toEqual([{ orderId, paymentId, amountPaise: 49900, currency: "INR" }]);
  });

  test("tampered/invalid signature is rejected; no credit applied", async () => {
    const orderId = await makeOrder();
    const res = makeRes();
    await verifyHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { razorpay_order_id: orderId, razorpay_payment_id: "pay_x", razorpay_signature: "0".repeat(64) } }), res);
    expect(res.statusCode).toBe(400);
    expect((res._json as any).error.code).toBe("PAYMENT_VERIFICATION_FAILED");
    expect(applyPaidCalls).toHaveLength(0);
  });

  test("a user cannot verify/credit ANOTHER user's order, even with a correctly-signed payload", async () => {
    const orderId = await makeOrder(OTHER_USER); // victim's order
    currentUserId = USER; // attacker
    const paymentId = "pay_attacker";
    const res = makeRes();
    await verifyHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(orderId, paymentId) } }), res);
    expect(res.statusCode).toBe(404);
    expect((res._json as any).error.code).toBe("PAYMENT_NOT_FOUND");
    expect(applyPaidCalls).toHaveLength(0);
  });

  test("rejects malformed body (missing fields)", async () => {
    const res = makeRes();
    await verifyHandler(makeReq({ method: "POST", headers: { authorization: "Bearer x" }, body: { razorpay_order_id: "x" } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/razorpayWebhook", () => {
  test("valid payment.captured webhook credits the payment exactly once", async () => {
    const body = JSON.stringify({ id: "evt_1", event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 49900, currency: "INR", status: "captured" } } } });
    const res = makeRes();
    await webhookHandler(fakeStreamReq(body, { "x-razorpay-signature": signWebhook(body), "x-razorpay-event-id": "evt_1" }), res);
    expect(res.statusCode).toBe(200);
    expect(applyPaidCalls).toEqual([{ orderId: "order_1", paymentId: "pay_1", amountPaise: 49900, currency: "INR" }]);
  });

  test("a redelivered (duplicate) event id is acknowledged but NOT reprocessed — no double credit", async () => {
    const body = JSON.stringify({ id: "evt_2", event: "payment.captured", payload: { payment: { entity: { id: "pay_2", order_id: "order_2", amount: 49900, currency: "INR", status: "captured" } } } });
    const headers = { "x-razorpay-signature": signWebhook(body), "x-razorpay-event-id": "evt_2" };
    const res1 = makeRes();
    await webhookHandler(fakeStreamReq(body, headers), res1);
    const res2 = makeRes();
    await webhookHandler(fakeStreamReq(body, headers), res2);
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect((res2._json as any).duplicate).toBe(true);
    expect(applyPaidCalls).toHaveLength(1); // credited exactly once, not twice
  });

  test("invalid signature is rejected with 400 and never touches the ledger", async () => {
    const body = JSON.stringify({ id: "evt_3", event: "payment.captured", payload: { payment: { entity: { id: "pay_3", order_id: "order_3", amount: 100, currency: "INR", status: "captured" } } } });
    const res = makeRes();
    await webhookHandler(fakeStreamReq(body, { "x-razorpay-signature": "deadbeef".repeat(8) }), res);
    expect(res.statusCode).toBe(400);
    expect(applyPaidCalls).toHaveLength(0);
  });

  test("missing signature header is rejected", async () => {
    const body = JSON.stringify({ id: "evt_4", event: "payment.captured", payload: {} });
    const res = makeRes();
    await webhookHandler(fakeStreamReq(body, {}), res);
    expect(res.statusCode).toBe(400);
  });

  test("payment.failed marks the local payment failed without touching credits", async () => {
    const body = JSON.stringify({ id: "evt_5", event: "payment.failed", payload: { payment: { entity: { id: "pay_5", order_id: "order_5", amount: 100, currency: "INR", status: "failed" } } } });
    const res = makeRes();
    await webhookHandler(fakeStreamReq(body, { "x-razorpay-signature": signWebhook(body), "x-razorpay-event-id": "evt_5" }), res);
    expect(res.statusCode).toBe(200);
    expect(markFailedCalls).toEqual([{ orderId: "order_5", reason: "Payment failed at the provider." }]);
    expect(applyPaidCalls).toHaveLength(0);
  });

  test("an unrecognized event type is acknowledged (200) and safely ignored", async () => {
    const body = JSON.stringify({ id: "evt_6", event: "order.paid", payload: {} });
    const res = makeRes();
    await webhookHandler(fakeStreamReq(body, { "x-razorpay-signature": signWebhook(body), "x-razorpay-event-id": "evt_6" }), res);
    expect(res.statusCode).toBe(200);
    expect(applyPaidCalls).toHaveLength(0);
  });

  test("rejects non-POST methods", async () => {
    const res = makeRes();
    await webhookHandler(fakeStreamReq("{}", {}) as any, res);
    // method defaults to POST in fakeStreamReq; explicitly test GET rejection
    const getReq = { ...fakeStreamReq("{}", {}), method: "GET" };
    const res2 = makeRes();
    await webhookHandler(getReq, res2);
    expect(res2.statusCode).toBe(405);
  });
});

describe("GET /api/admin/overview", () => {
  test("a non-admin user is refused with 403, never sees platform-wide data", async () => {
    jest.resetModules();
    jest.doMock("../server/lib/auth", () => ({ authenticateRequest: async () => ({ id: USER, email: null }) }));
    jest.doMock("../server/lib/httpHandler", () => jest.requireActual("../server/lib/httpHandler"));
    jest.doMock("../server/db/profiles", () => ({ isAdminUser: async () => false }));
    jest.doMock("../server/db/billing", () => ({ getAdminOverview: async () => ({ users: { total: 999 } }) }));
    const { default: handler } = await import("../api/_routes/adminOverview");
    const res = makeRes();
    await handler(makeReq({ method: "GET", headers: { authorization: "Bearer x" } }), res);
    expect(res.statusCode).toBe(403);
    expect(res._json).not.toHaveProperty("overview");
  });

  test("an admin user receives the overview", async () => {
    jest.resetModules();
    jest.doMock("../server/lib/auth", () => ({ authenticateRequest: async () => ({ id: USER, email: null }) }));
    jest.doMock("../server/db/profiles", () => ({ isAdminUser: async () => true }));
    jest.doMock("../server/db/billing", () => ({ getAdminOverview: async () => ({ users: { total: 3 } }) }));
    const { default: handler } = await import("../api/_routes/adminOverview");
    const res = makeRes();
    await handler(makeReq({ method: "GET", headers: { authorization: "Bearer x" } }), res);
    expect(res.statusCode).toBe(200);
    expect((res._json as any).overview.users.total).toBe(3);
  });
});
