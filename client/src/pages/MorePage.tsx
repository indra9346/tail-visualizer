import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@/components/simple/Icon";
import { Screen } from "@/components/simple/Flow";
import { useAuth } from "@/context/AuthContext";
import { usePhotosLeft } from "@/lib/usePhotosLeft";

interface Item {
  to: string;
  label: string;
  help: string;
  icon: IconName;
}

const ITEMS: Item[] = [
  { to: "/calculator", label: "Boxes calculator", help: "Boxes and price for any tile", icon: "calculator" },
  { to: "/my-visualizations", label: "Design history", help: "Every real photo you made", icon: "history" },
  { to: "/payments", label: "Payments and bills", help: "Past payments and receipts", icon: "card" },
  { to: "/demos", label: "Sample before / after", help: "Show customers what the app can do", icon: "compare" },
];

const row = "flex min-h-[60px] w-full items-center gap-3 px-3.5 py-1.5 text-left";

/** Everything that is not a daily job: photos left, the calculator, history, payments, sign out. */
export function MorePage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { photos } = usePhotosLeft();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function onSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      // Same as the old menus: sign out, then the public home page. The saved tile and room of this owner are
      // forgotten by the workflow store as soon as the account changes.
      await signOut();
      navigate("/");
    } catch {
      setSignOutError("Could not sign out. Check the internet and try again.");
      setSigningOut(false);
    }
  }

  return (
    <Screen className="flex flex-col gap-3 pb-6">
      <h1 className="font-display text-[28px] font-semibold leading-[34px] text-ink">More</h1>

      <section aria-labelledby="photos-left-title" className="flex items-center gap-3.5 rounded-[22px] bg-stone-900 px-[18px] py-4 text-white">
        <div className="min-w-0 flex-1">
          <h2 id="photos-left-title" className="text-[13px] font-extrabold leading-4 tracking-[0.08em] text-champagne-400">
            PHOTOS LEFT
          </h2>
          <p className="font-display text-[44px] font-semibold leading-[50px]" aria-live="polite">
            {photos ?? (
              <>
                <span aria-hidden="true">–</span>
                <span className="sr-only">Not known yet</span>
              </>
            )}
          </p>
          <p className="text-[15px] leading-5 text-sage-300">
            Each real photo uses 1.
            <br />
            Failed photos are free.
          </p>
        </div>
        <Link to="/credits" className="flex h-14 shrink-0 items-center gap-1.5 rounded-2xl bg-champagne-400 px-4 text-base font-extrabold text-ink hover:bg-champagne-500">
          <Icon name="plus" />
          Add photos
        </Link>
      </section>

      <nav aria-label="More options" className="overflow-hidden rounded-[20px] border-[1.5px] border-hairline bg-white">
        <ul>
          {ITEMS.map((item) => (
            <li key={item.to} className="border-t border-[#EEF1EC] first:border-t-0">
              <Link to={item.to} className={`${row} text-ink hover:bg-sage-100`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-200">
                  <Icon name={item.icon} />
                </span>
                <span className="min-w-0 flex-1 text-base font-bold leading-5">
                  {item.label}
                  <span className="block text-[13px] font-medium leading-[17px] text-[#5B665D]">{item.help}</span>
                </span>
                <Icon name="chevron" className="text-[#5B665D]" />
              </Link>
            </li>
          ))}
          <li className="border-t border-[#EEF1EC]">
            <button type="button" onClick={onSignOut} disabled={signingOut} aria-busy={signingOut} className={`${row} text-[#A23B2A] hover:bg-[#FBEDEA]/60 disabled:opacity-60`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBEDEA]">
                <Icon name="logout" />
              </span>
              <span className="min-w-0 flex-1 text-base font-bold leading-5">{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </li>
        </ul>
      </nav>

      {signOutError && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-[#FBEDEA] px-3.5 py-3 text-[15px] font-semibold text-[#8C2F21]">
          <Icon name="alert" className="h-5 w-5" />
          {signOutError}
        </p>
      )}
    </Screen>
  );
}
