import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Docking from "./pages/Docking";
import Results from "./pages/Results";
import Cavity from "./pages/Cavity";
import Active from "./pages/Active";
import About from "./pages/About";
import NotFound from "./pages/NotFound";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/docking" element={<Docking />} />
        <Route path="/results" element={<Results />} />
        <Route path="/cavity" element={<Cavity />} />
        <Route path="/active" element={<Active />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster
        position="bottom-right"
        richColors
        toastOptions={{
          style: {
            background: "hsl(150 8% 10%)",
            border: "1px solid hsl(160 84% 39% / 0.15)",
            color: "hsl(150 5% 85%)",
            fontFamily: "'Inter', sans-serif",
          },
        }}
      />
    </BrowserRouter>
  );
}

export default App;
