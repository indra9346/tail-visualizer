import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
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
const UploadPage = lazy(loadPage(() => import("@/pages/UploadPage").then((m) => ({ default: m.UploadPage }))));
const AnalysisPage = lazy(loadPage(() => import("@/pages/AnalysisPage").then((m) => ({ default: m.AnalysisPage }))));
const TilesPage = lazy(loadPage(() => import("@/pages/TilesPage").then((m) => ({ default: m.TilesPage }))));
const TileCatalogPage = lazy(loadPage(() => import("@/pages/TileCatalogPage").then((m) => ({ default: m.TileCatalogPage }))));
const MyTilesPage = lazy(loadPage(() => import("@/pages/MyTilesPage").then((m) => ({ default: m.MyTilesPage }))));
const ResultPage = lazy(loadPage(() => import("@/pages/ResultPage").then((m) => ({ default: m.ResultPage }))));
const DashboardPage = lazy(loadPage(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage }))));
const CreditsPage = lazy(loadPage(() => import("@/pages/CreditsPage").then((m) => ({ default: m.CreditsPage }))));
const PaymentsPage = lazy(loadPage(() => import("@/pages/PaymentsPage").then((m) => ({ default: m.PaymentsPage }))));
const MyVisualizationsPage = lazy(loadPage(() => import("@/pages/MyVisualizationsPage").then((m) => ({ default: m.MyVisualizationsPage }))));
const AdminPage = lazy(loadPage(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage }))));
const CalculatorPage = lazy(loadPage(() => import("@/pages/CalculatorPage").then((m) => ({ default: m.CalculatorPage }))));
const DemosPage = lazy(loadPage(() => import("@/pages/DemosPage").then((m) => ({ default: m.DemosPage }))));

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

function AppShell() {
  const location = useLocation();
  // The intro plays on the home page only: a shared result link or an email link opens straight away.
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
          <div className="flex-1 relative z-10">
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/demos" element={<DemosPage />} />
                  <Route path="/calculator" element={<CalculatorPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/tiles" element={<ProtectedRoute><TileCatalogPage /></ProtectedRoute>} />
                  <Route path="/my-tiles" element={<ProtectedRoute><MyTilesPage /></ProtectedRoute>} />
                  <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                  <Route path="/credits" element={<ProtectedRoute><CreditsPage /></ProtectedRoute>} />
                  <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
                  <Route path="/my-visualizations" element={<MyVisualizationsPage />} />
                  <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
                  <Route
                    path="/projects"
                    element={
                      <ProtectedRoute>
                        <ProjectsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/upload"
                    element={
                      <ProtectedRoute>
                        <UploadPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/analysis/:roomId"
                    element={
                      <ProtectedRoute>
                        <AnalysisPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/tiles/:roomId"
                    element={
                      <ProtectedRoute>
                        <TilesPage />
                      </ProtectedRoute>
                    }
                  />
                  {/* Unprotected: the API itself decides access (owner, or anonymous
                      if the visualization was made public) — see vizGet.ts. */}
                  <Route path="/result/:visualizationId" element={<ResultPage />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </div>
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
