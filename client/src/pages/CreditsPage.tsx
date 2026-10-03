import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PageBanner } from "@/components/ui/PageBanner";
import { Tile, TileLabel, type TileTone } from "@/components/ui/Tile";
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

/** Package cards count in one after another. */
const packageGridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const packageCardVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" } },
};

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const PACK_TONES: TileTone[] = ["sky", "sun", "teal", "rose"];

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
      <PageBanner
        scene="terrazzo"
        badge="Studio Passes • Rendering Power"
        title="Trial Room Studio Passes & Credits"
        subtitle="Fuel your virtual trial room with credits for photorealistic in-situ room visualizations, instant multi-tile comparisons, and high-resolution exports."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-700">
              Secured with 256-bit encryption by Razorpay
            </span>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Tile tone="feature" className="flex flex-wrap items-center justify-between gap-4 p-6 lg:col-span-2">
          <div>
            <TileLabel>Available balance</TileLabel>
            <p className="mt-1 font-display text-5xl font-bold text-white">
              {summary ? <AnimatedNumber value={summary.balance} /> : "—"}
              <span className="ml-2 text-lg font-medium text-teal-50">credits</span>
            </p>
          </div>
          <Link to="/upload">
            <Button size="lg" className="bg-white text-stone-900 hover:bg-teal-50">
              Use credits in trial room →
            </Button>
          </Link>
        </Tile>
        <Tile tone="soft" className="flex flex-col justify-center">
          <TileLabel>How it works</TileLabel>
          <p className="mt-2 text-sm text-stone-700">Each preview holds credits while it generates. If it fails, the credits are returned automatically.</p>
          <p className="mt-2 text-xs text-stone-500">Payments run securely through Razorpay.</p>
        </Tile>
      </div>

      <AnimatePresence>
        {justPurchased && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mt-4 overflow-hidden"
          >
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
              {justPurchased}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {buyError && (
        <div className="mt-4">
          <ErrorState message={buyError} />
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-stone-900 font-semibold">Choose a Studio Pass</h2>
          <span className="text-xs text-stone-500">Instant credit activation</span>
        </div>
        {packages.length === 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        ) : (
          <motion.div className="mt-4 grid gap-4 sm:grid-cols-3" variants={packageGridVariants} initial="hidden" animate="show">
            {packages.map((pkg, index) => {
              const total = pkg.credits + pkg.bonusCredits;
              const perCredit = pkg.pricePaise / total;
              return (
                <motion.div key={pkg.id} variants={packageCardVariants} whileHover={{ y: -4 }} transition={{ duration: 0.18 }}>
                  <Tile tone={PACK_TONES[index % PACK_TONES.length] ?? "plain"} interactive className="flex h-full flex-col">
                    <div className="flex flex-1 flex-col">
                      <p className="font-display text-lg text-stone-900 font-semibold">{pkg.name}</p>
                      {pkg.description && <p className="mt-1 text-sm text-stone-500">{pkg.description}</p>}
                      <p className="mt-4 font-display text-3xl text-stone-900 font-bold">{formatINR(pkg.pricePaise)}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {pkg.credits.toLocaleString()} credits
                        {pkg.bonusCredits > 0 && <span className="ml-1 text-emerald-700 font-medium">+ {pkg.bonusCredits} bonus</span>}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">≈ ₹{(perCredit / 100).toFixed(2)} per credit</p>
                      <div className="flex-1" />
                      <Button className="mt-6 w-full" loading={buyingId === pkg.id} disabled={buyingId !== null} onClick={() => buy(pkg)}>
                        Buy {total.toLocaleString()} Credits
                      </Button>
                    </div>
                  </Tile>
                </motion.div>
              );
            })}
          </motion.div>
        )}
        <p className="mt-3 text-xs text-stone-400">Payments are processed securely via Razorpay with all major cards, UPI, and net banking.</p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg text-stone-900 font-semibold">Credit Transaction History</h2>
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
                transactions.map((t, i) => (
                  <motion.tr
                    key={t.id}
                    className="border-b border-stone-50 last:border-0"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: Math.min(i, 12) * 0.025, ease: "easeOut" }}
                  >
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
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </PageContainer>
  );
}
