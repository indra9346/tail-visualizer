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
import { Tile, TileLabel, type TileTone } from "@/components/ui/Tile";
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

function MetricTile({ title, items, tone, note, className }: { title: string; items: Array<[string, string | number]>; tone: TileTone; note?: string; className?: string }) {
  return (
    <motion.div variants={statCardVariants} className={className}>
      <Tile tone={tone} className="h-full">
        <TileLabel>{title}</TileLabel>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {items.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="font-display text-2xl text-stone-900">{typeof value === "number" ? <AnimatedNumber value={value} /> : value}</dd>
            </div>
          ))}
        </dl>
        {note && <p className="mt-3 text-xs text-stone-600">{note}</p>}
      </Tile>
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
      <PageContainer className="max-w-6xl">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-6xl">
      <PageBanner
        scene="mosaic"
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
              <Button size="lg" variant="outline" className="border-stone-300 bg-white/80 text-stone-900 hover:bg-white">
                Top Up Credits
              </Button>
            </Link>
          </>
        }
      />

      {!summary ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          {/* Bento layout: one big balance tile, then grouped metric tiles of different widths */}
          <motion.div className="mt-8 grid gap-4 lg:grid-cols-6" variants={statGridVariants} initial="hidden" animate="show">
            <motion.div variants={statCardVariants} className="lg:col-span-3 lg:row-span-2">
              <Tile tone="feature" className="flex h-full flex-col justify-between gap-6 p-6 sm:p-7">
                <div>
                  <TileLabel>Available trial balance</TileLabel>
                  <p className="mt-2 font-display text-5xl font-bold text-white sm:text-6xl">
                    <AnimatedNumber value={summary.balance} />
                  </p>
                  <p className="mt-1 text-sm text-teal-50">credits</p>
                  {summary.balance <= 20 && (
                    <p className="mt-3 inline-block rounded-lg bg-white/20 px-3 py-1.5 text-sm font-medium text-white">
                      {summary.balance === 0 ? "You've used all available credits." : "Your credits are running low."}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link to="/credits">
                    <Button size="lg" className="bg-white text-stone-900 hover:bg-teal-50">
                      Top up balance
                    </Button>
                  </Link>
                  <Link to="/upload">
                    <Button size="lg" variant="outline" className="border-white/60 text-white hover:bg-white/15">
                      Start a trial
                    </Button>
                  </Link>
                </div>
              </Tile>
            </motion.div>

            <MetricTile className="lg:col-span-3" tone="sky" title="Credits used" items={[["Today", summary.used.today], ["This week", summary.used.week], ["This month", summary.used.month], ["All time", summary.used.total]]} note={summary.used.reserved > 0 ? `${summary.used.reserved} credits reserved for running previews` : undefined} />
            <MetricTile className="lg:col-span-3" tone="soft" title="Trial renderings" items={[["Total", summary.generations.total], ["Successful", summary.generations.completed], ["Failed", summary.generations.failed], ["In progress", summary.generations.inProgress]]} />
            <MetricTile className="lg:col-span-6" tone="sun" title="Payments & passes" items={[["Total paid", `₹${(summary.payments.paidPaise / 100).toLocaleString()}`], ["Successful", summary.payments.paid], ["Pending", summary.payments.pending], ["Failed", summary.payments.failed]]} />
          </motion.div>

          <section className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-stone-900">Recent transactions</h2>
              <Link to="/credits" className="text-sm font-medium text-clay-700 hover:underline">
                View all
              </Link>
            </div>
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
