import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const publicNavItems = [
  { to: "/", label: "Home", end: true },
  { to: "/demos", label: "Live Demos" },
  { to: "/tiles", label: "Tile Catalog" },
  // Publicly reachable (no sign-in required) — see App.tsx and
  // MyVisualizationsPage.tsx: a signed-out visitor gets the public feed of
  // visualizations their owners have explicitly made public.
  { to: "/my-visualizations", label: "My Visualizations" },
];

const authNavItems = [
  { to: "/", label: "Home", end: true },
  { to: "/demos", label: "Live Demos" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/projects", label: "Visualize" },
  { to: "/tiles", label: "Tile Catalog" },
  { to: "/my-tiles", label: "My Tiles" },
  { to: "/my-visualizations", label: "My Visualizations" },
  { to: "/credits", label: "Credits" },
];

export function Navbar() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);

  const activeNavItems = user ? authNavItems : publicNavItems;

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    if (mobileOpen && !menu.open) {
      menu.showModal();
    } else if (!mobileOpen && menu.open) {
      menu.close();
    }
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#fdfbf7]/90 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-3 py-1 group" onClick={() => setMobileOpen(false)}>
          <img
            src="/images/logo/tiletry_logo.jpg"
            alt="TileTry Logo"
            className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-stone-900/15 group-hover:scale-105 transition-transform"
          />
          <div className="flex flex-col justify-center">
            <span className="font-display text-xl font-bold tracking-tight text-stone-950 leading-snug">TileTry</span>
            <span className="text-[10px] font-sans font-bold uppercase tracking-widest text-clay-800 whitespace-nowrap leading-tight">
              Virtual Trial Room
            </span>
          </div>
        </NavLink>

        <button
          type="button"
          className="rounded-lg p-2 text-stone-700 transition-colors hover:bg-stone-100"
          aria-label="Open navigation menu"
          aria-controls="primary-navigation-menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <dialog
        ref={menuRef}
        id="primary-navigation-menu"
        aria-label="Navigation menu"
        className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-[min(20rem,calc(100vw-2.5rem))] border-0 bg-transparent p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40"
        onClose={() => setMobileOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setMobileOpen(false);
        }}
      >
        <div className="flex h-full flex-col bg-[#fdfbf7] px-5 pb-5 pt-4">
          <div className="mb-5 flex items-center justify-between border-b border-stone-200 pb-4">
            <span className="font-display text-lg font-bold">Menu</span>
            <button
              type="button"
              className="rounded-lg p-2 text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
              aria-label="Close navigation menu"
              onClick={() => setMobileOpen(false)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Primary">
            {activeNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                    isActive ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100 hover:text-stone-900",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {loading ? null : user ? (
            <div className="mt-auto border-t border-stone-200 pt-4">
              <p className="mb-2 truncate px-3 text-sm text-stone-500">{user.email}</p>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-3 text-left text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
                onClick={async () => {
                  await signOut();
                  setMobileOpen(false);
                  navigate("/");
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="mt-auto border-t border-stone-200 pt-4">
              <Button
                className="w-full"
                onClick={() => {
                  setMobileOpen(false);
                  navigate("/login");
                }}
              >
                Sign in
              </Button>
            </div>
          )}
        </div>
      </dialog>
    </header>
  );
}
