import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Results from "./pages/Results";
import Dock from "./pages/Dock";
import BatchDock from "./pages/BatchDock";
import BatchResults from "./pages/BatchResults";
import About from "./pages/About";
import Documentation from "./pages/Documentation";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Feedback from "./pages/Feedback";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

function CanonicalManager() {
  const location = useLocation();

  useEffect(() => {
    const origin = "https://salidock-v2.salixirax.com";
    const canonicalUrl = `${origin}${location.pathname === "/" ? "/" : location.pathname}`;
    let link = document.querySelector("link[rel='canonical']");
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonicalUrl);
  }, [location.pathname]);

  return null;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CanonicalManager />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/dock"
            element={
              <ProtectedRoute>
                <Dock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/batch-dock"
            element={
              <ProtectedRoute>
                <BatchDock />
              </ProtectedRoute>
            }
          />
          {/* Legacy redirect routes */}
          <Route path="/docking" element={<Navigate to="/dock" replace />} />
          <Route path="/active" element={<Navigate to="/dock?mode=active" replace />} />
          <Route
            path="/results"
            element={
              <ProtectedRoute>
                <Results />
              </ProtectedRoute>
            }
          />
          <Route
            path="/batch-results"
            element={
              <ProtectedRoute>
                <BatchResults />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feedback"
            element={
              <ProtectedRoute>
                <Feedback />
              </ProtectedRoute>
            }
          />
          <Route path="/about" element={<About />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: {
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--foreground))",
              fontFamily: "'Inter', sans-serif",
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
