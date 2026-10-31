import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  CheckoutClosedError,
  PaymentWidgetError,
} from "@/api/billing";
import { Icon } from "@/components/simple/Icon";
import { ActionBar, IconLink, Screen, bigButton } from "@/components/simple/Flow";
import { cn } from "@/lib/cn";
import { photosFrom } from "@/lib/usePhotosLeft";

function formatINR(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** The pack most shops buy: the middle one of the list. */
const middleIndex = (count: number) => Math.max(0, Math.floor((count - 1) / 2));

const CHECKS = ["Photos are added right after you pay.", "If a photo fails, nothing is used.", "Pay with UPI, card or net banking."];

/** "Add more photos": the credit packs shown as real photos, paid through Razorpay. */
export function CreditsPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [packagesLoaded, setPackagesLoaded] = useState(false);
  const [cost, setCost] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [justPurchased, setJustPurchased] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const purchasedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function refresh() {
    return Promise.all([getBillingSummary(), getCreditTransactions()]).then(([s, t]) => {
      setSummary(s);
      setTransactions(t);
    });
  }

  useEffect(() => {
    setLoadError(null);
    Promise.all([getCreditPackages(), refresh()])
      .then(([p]) => {
        setPackages(p.packages);
        setCost(p.generationCreditCost);
        setPackagesLoaded(true);
        setSelectedId((cur) => cur ?? p.packages[middleIndex(p.packages.length)]?.id ?? null);
      })
      .catch((err) => setLoadError(friendlyErrorMessage(err, "We could not load the photo packs.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => () => {
    if (purchasedTimer.current) clearTimeout(purchasedTimer.current);
  }, []);

  const photosOf = (credits: number) => (cost ? photosFrom(credits, cost) : null);

  async function buy(pkg: CreditPackage) {
    setBuyError(null);
    setBuyingId(pkg.id);
    try {
      await loadRazorpayCheckoutScript();
      const checkout = await createCheckout(pkg.id);
      const result = await openRazorpayCheckout(checkout, user?.email ?? undefined);
      await verifyCheckout(result);
      await refresh();
      const added = photosOf(pkg.credits + pkg.bonusCredits);
      setJustPurchased(added !== null ? `${plural(added, "photo", "photos")} added. Thank you.` : `${pkg.credits + pkg.bonusCredits} credits added to your account.`);
      if (purchasedTimer.current) clearTimeout(purchasedTimer.current);
      purchasedTimer.current = setTimeout(() => setJustPurchased(null), 6000);
    } catch (err) {
      // Closing the payment window is not an error with the purchase; say plainly that nothing was charged.
      if (err instanceof CheckoutClosedError || err instanceof PaymentWidgetError) setBuyError(err.message);
      else setBuyError(friendlyErrorMessage(err, "We couldn't complete your purchase. If you were charged, it will be credited automatically shortly."));
    } finally {
      setBuyingId(null);
    }
  }

  const selected = packages.find((p) => p.id === selectedId) ?? null;
  const photosLeft = summary ? photosOf(summary.balance) : null;
  const popular = packages.length >= 3 ? middleIndex(packages.length) : -1;

  return (
    <Screen className="pt-3.5 sm:pt-5">
      <header className="flex items-center gap-3 pb-2.5">
        <IconLink to="/more" label="Back" />
        <h1 className="min-w-0 flex-1 font-display text-2xl font-semibold leading-[30px] text-ink">Add more photos</h1>
      </header>

      {loadError ? (
        <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border-[1.5px] border-hairline bg-white px-5 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FBEDEA] text-[#A23B2A]">
            <Icon name="alert" />
          </span>
          <p className="text-base font-semibold text-ink">{loadError}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={bigButton("secondary", "max-w-xs")}>
            <Icon name="retry" />
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2.5 rounded-2xl border-[1.5px] border-hairline bg-white px-3.5 py-3 text-base leading-5 text-ink">
            <Icon name="camera" />
            {photosLeft !== null ? (
              <span>
                You have <b>{plural(photosLeft, "photo", "photos")}</b> left
              </span>
            ) : (
              <span className="text-[#5B665D]">Checking your photos…</span>
            )}
          </p>

          {justPurchased && (
            <p role="status" className="flex items-center gap-2 rounded-2xl border-[1.5px] border-[#B9D7C4] bg-[#E6F2EA] px-3.5 py-3 text-[15px] font-semibold text-[#1F6B43]">
              <Icon name="check" />
              {justPurchased}
            </p>
          )}
          {buyError && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl bg-[#FBEDEA] px-3.5 py-3 text-[15px] font-semibold text-[#8C2F21]">
              <Icon name="alert" className="h-5 w-5" />
              {buyError}
            </p>
          )}

          {!packagesLoaded ? (
            <div aria-busy="true" aria-label="Loading photo packs" className="flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[100px] animate-pulse rounded-[18px] bg-sage-200" />
              ))}
            </div>
          ) : packages.length === 0 ? (
            <p className="rounded-2xl border-[1.5px] border-hairline bg-white px-3.5 py-4 text-base text-ink">No photo packs to buy right now. Please try again later.</p>
          ) : (
            <div role="radiogroup" aria-label="Choose a pack" className="mt-1 flex flex-col gap-2.5">
              {packages.map((pkg, index) => {
                const on = pkg.id === selectedId;
                const total = photosOf(pkg.credits + pkg.bonusCredits);
                const base = photosOf(pkg.credits);
                const free = total !== null && base !== null ? total - base : 0;
                const note = free > 0 && base !== null ? `${base.toLocaleString("en-IN")} + ${plural(free, "free photo", "free photos")}` : pkg.description;
                const each = total ? Math.round(pkg.pricePaise / 100 / total) : null;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={buyingId !== null}
                    onClick={() => setSelectedId(pkg.id)}
                    className={cn(
                      "relative flex items-center gap-3 rounded-[18px] p-3.5 text-left text-ink transition-colors disabled:cursor-not-allowed",
                      on ? "border-[2.5px] border-stone-900 bg-sage-200" : "border-2 border-[#D3DACF] bg-white hover:border-[#8E9A8F]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("h-6 w-6 shrink-0 rounded-full", on ? "border-[7px] border-stone-900 bg-white" : "border-2 border-[#8E9A8F]")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-extrabold uppercase leading-4 tracking-[0.06em] text-[#5B665D]">{pkg.name}</span>
                      <span className="block font-display text-[26px] font-semibold leading-8">
                        {total !== null ? plural(total, "photo", "photos") : `${(pkg.credits + pkg.bonusCredits).toLocaleString("en-IN")} credits`}
                      </span>
                      {note && <span className="block text-sm leading-[18px] text-[#5B665D]">{note}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[22px] font-extrabold leading-7">{formatINR(pkg.pricePaise)}</span>
                      {each !== null && <span className="block text-[13px] leading-4 text-[#5B665D]">about ₹{each.toLocaleString("en-IN")} a photo</span>}
                    </span>
                    {index === popular && (
                      <span className="absolute -top-[11px] right-3 h-[22px] rounded-full bg-champagne-500 px-2.5 text-[11px] font-extrabold leading-[22px] text-ink">
                        MOST SHOPS PICK THIS
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <ul className="mt-1 flex flex-col gap-2 text-[15px] leading-5 text-ink">
            {CHECKS.map((line) => (
              <li key={line} className="flex items-center gap-2.5">
                <Icon name="check" className="text-[#1F6B43]" />
                {line}
              </li>
            ))}
          </ul>

          <details className="group mt-2 rounded-2xl border-[1.5px] border-hairline bg-white">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-3.5 py-2 text-base font-bold text-ink [&::-webkit-details-marker]:hidden">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-200">
                <Icon name="history" />
              </span>
              <span className="min-w-0 flex-1">Past payments and photos used</span>
              <Icon name="chevron" className="text-[#5B665D] transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-[#EEF1EC] px-3.5 pb-3 pt-2">
              <p className="text-[13px] leading-[17px] text-[#5B665D]">
                Shown in credits{cost ? `: 1 photo uses ${cost} credits` : ""}.{" "}
                <Link to="/payments" className="font-semibold text-ink underline">
                  Bills and receipts
                </Link>
              </p>
              {transactions.length === 0 ? (
                <p className="py-4 text-center text-[15px] text-[#5B665D]">No payments or photos used yet.</p>
              ) : (
                <ul className="mt-1">
                  {transactions.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 border-t border-[#EEF1EC] py-2.5 first:border-t-0">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] leading-5 text-ink">{t.description}</span>
                        <span className="block text-[13px] leading-[17px] text-[#5B665D]">
                          {[new Date(t.createdAt).toLocaleString("en-IN"), t.type.replace(/_/g, " "), t.status, t.referenceId && `Ref ${t.referenceId}`].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cn("block text-[15px] font-bold", t.amount >= 0 ? "text-[#1F6B43]" : "text-ink")}>
                          {t.amount > 0 ? "+" : ""}
                          {t.amount}
                        </span>
                        <span className="block text-[13px] text-[#5B665D]">Left {t.balanceAfter}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>

          <ActionBar className="mt-3">
            <button
              type="button"
              disabled={!selected || buyingId !== null}
              aria-busy={buyingId !== null}
              onClick={() => selected && buy(selected)}
              className={bigButton("primary")}
            >
              {buyingId !== null ? "Opening payment…" : selected ? `Pay ${formatINR(selected.pricePaise)}` : "Pay"}
              {buyingId === null && <Icon name="next" />}
            </button>
            <p className="mt-2 text-center text-[13px] leading-[17px] text-[#5B665D]">Safe payment by Razorpay</p>
          </ActionBar>
        </div>
      )}
    </Screen>
  );
}
