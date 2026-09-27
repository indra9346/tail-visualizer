import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { friendlyErrorMessage } from "@/api/client";
import { getPayments, type Payment } from "@/api/billing";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  created: "warning",
  failed: "danger",
  refunded: "neutral",
};

export function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPayments()
      .then(setPayments)
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load your payment history.")));
  }, []);

  if (error) {
    return (
      <PageContainer className="max-w-5xl">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl">
      <h1 className="font-display text-3xl text-stone-900">Payments</h1>
      <p className="mt-2 text-stone-600">Every credit purchase and its status.</p>

      <div className="mt-6">
        {payments === null ? null : payments.length === 0 ? (
          <EmptyState title="No payments yet" description="Buy credits to see your payment history here." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Currency</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Payment ID</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-stone-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-stone-500">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-stone-900">
                      {p.packageName} <span className="text-stone-400">({p.credits} credits)</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-stone-900">₹{(p.amountPaise / 100).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-stone-500">{p.currency}</td>
                    <td className="px-4 py-3 text-stone-500">razorpay</td>
                    <td className="px-4 py-3 text-xs text-stone-400">{p.providerPaymentId ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
