import { lazy, Suspense, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { PromoBanner } from "@/components/layout/PromoBanner";
import { DoorReveal } from "@/components/layout/DoorReveal";
import { RoomTransitionProvider } from "@/components/layout/RoomTransition";
import { ConfigWarningBanner } from "@/components/layout/ConfigWarningBanner";
import { Footer } from "@/components/layout/Footer";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { SmokeEffect } from "@/components/ui/SmokeEffect";
import { LandingPage } from "@/pages/LandingPage";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Skeleton } from "@/components/ui/Skeleton";
import { AppRail, AppTabs, showsTabs } from "@/components/simple/AppNav";
import { cn } from "@/lib/cn";

const RELOAD_KEY = "sds_chunk_reload";

/**
 * Pages load on demand. After a new deploy an open tab still asks for the OLD page files, which no longer exist, so
 * the import fails: reload once to get the new version (never in a loop: at most one reload per 30 seconds).
 */
function loadPage<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((err: unknown) => {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
      } catch {
        /* storage unavailable: fall through to the error screen */
      }
      if (Date.now() - last > 30_000) {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
        window.location.reload();
        return new Promise<T>(() => {});
      }
      throw err;
    });
}

const LoginPage = lazy(loadPage(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage }))));
const ResetPasswordPage = lazy(loadPage(() => import("@/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))));
const ProjectsPage = lazy(loadPage(() => import("@/pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage }))));
const QuickUploadPage = lazy(loadPage(() => import("@/pages/QuickUploadPage").then((m) => ({ default: m.QuickUploadPage }))));
const QuickDesignPage = lazy(loadPage(() => import("@/pages/QuickDesignPage").then((m) => ({ default: m.QuickDesignPage }))));
const AnalysisPage = lazy(loadPage(() => import("@/pages/AnalysisPage").then((m) => ({ default: m.AnalysisPage }))));
const TilesPage = lazy(loadPage(() => import("@/pages/TilesPage").then((m) => ({ default: m.TilesPage }))));
const TileCatalogPage = lazy(loadPage(() => import("@/pages/TileCatalogPage").then((m) => ({ default: m.TileCatalogPage }))));
const ResultPage = lazy(loadPage(() => import("@/pages/ResultPage").then((m) => ({ default: m.ResultPage }))));
const DashboardPage = lazy(loadPage(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))));
const CreditsPage = lazy(loadPage(() => import("@/pages/CreditsPage").then((m) => ({ default: m.CreditsPage }))));
const PaymentsPage = lazy(loadPage(() => import("@/pages/PaymentsPage").then((m) => ({ default: m.PaymentsPage }))));
const MyVisualizationsPage = lazy(loadPage(() => import("@/pages/MyVisualizationsPage").then((m) => ({ default: m.MyVisualizationsPage }))));
const AdminPage = lazy(loadPage(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage }))));
const CalculatorPage = lazy(loadPage(() => import("@/pages/CalculatorPage").then((m) => ({ default: m.CalculatorPage }))));
const DemosPage = lazy(loadPage(() => import("@/pages/DemosPage").then((m) => ({ default: m.DemosPage }))));
const HomePage = lazy(loadPage(() => import("@/pages/HomePage").then((m) => ({ default: m.HomePage }))));
const CustomersPage = lazy(loadPage(() => import("@/pages/CustomersPage").then((m) => ({ default: m.CustomersPage }))));
const CustomerPage = lazy(loadPage(() => import("@/pages/CustomerPage").then((m) => ({ default: m.CustomerPage }))));
const ShowroomTilesPage = lazy(loadPage(() => import("@/pages/ShowroomTilesPage").then((m) => ({ default: m.ShowroomTilesPage }))));
const AddTilePage = lazy(loadPage(() => import("@/pages/AddTilePage").then((m) => ({ default: m.AddTilePage }))));
const MorePage = lazy(loadPage(() => import("@/pages/MorePage").then((m) => ({ default: m.MorePage }))));
const ComparePage = lazy(loadPage(() => import("@/pages/ComparePage").then((m) => ({ default: m.ComparePage }))));
const QuotePage = lazy(loadPage(() => import("@/pages/QuotePage").then((m) => ({ default: m.QuotePage }))));

const SPLASH_KEY = "sds_splash_shown";

type IntroPhase = "splash" | "promo" | "doorReveal" | "done";

function PageFallback() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-16" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

const P = ({ children }: { children: ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

/** Every address of the app. Signed-in owners get the simple app; visitors get the public site. */
function AppRoutes({ signedIn }: { signedIn: boolean }) {
  return (
    <Routes>
      <Route path="/" element={signedIn ? <HomePage /> : <LandingPage />} />
      <Route path="/demos" element={<DemosPage />} />
      <Route path="/calculator" element={<CalculatorPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* The simple app */}
      <Route path="/customers" element={<P><CustomersPage /></P>} />
      <Route path="/customers/:projectId" element={<P><CustomerPage /></P>} />
      <Route path="/tiles" element={<P><ShowroomTilesPage /></P>} />
      <Route path="/add-tile" element={<P><AddTilePage /></P>} />
      <Route path="/more" element={<P><MorePage /></P>} />
      <Route path="/compare/:roomId" element={<P><ComparePage /></P>} />
      <Route path="/quote" element={<P><QuotePage /></P>} />
      <Route path="/upload" element={<P><QuickUploadPage /></P>} />
      {/* The easy visualizer: mark the photo, pick tiles, make the real photo. */}
      <Route path="/visualize/:roomId" element={<P><QuickDesignPage /></P>} />
      <Route path="/credits" element={<P><CreditsPage /></P>} />
      {/* Older pages, still reachable from More and from old links. */}
      <Route path="/projects" element={<Navigate to="/customers" replace />} />
      <Route path="/my-tiles" element={<Navigate to="/tiles" replace />} />
      <Route path="/catalog" element={<P><TileCatalogPage /></P>} />
      <Route path="/dashboard" element={<P><DashboardPage /></P>} />
      <Route path="/payments" element={<P><PaymentsPage /></P>} />
      <Route path="/my-visualizations" element={<MyVisualizationsPage />} />
      <Route path="/admin" element={<P><AdminPage /></P>} />
      <Route path="/analysis/:roomId" element={<P><AnalysisPage /></P>} />
      <Route path="/tiles/:roomId" element={<P><TilesPage /></P>} />
      {/* Unprotected: the API itself decides access (owner, or anonymous
          if the visualization was made public) — see vizGet.ts. */}
      <Route path="/result/:visualizationId" element={<ResultPage />} />
    </Routes>
  );
}

function AppShell() {
  const location = useLocation();
  const { user, loading } = useAuth();
  // The intro plays on the public home page only: a shared result link, an email link or a signed-in owner opens straight away.
  const [introPhase, setIntroPhase] = useState<IntroPhase>(() => {
    if (location.pathname !== "/") return "done";
    try {
      return sessionStorage.getItem(SPLASH_KEY) === "1" ? "done" : "splash";
    } catch {
      return "splash";
    }
  });

  const finishIntro = () => {
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }
    setIntroPhase("done");
  };

  const routes = (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageFallback />}>
        <AppRoutes signedIn={Boolean(user)} />
      </Suspense>
    </ErrorBoundary>
  );

  if (loading) return <PageFallback />;

  // The simple app for a signed-in owner: no intro, 4 tabs at the bottom (phone) or down the side (laptop).
  if (user) {
    const tabs = showsTabs(location.pathname);
    return (
      <div className="relative flex min-h-screen">
        <AppRail />
        {/* min-w-0: a flex item may otherwise never shrink below its widest content, so one wide table or grid
            made the whole page wider than a phone screen. */}
        <div className={cn("relative flex min-h-screen min-w-0 flex-1 flex-col", tabs && "pb-28 lg:pb-0")}>
          <ConfigWarningBanner />
          <div className="relative z-10 flex-1">{routes}</div>
        </div>
        {tabs && <AppTabs />}
      </div>
    );
  }

  return (
    <RoomTransitionProvider>
      {introPhase === "splash" && <SplashScreen onFinish={() => setIntroPhase("promo")} />}
      {introPhase === "promo" && <PromoBanner onFinish={() => setIntroPhase("doorReveal")} />}
      {introPhase === "doorReveal" && <DoorReveal onComplete={finishIntro} />}
      <div className="flex min-h-screen relative">
        <Sidebar />
        {/* min-w-0: a flex item may otherwise never shrink below its widest content, so one wide table or grid
            (Credits, Payments, Admin, the Design Studio) made the whole page wider than a phone screen. */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col relative">
          <ConfigWarningBanner />
          <Navbar />
          <div className="flex-1 relative z-10">{routes}</div>
          <Footer />
          <SmokeEffect />
        </div>
      </div>
    </RoomTransitionProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkflowProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </WorkflowProvider>
    </AuthProvider>
  );
}
