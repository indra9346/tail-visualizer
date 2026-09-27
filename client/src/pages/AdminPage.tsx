import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { friendlyErrorMessage } from "@/api/client";
import { getAdminOverview, type AdminOverview } from "@/api/admin";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-stone-400">{label}</p>
        <p className="mt-1 font-display text-2xl text-stone-900">{value}</p>
      </CardBody>
    </Card>
  );
}

/**
 * Admin-only overview. Authorization is enforced entirely server-side
 * (profiles.is_admin, re-checked on every request) — this page never
 * decides who is an admin; it only renders what the server chose to
 * return (or a 403/"not found" state for anyone else).
 */
export function AdminPage() {
  const [overview, setOverview] = useState<AdminOverview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminOverview()
      .then(setOverview)
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load the admin overview.")));
  }, []);

  if (error) {
    return (
      <PageContainer className="max-w-5xl">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  if (overview === undefined) {
    return (
      <PageContainer className="max-w-5xl">
        <Skeleton className="h-40" />
      </PageContainer>
    );
  }

  if (overview === null) {
    return (
      <PageContainer className="max-w-5xl">
        <p className="text-stone-500">You don't have access to this page.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl">
      <h1 className="font-display text-3xl text-stone-900">Admin</h1>

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        <Stat label="Total users" value={overview.users.total} />
        <Stat label="Active (30d)" value={overview.users.active_30d} />
        <Stat label="Credits purchased" value={overview.credits.purchased} />
        <Stat label="Credits consumed" value={overview.credits.consumed} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Credits reserved (in-flight)" value={overview.credits.reserved} />
        <Stat label="Outstanding balance (all users)" value={overview.credits.outstanding} />
        <Stat label="Generations total" value={overview.generations.total} />
        <Stat label="Generation success rate" value={overview.generations.total ? `${Math.round((overview.generations.completed / overview.generations.total) * 100)}%` : "—"} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Payments (paid)" value={overview.payments.paid_count} />
        <Stat label="Payment volume" value={`₹${(overview.payments.paid_paise / 100).toLocaleString("en-IN")}`} />
        <Stat label="Payments failed" value={overview.payments.failed_count} />
        <Stat label="Refunds" value={overview.payments.refunded_count} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg text-stone-900">Recent transactions</h2>
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {overview.recent_transactions.map((t) => (
                <tr key={t.id} className="border-b border-stone-50 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-stone-500">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-xs text-stone-400">{t.user_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-stone-700">{t.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-right text-stone-900">{t.amount}</td>
                  <td className="px-4 py-3 text-stone-500">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {overview.recent_errors.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg text-stone-900">Recent generation errors</h2>
          <Card className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <tbody>
                {overview.recent_errors.map((e) => (
                  <tr key={e.id} className="border-b border-stone-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-stone-500">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs text-stone-400">{e.user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-stone-700">{e.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </PageContainer>
  );
}
