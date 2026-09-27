import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const publicNavItems = [
  { to: "/", label: "Home", end: true },
  { to: "/demos", label: "Live Demos" },
  { to: "/tiles", label: "Tile Catalog" },
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

  const activeNavItems = user ? authNavItems : publicNavItems;

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2.5 font-display text-xl tracking-tight text-stone-900" onClick={() => setMobileOpen(false)}>
          <span className="grid h-8 w-8 grid-cols-2 gap-0.5 rounded-lg bg-stone-900 p-1.5 shadow-sm" aria-hidden="true">
            <span className="rounded-[2px] bg-clay-300" /><span className="rounded-[2px] bg-clay-500" />
            <span className="rounded-[2px] bg-clay-500" /><span className="rounded-[2px] bg-clay-300" />
          </span>
          <div className="flex flex-col">
            <span className="font-display text-lg font-semibold leading-none text-stone-950">TileTry</span>
            <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-clay-600">Virtual Trial Room</span>
          </div>
        </NavLink>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
          {activeNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="navActivePill"
                      className="absolute inset-0 rounded-lg bg-stone-900"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {loading ? null : user ? (
            <>
              <span className="hidden text-sm text-stone-500 sm:inline">{user.email}</span>
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/login")}>
              Sign in
            </Button>
          )}

          <button
            type="button"
            className="rounded-lg p-2 text-stone-700 hover:bg-stone-100 sm:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {mobileOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="border-t border-stone-200 bg-stone-50 sm:hidden" aria-label="Primary mobile">
          <div className="container-page flex flex-col gap-1 py-3">
            {activeNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium",
                    isActive ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}

            {loading ? null : user ? (
              <button
                type="button"
                className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-stone-700 hover:bg-stone-100"
                onClick={async () => {
                  await signOut();
                  setMobileOpen(false);
                  navigate("/");
                }}
              >
                Sign out ({user.email})
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-stone-700 hover:bg-stone-100"
                onClick={() => {
                  setMobileOpen(false);
                  navigate("/login");
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
