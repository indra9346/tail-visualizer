import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { SDSLogo } from "@/components/ui/SDSLogo";
import { cn } from "@/lib/cn";
import { publicNavItems, authNavItems } from "@/lib/navItems";

export function Navbar() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeNavItems = user ? authNavItems : publicNavItems;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#fdfbf7]/90 backdrop-blur-md lg:hidden">
      <div className="container-page flex h-16 items-center justify-between">
        <NavLink to="/" className="flex items-center py-1 group" onClick={() => setMobileOpen(false)}>
          <SDSLogo size="md" variant="dark" />
        </NavLink>

        <button
          type="button"
          className="group flex items-center gap-2 rounded-xl border border-stone-200/90 bg-white/80 px-3.5 py-2 text-stone-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-stone-300 hover:bg-stone-50 hover:text-stone-950 hover:shadow active:scale-95"
          aria-label="Open navigation menu"
          aria-controls="primary-navigation-menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <span className="text-xs font-semibold tracking-wide text-stone-700 group-hover:text-stone-950">
            Menu
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className="transition-transform duration-200 group-hover:scale-110"
          >
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {mobileOpen && (
              <div className="fixed inset-0 z-50 flex justify-end">
                {/* Backdrop with blur */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="fixed inset-0 bg-stone-950/40 backdrop-blur-sm"
                  onClick={() => setMobileOpen(false)}
                  aria-hidden="true"
                />

                {/* Animated Drawer */}
                <motion.aside
                  id="primary-navigation-menu"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation menu"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 320 }}
                  className="relative z-10 flex h-full w-[min(21rem,calc(100vw-2rem))] flex-col border-l border-stone-200/90 bg-[#fefdfb] shadow-2xl"
                >
                  {/* Drawer Header */}
                  <div className="flex items-center justify-between border-b border-stone-200/80 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-900 text-clay-400 shadow-sm">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M4 7h16M4 12h16M4 17h16" />
                        </svg>
                      </div>
                      <div>
                        <span className="font-display text-lg font-bold text-stone-950 block leading-tight">Menu</span>
                        <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-clay-700">Studio Navigation</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full p-2 text-stone-500 transition-all duration-200 hover:bg-stone-100 hover:text-stone-950 hover:rotate-90 active:scale-90"
                      aria-label="Close navigation menu"
                      onClick={() => setMobileOpen(false)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Nav Links with Staggered Entrance */}
                  <motion.nav
                    className="flex flex-col gap-1.5 overflow-y-auto px-4 py-3 flex-1"
                    aria-label="Primary"
                    initial="closed"
                    animate="open"
                    variants={{
                      open: {
                        transition: {
                          staggerChildren: 0.035,
                          delayChildren: 0.04,
                        },
                      },
                      closed: {
                        transition: {
                          staggerChildren: 0.02,
                          staggerDirection: -1,
                        },
                      },
                    }}
                  >
                    {activeNavItems.map((item, idx) => (
                      <motion.div
                        key={item.to}
                        variants={{
                          open: { opacity: 1, x: 0 },
                          closed: { opacity: 0, x: 16 },
                        }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        <NavLink
                          to={item.to}
                          end={item.end}
                          data-nav-item={item.label.toLowerCase().replace(/\s+/g, "-")}
                          onClick={() => setMobileOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              "group relative flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium transition-all duration-200",
                              isActive
                                ? "bg-stone-900 text-white shadow-md shadow-stone-900/20"
                                : "text-stone-700 hover:bg-stone-100 hover:text-stone-950 active:scale-[0.99]",
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <div
                                className={cn(
                                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ease-out",
                                  isActive
                                    ? "bg-stone-800 text-clay-400 ring-1 ring-white/10 shadow-sm"
                                    : "bg-stone-100 text-stone-500 group-hover:bg-clay-100 group-hover:text-clay-800 group-hover:scale-105 group-hover:shadow-sm",
                                )}
                              >
                                {item.icon}
                              </div>
                              <span
                                className={cn(
                                  "tracking-tight transition-transform duration-200",
                                  !isActive && "group-hover:translate-x-0.5",
                                )}
                              >
                                {item.label}
                              </span>

                              {isActive ? (
                                <span className="ml-auto flex h-2 w-2 rounded-full bg-clay-400 shadow-[0_0_8px_rgba(212,184,146,0.9)] animate-pulse" />
                              ) : (
                                <svg
                                  className="ml-auto h-4 w-4 opacity-0 -translate-x-1.5 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 text-stone-400 group-hover:text-clay-600"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              )}
                            </>
                          )}
                        </NavLink>
                      </motion.div>
                    ))}
                  </motion.nav>

                  {/* Drawer Footer User Card */}
                  {loading ? null : user ? (
                    <div className="mt-auto border-t border-stone-200/80 bg-stone-50/70 p-4">
                      <div className="mb-3 flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-stone-200/70">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-clay-400 to-clay-600 text-sm font-bold text-white shadow-sm ring-2 ring-clay-200/60">
                          {user.email ? user.email.charAt(0).toUpperCase() : "U"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-stone-900">{user.email}</p>
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-clay-700 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Studio Member
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="group flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-xs font-semibold text-stone-700 shadow-sm transition-all duration-200 hover:border-red-200 hover:bg-red-50/70 hover:text-red-700 active:scale-95"
                        onClick={async () => {
                          await signOut();
                          setMobileOpen(false);
                          navigate("/");
                        }}
                      >
                        <svg
                          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="mt-auto border-t border-stone-200/80 bg-stone-50/70 p-4">
                      <Button
                        className="w-full justify-center gap-2 shadow-sm"
                        onClick={() => {
                          setMobileOpen(false);
                          navigate("/login");
                        }}
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                          <polyline points="10 17 15 12 10 7" />
                          <line x1="15" y1="12" x2="3" y2="12" />
                        </svg>
                        Sign in
                      </Button>
                      <Button
                        variant="secondary"
                        className="mt-2 w-full justify-center"
                        onClick={() => {
                          setMobileOpen(false);
                          navigate("/login?mode=signup");
                        }}
                      >
                        Create a free account
                      </Button>
                    </div>
                  )}
                </motion.aside>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </header>
  );
}
