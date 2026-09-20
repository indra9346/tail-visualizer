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
import { ResultPage } from "@/pages/ResultPage";

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
                <Route path="/tiles" element={<TileCatalogPage />} />
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
