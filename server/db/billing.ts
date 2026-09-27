import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "../lib/supabaseServerClient.js";
import { apiLogger } from "../lib/logger.js";
import { Errors } from "../lib/apiError.js";
import { billingConfig } from "../billing/config.js";

/**
 * All money/credit movement in this app goes through the SQL functions
 * defined in supabase/migrations/0010_billing.sql (credit_apply / hold /
 * commit / release / payment_apply_paid / ...), called here via `rpc`.
 * Those functions are SECURITY DEFINER, hold a row lock on the user's
 * credit_accounts row for the duration of the call, and are the ONLY
 * place a balance is ever read-modified-written — there is no
 * "read balance, compute, write balance" anywhere in application code.
 * Grants restrict EXECUTE to service_role only (see 0010), so a client
 * could never call these even by guessing the function name.
 */

interface RpcError extends Error {
  code?: string;
  message: string;
}

function isPgError(err: unknown, code: string): boolean {
  // supabase-js surfaces a Postgres RAISE EXCEPTION message as `.message`, not a coded field.
  return err instanceof Error && err.message.includes(code);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const err = new Error(error.message) as RpcError;
    err.code = error.code;
    throw err;
  }
  return data as T;
}

export interface HoldResult {
  transactionId: string;
  balance: number;
  duplicate: boolean;
}

/**
 * Reserves `amount` credits for a generation attempt, keyed by `idempotencyKey`
 * (the generation_job id — see vizGenerate.ts). Calling this twice with the
 * same key returns the SAME hold rather than reserving twice, so a client
 * retry after a network blip can never double-charge.
 *
 * Throws Errors.insufficientCredits() if the balance is too low — nothing
 * is reserved in that case.
 */
export async function holdCreditsForGeneration(userId: string, jobId: string, amount: number = billingConfig.generationCreditCost): Promise<HoldResult> {
  try {
    const r = await rpc<{ transaction_id: string; balance: number; duplicate: boolean }>("credit_hold", {
      p_user: userId,
      p_amount: amount,
      p_ref_id: jobId,
      p_idem: `hold:${jobId}`,
      p_meta: { generation_job_id: jobId },
    });
    return { transactionId: r.transaction_id, balance: r.balance, duplicate: r.duplicate };
  } catch (err) {
    if (isPgError(err, "INSUFFICIENT_CREDITS")) throw Errors.insufficientCredits();
    apiLogger.error("credit_hold failed", { operation: "holdCreditsForGeneration", userId, errorCategory: err instanceof Error ? err.message : "unknown" });
    throw Errors.internal("Failed to reserve credits.");
  }
}

/** Finalizes a hold as a real charge after a successful generation. Safe to call more than once (no-op after the first). */
export async function commitCreditHold(holdTransactionId: string): Promise<void> {
  try {
    await rpc("credit_commit", { p_hold_id: holdTransactionId });
  } catch (err) {
    // The image is already generated and stored; a ledger inconsistency here must never be silently
    // swallowed by returning a broken success. Fail loudly so an operator sees it in the logs.
    apiLogger.error("credit_commit failed after a successful generation", {
      operation: "commitCreditHold",
      holdTransactionId,
      errorCategory: err instanceof Error ? err.message : "unknown",
    });
    throw Errors.internal("Failed to finalize your credit charge. Please contact support.");
  }
}

/** Returns held credits to the user's balance after a failed/aborted generation. Safe to call more than once. */
export async function releaseCreditHold(holdTransactionId: string, reason: string): Promise<void> {
  try {
    await rpc("credit_release", { p_hold_id: holdTransactionId, p_reason: reason });
  } catch (err) {
    apiLogger.error("credit_release failed — credits may remain incorrectly held", {
      operation: "releaseCreditHold",
      holdTransactionId,
      errorCategory: err instanceof Error ? err.message : "unknown",
    });
    // Not re-thrown: this runs inside a catch block reporting the ORIGINAL generation
    // failure to the user, and credit_release_stale_holds() is the safety net if this
    // particular release attempt also failed (e.g. a transient DB blip).
  }
}

/** Best-effort background safety net: re-credits holds abandoned by a crashed/timed-out request. Call opportunistically, never awaited by the user-facing response. */
export async function releaseStaleHoldsQuietly(userId: string): Promise<void> {
  try {
    await rpc("credit_release_stale_holds", { p_user: userId, p_older_than: `${billingConfig.staleHoldMinutes} minutes` });
  } catch (err) {
    apiLogger.warn("credit_release_stale_holds failed", { operation: "releaseStaleHoldsQuietly", userId, errorCategory: err instanceof Error ? err.message : "unknown" });
  }
}

export interface BillingSummary {
  balance: number;
  used: { today: number; week: number; month: number; total: number; reserved: number };
  generations: { total: number; completed: number; failed: number; inProgress: number };
  payments: { paid: number; pending: number; failed: number; refunded: number; paidPaise: number; refundedPaise: number };
}

export async function getBillingSummary(userId: string): Promise<BillingSummary> {
  const raw = await rpc<any>("billing_summary", { p_user: userId });
  return {
    balance: raw.balance,
    used: raw.used,
    generations: { total: raw.generations.total, completed: raw.generations.completed, failed: raw.generations.failed, inProgress: raw.generations.in_progress },
    payments: {
      paid: raw.payments.paid,
      pending: raw.payments.pending,
      failed: raw.payments.failed,
      refunded: raw.payments.refunded,
      paidPaise: raw.payments.paid_paise,
      refundedPaise: raw.payments.refunded_paise,
    },
  };
}

export async function getAdminOverview(): Promise<unknown> {
  return rpc("admin_overview", {});
}

const TX_COLUMNS = "id, type, amount, balance_after, status, reference_type, reference_id, description, created_at";

export interface CreditTransactionRow {
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

export async function listCreditTransactions(userId: string, limit = 50): Promise<CreditTransactionRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select(TX_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    apiLogger.error("listCreditTransactions failed", { operation: "listCreditTransactions", errorCategory: error.code });
    throw Errors.internal("Failed to load your credit history.");
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    amount: r.amount,
    balanceAfter: r.balance_after,
    status: r.status,
    referenceType: r.reference_type,
    referenceId: r.reference_id,
    description: r.description,
    createdAt: r.created_at,
  }));
}

export interface CreditPackageRow {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  bonusCredits: number;
  pricePaise: number;
  currency: string;
}

export async function listActiveCreditPackages(): Promise<CreditPackageRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("credit_packages")
    .select("id, name, description, credits, bonus_credits, price_paise, currency")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    apiLogger.error("listActiveCreditPackages failed", { operation: "listActiveCreditPackages", errorCategory: error.code });
    throw Errors.internal("Failed to load credit packages.");
  }
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description, credits: r.credits, bonusCredits: r.bonus_credits, pricePaise: r.price_paise, currency: r.currency }));
}

export async function getCreditPackage(id: string): Promise<CreditPackageRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("credit_packages")
    .select("id, name, description, credits, bonus_credits, price_paise, currency")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    apiLogger.error("getCreditPackage failed", { operation: "getCreditPackage", errorCategory: error.code });
    throw Errors.internal("Failed to load the credit package.");
  }
  return data ? { id: data.id, name: data.name, description: data.description, credits: data.credits, bonusCredits: data.bonus_credits, pricePaise: data.price_paise, currency: data.currency } : null;
}

// ---------- payments ----------

export interface PaymentRow {
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

const PAYMENT_COLUMNS = "id, provider_order_id, provider_payment_id, package_id, package_name, amount_paise, currency, credits, status, created_at, paid_at";

function mapPayment(r: any): PaymentRow {
  return {
    id: r.id,
    providerOrderId: r.provider_order_id,
    providerPaymentId: r.provider_payment_id,
    packageId: r.package_id,
    packageName: r.package_name,
    amountPaise: r.amount_paise,
    currency: r.currency,
    credits: r.credits,
    status: r.status,
    createdAt: r.created_at,
    paidAt: r.paid_at,
  };
}

export async function createPendingPayment(input: {
  userId: string;
  providerOrderId: string;
  packageId: string;
  packageName: string;
  amountPaise: number;
  currency: string;
  credits: number;
}): Promise<PaymentRow> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      user_id: input.userId,
      provider: "razorpay",
      provider_order_id: input.providerOrderId,
      package_id: input.packageId,
      package_name: input.packageName,
      amount_paise: input.amountPaise,
      currency: input.currency,
      credits: input.credits,
      status: "created",
    })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error || !data) {
    apiLogger.error("createPendingPayment failed", { operation: "createPendingPayment", errorCategory: error?.code });
    throw Errors.internal("Failed to start checkout.");
  }
  return mapPayment(data);
}

export async function getOwnedPayment(userId: string, providerOrderId: string): Promise<PaymentRow | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("payments").select(PAYMENT_COLUMNS).eq("provider_order_id", providerOrderId).eq("user_id", userId).maybeSingle();
  if (error) {
    apiLogger.error("getOwnedPayment failed", { operation: "getOwnedPayment", errorCategory: error.code });
    throw Errors.internal("Failed to load the payment.");
  }
  return data ? mapPayment(data) : null;
}

export async function listPayments(userId: string, limit = 50): Promise<PaymentRow[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("payments").select(PAYMENT_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    apiLogger.error("listPayments failed", { operation: "listPayments", errorCategory: error.code });
    throw Errors.internal("Failed to load your payment history.");
  }
  return (data ?? []).map(mapPayment);
}

/** Server-side only: credits the user exactly once for a paid order (idempotent — see 0010's payment_apply_paid). */
export async function applyPaidPayment(providerOrderId: string, providerPaymentId: string, amountPaise: number, currency: string): Promise<{ credited: boolean; duplicate: boolean; credits: number }> {
  try {
    const r = await rpc<{ credited: boolean; duplicate: boolean; credits: number }>("payment_apply_paid", {
      p_order_id: providerOrderId,
      p_payment_id: providerPaymentId,
      p_amount_paise: amountPaise,
      p_currency: currency,
    });
    return r;
  } catch (err) {
    apiLogger.error("payment_apply_paid failed", { operation: "applyPaidPayment", providerOrderId, errorCategory: err instanceof Error ? err.message : "unknown" });
    throw err;
  }
}

export async function markPaymentFailed(providerOrderId: string, reason: string): Promise<void> {
  try {
    await rpc("payment_mark_failed", { p_order_id: providerOrderId, p_reason: reason });
  } catch (err) {
    apiLogger.error("payment_mark_failed failed", { operation: "markPaymentFailed", providerOrderId, errorCategory: err instanceof Error ? err.message : "unknown" });
  }
}

export async function applyRefund(providerOrderId: string, refundId: string): Promise<void> {
  try {
    await rpc("payment_apply_refund", { p_order_id: providerOrderId, p_refund_id: refundId });
  } catch (err) {
    apiLogger.error("payment_apply_refund failed", { operation: "applyRefund", providerOrderId, errorCategory: err instanceof Error ? err.message : "unknown" });
  }
}

// ---------- webhook replay defense ----------

/** Records a provider webhook event id before processing it; returns false if it was already recorded (duplicate delivery). */
export async function recordWebhookEventOnce(providerEventId: string, eventType: string, payload: unknown): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("payment_events").insert({ provider_event_id: providerEventId, event_type: eventType, payload: payload as object });
  if (error) {
    if (error.code === "23505") return false; // already processed this exact event id
    apiLogger.error("recordWebhookEventOnce failed", { operation: "recordWebhookEventOnce", errorCategory: error.code });
    throw Errors.internal("Failed to record webhook event.");
  }
  return true;
}

export function newIdempotencyKey(): string {
  return randomUUID();
}
