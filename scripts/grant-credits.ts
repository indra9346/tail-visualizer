/**
 * Manual credit grant — LOCAL/ADMIN USE ONLY.
 *
 * Tops a user's credit balance up to a target amount (default 100),
 * identified by their sign-in email. Uses the service-role Supabase
 * client (server/lib/supabaseServerClient.ts) and the same `credit_apply`
 * ledger primitive the generation-hold/payment flows use, so the grant is
 * atomic, idempotent, and shows up in the user's normal transaction
 * history as a `promotional` entry — never a silent balance edit.
 *
 * This only ever ADDS credits (tops up); if the account is already at or
 * above the target, it makes no change and says so.
 *
 * Usage: tsx scripts/grant-credits.ts <email> [targetBalance=100]
 *
 * SECURITY: must never print the service-role key or any other secret —
 * only the account email, balances, and the resulting transaction id.
 */
import "../server/lib/loadLocalEnv.js";

import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "../server/lib/supabaseServerClient.js";

async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getSupabaseServerClient();
  const perPage = 1000;
  let page = 1;

  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;

    if (data.users.length < perPage) return null; // last page, not found
    page += 1;
  }
}

async function main() {
  const email = process.argv[2];
  const targetBalance = Number(process.argv[3] ?? 100);

  if (!email || !email.includes("@")) {
    console.error("Usage: tsx scripts/grant-credits.ts <email> [targetBalance=100]");
    process.exitCode = 1;
    return;
  }
  if (!Number.isInteger(targetBalance) || targetBalance <= 0) {
    console.error(`Invalid target balance: ${targetBalance}`);
    process.exitCode = 1;
    return;
  }

  const supabase = getSupabaseServerClient();

  const userId = await findUserIdByEmail(email);
  if (!userId) {
    console.error(`No account found for ${email}`);
    process.exitCode = 1;
    return;
  }

  const { data: account, error: acctError } = await supabase
    .from("credit_accounts")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (acctError) throw acctError;

  const currentBalance = account?.balance ?? 0;
  const delta = targetBalance - currentBalance;

  if (delta <= 0) {
    console.log(`${email} is already at ${currentBalance} credits (target ${targetBalance}). No change made.`);
    return;
  }

  const { data: result, error } = await supabase.rpc("credit_apply", {
    p_user: userId,
    p_amount: delta,
    p_type: "promotional",
    p_desc: `Manual top-up to ${targetBalance} credits (admin script)`,
    p_ref_type: null,
    p_ref_id: null,
    p_meta: {},
    p_idem: randomUUID(),
    p_status: "posted",
  });
  if (error) throw error;

  console.log(`Granted ${delta} credits to ${email}. Balance: ${currentBalance} -> ${result.balance} (transaction ${result.transaction_id}).`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  // Defensive redaction in case an SDK error ever echoed a header/key fragment.
  console.error("Failed:", message.replace(/[A-Za-z0-9_-]{20,}/g, "<redacted>"));
  process.exitCode = 1;
});
