import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PageBanner } from "@/components/ui/PageBanner";
import { friendlyErrorMessage } from "@/api/client";
import { getBillingSummary, getCreditTransactions, type BillingSummary, type CreditTransaction } from "@/api/billing";

/** Cards count in one after another, like the stats being tallied up. */
const statGridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const statCardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <motion.div variants={statCardVariants}>
      <Card>
        <CardBody>
          <p className="text-xs uppercase tracking-wide text-stone-400">{label}</p>
          <p className="mt-1 font-display text-2xl text-stone-900">
            {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-stone-500">{sub}</p>}
        </CardBody>
      </Card>
    </motion.div>
  );
}

const TX_TONE: Record<string, "success" | "danger" | "neutral" | "warning"> = {
  purchase: "success",
  generation_hold: "neutral",
  generation_release: "success",
  refund: "warning",
  adjustment: "neutral",
  promotional: "success",
};

export function DashboardPage() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getBillingSummary(), getCreditTransactions()])
      .then(([s, t]) => {
        setSummary(s);
        setTransactions(t.slice(0, 8));
      })
      .catch((err) => setError(friendlyErrorMessage(err, "We couldn't load your dashboard.")));
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
      <PageBanner
        imageSrc="/images/banners/dashboard_banner.jpg"
        badge="Control Center • Studio Overview"
        title="Trial Room Dashboard"
        subtitle="Track customer room scans, in-situ generation metrics, showroom credit balance, and transaction history."
        actions={
          <>
            <Link to="/upload">
              <Button size="lg" className="bg-clay-500 hover:bg-clay-400 text-stone-950 font-semibold shadow-md">
                Launch New Trial →
              </Button>
            </Link>
            <Link to="/credits">
              <Button size="lg" variant="outline" className="border-white/20 text-white hover:bg-white/10">
                Top Up Credits
              </Button>
            </Link>
          </>
        }
      />

      {!summary ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          <section className="mt-8">
            <Card className="border-stone-900 shadow-md">
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-stone-400">Available Trial Balance</p>
                  <p className="mt-1 font-display text-4xl text-stone-900">
                    <AnimatedNumber value={summary.balance} /> Credits
                  </p>
                  {summary.balance <= 20 && (
                    <p className="mt-1 text-sm text-amber-700">
                      {summary.balance === 0 ? "You've used all available credits." : "Your credits are running low."}
                    </p>
                  )}
                </div>
                <Link to="/credits">
                  <Button size="lg">Top Up Balance</Button>
                </Link>
              </CardBody>
            </Card>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-lg text-stone-900">Usage Analytics</h2>
            <motion.div className="mt-3 grid gap-4 sm:grid-cols-4" variants={statGridVariants} initial="hidden" animate="show">
              <StatCard label="Used today" value={summary.used.today} />
              <StatCard label="Used this week" value={summary.used.week} />
              <StatCard label="Used this month" value={summary.used.month} />
              <StatCard label="Total used" value={summary.used.total} sub={summary.used.reserved > 0 ? `${summary.used.reserved} reserved` : undefined} />
            </motion.div>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-lg text-stone-900">Trial Renderings</h2>
            <motion.div className="mt-3 grid gap-4 sm:grid-cols-4" variants={statGridVariants} initial="hidden" animate="show">
              <StatCard label="Total" value={summary.generations.total} />
              <StatCard label="Successful" value={summary.generations.completed} />
              <StatCard label="Failed" value={summary.generations.failed} />
              <StatCard label="In progress" value={summary.generations.inProgress} />
            </motion.div>
          </section>

          <section className="mt-8">
            <h2 className="font-display text-lg text-stone-900">Payments & Passes</h2>
            <motion.div className="mt-3 grid gap-4 sm:grid-cols-4" variants={statGridVariants} initial="hidden" animate="show">
              <StatCard label="Total paid" value={`₹${(summary.payments.paidPaise / 100).toLocaleString()}`} />
              <StatCard label="Successful" value={summary.payments.paid} />
              <StatCard label="Pending" value={summary.payments.pending} />
              <StatCard label="Failed" value={summary.payments.failed} />
            </motion.div>
          </section>

          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-stone-900">Recent Transactions</h2>
              <Link to="/credits" className="text-sm text-stone-500 underline hover:text-stone-900">
                View all
              </Link>
            </div>
            <Card className="mt-3 overflow-x-auto shadow-sm">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Credits</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-stone-400">
                        No transactions yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((t, i) => (
                      <motion.tr
                        key={t.id}
                        className="border-b border-stone-50 last:border-0"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.03, ease: "easeOut" }}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-stone-500">{new Date(t.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <Badge tone={TX_TONE[t.type] ?? "neutral"}>{t.type.replace(/_/g, " ")}</Badge>
                        </td>
                        <td className="px-4 py-3 text-stone-700">{t.description}</td>
                        <td className={`px-4 py-3 text-right font-medium ${t.amount >= 0 ? "text-emerald-700" : "text-stone-900"}`}>
                          {t.amount > 0 ? "+" : ""}
                          {t.amount}
                        </td>
                        <td className="px-4 py-3 text-right text-stone-500">{t.balanceAfter}</td>
                        <td className="px-4 py-3 text-stone-500">{t.status}</td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </PageContainer>
  );
}
