import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

interface Tab {
  to: string;
  label: string;
  icon: IconName;
  /** Other addresses that belong to this tab. */
  also?: RegExp;
}

const TABS: Tab[] = [
  { to: "/", label: "Home", icon: "home", also: /^\/(dashboard)?$/ },
  { to: "/customers", label: "Customers", icon: "users", also: /^\/(customers|projects|my-visualizations)/ },
  { to: "/tiles", label: "Tiles", icon: "tiles", also: /^\/(tiles$|my-tiles|add-tile)/ },
  { to: "/more", label: "More", icon: "menu", also: /^\/(more|credits|payments|calculator|demos|admin)/ },
];

const isOn = (tab: Tab, path: string) => (tab.also ? tab.also.test(path) : path === tab.to);

/** Pages that are one step of a job (a new design, a result, a form) show their own Back and big button, not the tabs. */
export function showsTabs(path: string): boolean {
  return !/^\/(upload|visualize\/|result\/|compare\/|quote|add-tile|credits|tiles\/[^/]+|analysis\/|login|reset-password)/.test(path);
}

/** Phone and tablet: 4 tabs at the bottom and the big camera in the middle that starts a new design. */
export function AppTabs() {
  const { pathname } = useLocation();
  const [home, customers, tiles, more] = TABS as [Tab, Tab, Tab, Tab];
  return (
    <nav aria-label="Main menu" className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex h-[78px] max-w-xl items-start pt-1.5">
        <TabLink tab={home} on={isOn(home, pathname)} />
        <TabLink tab={customers} on={isOn(customers, pathname)} />
        <NavLink to="/upload" className="-mt-7 flex flex-1 flex-col items-center gap-0.5 text-xs font-extrabold text-ink">
          <span className="flex h-16 w-16 items-center justify-center rounded-[20px] border-4 border-surface-app bg-stone-900 text-white shadow-[0_6px_16px_rgba(58,71,62,0.35)]">
            <Icon name="camera" className="h-7 w-7" />
          </span>
          New design
        </NavLink>
        <TabLink tab={tiles} on={isOn(tiles, pathname)} />
        <TabLink tab={more} on={isOn(more, pathname)} />
      </div>
    </nav>
  );
}

function TabLink({ tab, on }: { tab: Tab; on: boolean }) {
  return (
    <NavLink to={tab.to} aria-current={on ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 pt-1 text-xs", on ? "font-extrabold text-ink" : "font-semibold text-ink-secondary hover:text-ink")}>
      <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", on && "bg-sage-200")}>
        <Icon name={tab.icon} />
      </span>
      {tab.label}
    </NavLink>
  );
}

/** Laptop and showroom counter: the same places down the left side. */
export function AppRail() {
  const { pathname } = useLocation();
  const item = (tab: Tab) => {
    const on = isOn(tab, pathname);
    return (
      <NavLink key={tab.to} to={tab.to} aria-current={on ? "page" : undefined} className={cn("flex w-[84px] flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-xs font-bold", on ? "bg-sage-200 text-ink" : "text-ink-secondary hover:bg-sage-100 hover:text-ink")}>
        <Icon name={tab.icon} />
        {tab.label}
      </NavLink>
    );
  };
  const newOn = /^\/(upload|visualize\/)/.test(pathname);
  return (
    <aside className="sticky top-0 z-20 hidden h-screen w-[104px] shrink-0 flex-col items-center gap-1.5 border-r border-hairline bg-white px-2.5 py-5 lg:flex">
      <NavLink to="/" aria-label="SDS Tiles home" className="mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-stone-900 font-display text-base font-semibold text-champagne-400">
        SDS
      </NavLink>
      {item(TABS[0]!)}
      <NavLink to="/upload" className={cn("flex w-[84px] flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-xs font-bold", newOn ? "bg-stone-950 text-white" : "bg-stone-900 text-white hover:bg-stone-950")}>
        <Icon name="camera" />
        New design
      </NavLink>
      {TABS.slice(1).map(item)}
    </aside>
  );
}
