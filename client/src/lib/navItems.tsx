export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  icon: React.ReactNode;
}

const iconClass = "h-5 w-5 transition-transform duration-300 ease-out";

export const HomeIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:-translate-y-0.5`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

export const DemosIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:rotate-12`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
  </svg>
);

export const DashboardIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const VisualizeIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:rotate-6`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 9V5a2 2 0 0 1 2-2h4M16 3h4a2 2 0 0 1 2 2v4M22 15v4a2 2 0 0 1-2 2h-4M8 21H4a2 2 0 0 1-2-2v-4" />
    <circle cx="12" cy="12" r="3.5" />
  </svg>
);

export const CatalogIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:-rotate-6`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

export const MyTilesIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:-translate-y-0.5`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
    <path d="m22 12.5-9.17 4.16a2 2 0 0 1-1.66 0L2 12.5" />
    <path d="m22 17.5-9.17 4.16a2 2 0 0 1-1.66 0L2 17.5" />
  </svg>
);

export const DesignsIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:rotate-6`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

export const CreditsIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:rotate-12`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v12M15 9.5a3.5 3.5 0 0 0-5 0c0 2 2 2.5 4 3s1 2.5 0 3.5a3.5 3.5 0 0 1-5-1" />
  </svg>
);

export const CalculatorIcon = () => (
  <svg className={`${iconClass} group-hover:scale-115 group-hover:rotate-6`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4" />
  </svg>
);

export const publicNavItems: NavItem[] = [
  { to: "/", label: "Home", end: true, icon: <HomeIcon /> },
  { to: "/demos", label: "Demos", icon: <DemosIcon /> },
  { to: "/tiles", label: "Catalog", icon: <CatalogIcon /> },
  { to: "/my-visualizations", label: "Designs", icon: <DesignsIcon /> },
  { to: "/calculator", label: "Calculator", icon: <CalculatorIcon /> },
];

export const authNavItems: NavItem[] = [
  { to: "/", label: "Home", end: true, icon: <HomeIcon /> },
  { to: "/demos", label: "Demos", icon: <DemosIcon /> },
  { to: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { to: "/projects", label: "Visualize", icon: <VisualizeIcon /> },
  { to: "/tiles", label: "Catalog", icon: <CatalogIcon /> },
  { to: "/my-tiles", label: "My Tiles", icon: <MyTilesIcon /> },
  { to: "/my-visualizations", label: "History", icon: <DesignsIcon /> },
  { to: "/calculator", label: "Calculator", icon: <CalculatorIcon /> },
  { to: "/credits", label: "Credits", icon: <CreditsIcon /> },
];
