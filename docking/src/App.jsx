import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Docking from "./pages/Docking";
import Results from "./pages/Results";
import Cavity from "./pages/Cavity";
import Active from "./pages/Active";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/docking" element={<Docking />} />
        <Route path="/results" element={<Results />} />
        <Route path="/cavity" element={<Cavity />} />
        <Route path="/active" element={<Active />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
