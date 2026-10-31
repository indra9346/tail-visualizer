import { useEffect, useState } from "react";
import { getBillingSummary, getCreditPackages } from "@/api/billing";

/**
 * Credits shown the way an owner thinks about them: how many real photos are left. The server still counts credits
 * (one real photo costs `cost` credits); this only converts for display.
 */
export function photosFrom(credits: number, cost: number): number {
  return cost > 0 ? Math.floor(credits / cost) : 0;
}

export interface PhotosLeft {
  /** Real photos the balance pays for; null while loading or if it could not be loaded. */
  photos: number | null;
  balance: number | null;
  cost: number | null;
}

export function usePhotosLeft(): PhotosLeft & { reload: () => void } {
  const [state, setState] = useState<PhotosLeft>({ photos: null, balance: null, cost: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getBillingSummary(), getCreditPackages()])
      .then(([summary, pkgs]) => {
        if (cancelled) return;
        setState({ balance: summary.balance, cost: pkgs.generationCreditCost, photos: photosFrom(summary.balance, pkgs.generationCreditCost) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return { ...state, reload: () => setAttempt((n) => n + 1) };
}
