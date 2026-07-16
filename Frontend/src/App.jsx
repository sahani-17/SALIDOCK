import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Docking from "./pages/Docking";
import Results from "./pages/Results";
import Cavity from "./pages/Cavity";
import Active from "./pages/Active";
import Dock from "./pages/Dock";
import About from "./pages/About";
import Documentation from "./pages/Documentation";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Feedback from "./pages/Feedback";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
          <Route path="/docking" element={<Docking />} />
          <Route path="/results" element={<Results />} />
          <Route
            path="/feedback"
            element={
              <ProtectedRoute>
                <Feedback />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cavity"
            element={
              <ProtectedRoute>
                <Cavity />
              </ProtectedRoute>
            }
          />
          <Route
            path="/active"
            element={
              <ProtectedRoute>
                <Active />
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
