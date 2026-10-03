/**
 * "Designed & Developed with love by Swan Digital" footer credit.
 * Fill in the two values below and the logo becomes a link to the official site.
 */
const SWAN_SITE_URL = ""; // e.g. "https://your-swan-site.com"
const SWAN_LOGO_SRC = ""; // e.g. "/images/logo/swan-digital.png" (file placed in client/public/images/logo/)

/** Two swans whose curved necks form a heart. */
function SwanHeart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" role="img" aria-label="love" fill="none">
      <defs>
        <linearGradient id="swan-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5d8f" />
          <stop offset="1" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      {/* Necks: two arches meeting at the bottom point of the heart */}
      <path d="M16 28 C 6 21, 3 14, 6.5 9.5 C 9 6.5, 13.5 7.5, 15.2 11" stroke="url(#swan-heart)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M16 28 C 26 21, 29 14, 25.5 9.5 C 23 6.5, 18.5 7.5, 16.8 11" stroke="url(#swan-heart)" strokeWidth="3.2" strokeLinecap="round" />
      {/* Heads and beaks, facing each other */}
      <circle cx="15" cy="11.6" r="1.9" fill="#fff" stroke="#e11d48" strokeWidth="1" />
      <circle cx="17" cy="11.6" r="1.9" fill="#fff" stroke="#e11d48" strokeWidth="1" />
      <path d="M15.8 12.4 L16 13.6 L16.2 12.4 Z" fill="#f59e0b" />
    </svg>
  );
}

export function SwanCredit() {
  const brand = SWAN_LOGO_SRC ? (
    <img src={SWAN_LOGO_SRC} alt="Swan Digital" className="h-6 w-auto" loading="lazy" />
  ) : (
    <span className="font-semibold text-stone-700">Swan Digital</span>
  );

  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs text-stone-500">
      <span>Designed &amp; Developed with</span>
      <SwanHeart className="h-5 w-5 shrink-0 animate-pulse" />
      <span>by</span>
      {SWAN_SITE_URL ? (
        <a
          href={SWAN_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Swan Digital official website"
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-clay-100 hover:text-stone-900"
        >
          {brand}
        </a>
      ) : (
        brand
      )}
    </p>
  );
}
