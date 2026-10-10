import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { SDSIcon } from "@/components/ui/SDSLogo";
import { DoorNavLink } from "@/components/layout/DoorNavLink";
import { cn } from "@/lib/cn";
import { publicNavItems, authNavItems } from "@/lib/navItems";

const COLLAPSE_KEY = "sds_sidebar_collapsed";

/**
 * Persistent left navigation rail in the style of Gemini / Google AI Studio:
 * icon-only by default, expands to show labels, pinned open state remembered
 * locally. Only rendered at lg+ — smaller screens keep the Navbar drawer.
 */
export function Sidebar() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const items = user ? authNavItems : publicNavItems;

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 76 : 240 }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
      className="hidden lg:sticky lg:top-0 lg:z-20 lg:flex lg:h-screen lg:shrink-0 lg:flex-col lg:border-r lg:border-hairline lg:bg-surface-card"
    >
      <div className="flex items-center gap-2.5 px-4 py-5">
        <DoorNavLink to="/" roomLabel="HOME" className="flex shrink-0 items-center" aria-label="SDS Tiles home">
          <SDSIcon className="h-9 w-9" />
        </DoorNavLink>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="min-w-0 leading-none"
          >
            <p className="truncate font-display text-sm font-bold text-ink">SDS Tiles</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-sage-600">
              Virtual Trial Room
            </p>
          </motion.div>
        )}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 py-2">
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.to}>
              <DoorNavLink
                to={item.to}
                end={item.end}
                roomLabel={item.label.toUpperCase()}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-500",
                    collapsed && "justify-center",
                    isActive
                      ? "bg-surface-sage text-sage-800"
                      : "text-ink-secondary hover:bg-surface-sage/60 hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center",
                        isActive ? "text-sage-700" : "text-ink-secondary/80 group-hover:text-sage-700",
                      )}
                    >
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <span className={cn("truncate tracking-tight", isActive && "font-semibold")}>{item.label}</span>
                    )}
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-champagne-500"
                        transition={{ type: "spring", damping: 24, stiffness: 300 }}
                      />
                    )}
                  </>
                )}
              </DoorNavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-hairline p-2.5">
        {!loading && user && (
          <button
            type="button"
            title={collapsed ? "Sign out" : undefined}
            className={cn(
              "mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-sage/60 hover:text-ink",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-500",
              collapsed && "justify-center",
            )}
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-champagne-400 to-champagne-600 text-[11px] font-bold text-white">
              {user.email ? user.email.charAt(0).toUpperCase() : "U"}
            </span>
            {!collapsed && <span className="truncate">Sign out</span>}
          </button>
        )}
        {!loading && !user && (
          <button
            type="button"
            title={collapsed ? "Sign in" : undefined}
            className={cn(
              "mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-sage/60 hover:text-ink",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-500",
              collapsed && "justify-center",
            )}
            onClick={() => navigate("/login")}
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            {!collapsed && <span className="truncate">Sign in</span>}
          </button>
        )}

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-sage/60 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne-500"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg
            className={cn("h-5 w-5 shrink-0 transition-transform duration-300", collapsed && "rotate-180")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
          </svg>
          {!collapsed && <span className="truncate">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
