import { useEffect, useState } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { friendlyErrorMessage } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import {
  createCheckout,
  getBillingSummary,
  getCreditPackages,
  getCreditTransactions,
  loadRazorpayCheckoutScript,
  openRazorpayCheckout,
  verifyCheckout,
  type BillingSummary,
  type CreditPackage,
  type CreditTransaction,
} from "@/api/billing";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function CreditsPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [justPurchased, setJustPurchased] = useState<string | null>(null);

  function refresh() {
    return Promise.all([getBillingSummary(), getCreditTransactions()]).then(([s, t]) => {
      setSummary(s);
      setTransactions(t);
    });
  }

  useEffect(() => {
    Promise.all([getCreditPackages(), refresh()])
      .then(([p]) => setPackages(p.packages))
      .catch((err) => setLoadError(friendlyErrorMessage(err, "We couldn't load credit packages.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy(pkg: CreditPackage) {
    setBuyError(null);
    setBuyingId(pkg.id);
    try {
      await loadRazorpayCheckoutScript();
      const checkout = await createCheckout(pkg.id);
      const result = await openRazorpayCheckout(checkout, user?.email ?? undefined);
      // The server independently re-verifies the signature below — this call is
      // just so the UI can show the new balance right away instead of waiting
      // for the webhook, which credits the SAME payment idempotently either way.
      await verifyCheckout(result);
      await refresh();
      setJustPurchased(`${pkg.credits + pkg.bonusCredits} credits added to your account.`);
      setTimeout(() => setJustPurchased(null), 6000);
    } catch (err) {
      setBuyError(friendlyErrorMessage(err, "We couldn't complete your purchase. If you were charged, it will be credited automatically shortly."));
    } finally {
      setBuyingId(null);
    }
  }

  if (loadError) {
    return (
      <PageContainer className="max-w-5xl">
        <ErrorState message={loadError} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-5xl">
      <h1 className="font-display text-3xl text-stone-900">Credits</h1>
      <p className="mt-2 text-stone-600">Buy credits to generate tile visualizations. Payments are processed securely by Razorpay.</p>

      <Card className="mt-6 border-stone-900">
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-stone-400">Current balance</p>
          <p className="mt-1 font-display text-3xl text-stone-900">{summary ? summary.balance.toLocaleString() : "—"} Credits</p>
        </CardBody>
      </Card>

      {justPurchased && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {justPurchased}
        </div>
      )}
      {buyError && (
        <div className="mt-4">
          <ErrorState message={buyError} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="font-display text-xl text-stone-900">Buy Credits</h2>
        {packages.length === 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {packages.map((pkg) => {
              const total = pkg.credits + pkg.bonusCredits;
              const perCredit = pkg.pricePaise / total;
              return (
                <Card key={pkg.id} className="flex flex-col">
                  <CardBody className="flex flex-1 flex-col">
                    <p className="font-display text-lg text-stone-900">{pkg.name}</p>
                    {pkg.description && <p className="mt-1 text-sm text-stone-500">{pkg.description}</p>}
                    <p className="mt-4 font-display text-3xl text-stone-900">{formatINR(pkg.pricePaise)}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {pkg.credits.toLocaleString()} credits
                      {pkg.bonusCredits > 0 && <span className="ml-1 text-emerald-700">+ {pkg.bonusCredits} bonus</span>}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">≈ ₹{(perCredit / 100).toFixed(2)} per credit</p>
                    <div className="flex-1" />
                    <Button className="mt-6 w-full" loading={buyingId === pkg.id} disabled={buyingId !== null} onClick={() => buy(pkg)}>
                      Buy {total.toLocaleString()} Credits
                    </Button>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-stone-400">Prices shown are set by the showroom owner and may change.</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg text-stone-900">Credit history</h2>
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Credits</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-stone-400">
                    No credit activity yet.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="border-b border-stone-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-stone-500">{new Date(t.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge tone={t.amount >= 0 ? "success" : "neutral"}>{t.type.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{t.description}</td>
                    <td className={`px-4 py-3 text-right font-medium ${t.amount >= 0 ? "text-emerald-700" : "text-stone-900"}`}>
                      {t.amount > 0 ? "+" : ""}
                      {t.amount}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-500">{t.balanceAfter}</td>
                    <td className="px-4 py-3 text-stone-500">{t.status}</td>
                    <td className="px-4 py-3 text-xs text-stone-400">{t.referenceId ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </PageContainer>
  );
}
