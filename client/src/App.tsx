import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { WorkflowProvider } from "@/context/WorkflowContext";
import { Navbar } from "@/components/layout/Navbar";
import { ConfigWarningBanner } from "@/components/layout/ConfigWarningBanner";
import { Footer } from "@/components/layout/Footer";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { UploadPage } from "@/pages/UploadPage";
import { AnalysisPage } from "@/pages/AnalysisPage";
import { TilesPage } from "@/pages/TilesPage";
import { TileCatalogPage } from "@/pages/TileCatalogPage";
import { MyTilesPage } from "@/pages/MyTilesPage";
import { ResultPage } from "@/pages/ResultPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CreditsPage } from "@/pages/CreditsPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { MyVisualizationsPage } from "@/pages/MyVisualizationsPage";

export default function App() {
  return (
    <AuthProvider>
      <WorkflowProvider>
        <BrowserRouter>
          <div className="flex min-h-screen flex-col">
            <ConfigWarningBanner />
            <Navbar />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/tiles" element={<ProtectedRoute><TileCatalogPage /></ProtectedRoute>} />
                <Route path="/my-tiles" element={<ProtectedRoute><MyTilesPage /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/credits" element={<ProtectedRoute><CreditsPage /></ProtectedRoute>} />
                <Route path="/payments" element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
                <Route path="/my-visualizations" element={<ProtectedRoute><MyVisualizationsPage /></ProtectedRoute>} />
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
                <Route
                  path="/result/:visualizationId"
                  element={
                    <ProtectedRoute>
                      <ResultPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </div>
            <Footer />
          </div>
        </BrowserRouter>
      </WorkflowProvider>
    </AuthProvider>
  );
}
