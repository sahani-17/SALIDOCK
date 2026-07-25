import React from "react";
import { useAuth } from "../context/AuthContext";
import { AnimatedCircularProgressBar } from "./ui/animated-circular-progress-bar";

const ProtectedRoute = ({ children }) => {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="flex items-center gap-3 bg-card border border-border px-5 py-3.5 rounded-2xl shadow-elevated">
          <AnimatedCircularProgressBar size={22} strokeWidth={3} />
          <span className="text-xs font-semibold text-foreground">Initializing session…</span>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
