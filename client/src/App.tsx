import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { Navbar } from "@/components/layout/Navbar";
import { ConfigWarningBanner } from "@/components/layout/ConfigWarningBanner";
import { Footer } from "@/components/layout/Footer";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { SmokeEffect } from "@/components/ui/SmokeEffect";
import { LandingPage } from "@/pages/LandingPage";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Skeleton } from "@/components/ui/Skeleton";

const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage })));
const UploadPage = lazy(() => import("@/pages/UploadPage").then((m) => ({ default: m.UploadPage })));
const AnalysisPage = lazy(() => import("@/pages/AnalysisPage").then((m) => ({ default: m.AnalysisPage })));
const TilesPage = lazy(() => import("@/pages/TilesPage").then((m) => ({ default: m.TilesPage })));
const TileCatalogPage = lazy(() => import("@/pages/TileCatalogPage").then((m) => ({ default: m.TileCatalogPage })));
const MyTilesPage = lazy(() => import("@/pages/MyTilesPage").then((m) => ({ default: m.MyTilesPage })));
const ResultPage = lazy(() => import("@/pages/ResultPage").then((m) => ({ default: m.ResultPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const CreditsPage = lazy(() => import("@/pages/CreditsPage").then((m) => ({ default: m.CreditsPage })));
const PaymentsPage = lazy(() => import("@/pages/PaymentsPage").then((m) => ({ default: m.PaymentsPage })));
const MyVisualizationsPage = lazy(() => import("@/pages/MyVisualizationsPage").then((m) => ({ default: m.MyVisualizationsPage })));
const AdminPage = lazy(() => import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const CalculatorPage = lazy(() => import("@/pages/CalculatorPage").then((m) => ({ default: m.CalculatorPage })));
const DemosPage = lazy(() => import("@/pages/DemosPage").then((m) => ({ default: m.DemosPage })));

function PageFallback() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-16" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkflowProvider>
        <BrowserRouter>
          <div className="flex min-h-screen flex-col relative">
            <ConfigWarningBanner />
            <Navbar />
            <div className="flex-1 relative z-10">
              <ErrorBoundary>
              <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/demos" element={<DemosPage />} />
                <Route path="/calculator" element={<CalculatorPage />} />
                <Route path="/login" element={<LoginPage />} />
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
        </BrowserRouter>
      </WorkflowProvider>
    </AuthProvider>
  );
}
