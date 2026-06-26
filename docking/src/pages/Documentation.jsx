import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { BookOpen, Cpu, Grid, LayoutDashboard, Search, FileText, Zap, ChevronRight, Activity, Compass } from "lucide-react";

/* ─── Scroll Section Wrapper ─── */
const AnimatedSection = ({ children, className = "", delay = 0 }) => {
  const { ref, isVisible } = useScrollAnimation(0.1);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(30px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

/* ─── 3D Tilt Card ─── */
const TiltCard = ({ children, className = "" }) => {
  const cardRef = useRef(null);
  const [transform, setTransform] = useState("");
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - y) * 10;
    const rotateY = (x - 0.5) * 10;
    setTransform(`perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015,1.015,1.015)`);
    setGlare({ x: x * 100, y: y * 100, opacity: 0.1 });
  };

  const handleMouseLeave = () => {
    setTransform("perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)");
    setGlare({ x: 50, y: 50, opacity: 0 });
  };

  return (
    <div
      ref={cardRef}
      className={`relative h-full ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform, transition: "transform 0.3s ease-out", transformStyle: "preserve-3d" }}
    >
      {children}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, hsl(221 83% 53% / ${glare.opacity}), transparent 60%)`,
          transition: "opacity 0.3s",
        }}
      />
    </div>
  );
};

/* ─── Cursor Glow Trail ─── */
const CursorGlow = () => {
  const glowRef = useRef(null);

  useEffect(() => {
    const handleMove = (e) => {
      if (glowRef.current) {
        glowRef.current.style.left = `${e.clientX}px`;
        glowRef.current.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <div
      ref={glowRef}
      className="fixed w-[350px] h-[350px] rounded-full pointer-events-none z-[9999] -translate-x-1/2 -translate-y-1/2 blur-[100px] transition-[left,top] duration-150 ease-out hidden md:block"
      style={{ background: "hsl(221 83% 53% / 0.05)" }}
    />
  );
};

const Documentation = () => {
  const sections = [
    { id: "docs-hero", label: "Overview", icon: BookOpen },
    { id: "auto-blind", label: "Auto-Blind Docking", icon: Cpu },
    { id: "active-site", label: "Active-Site Docking", icon: Grid },
    { id: "results", label: "Results & Exports", icon: LayoutDashboard },
  ];
  const [activeSection, setActiveSection] = useState("docs-hero");
  const [showDockingOptions, setShowDockingOptions] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -20% 0px", threshold: [0.1, 0.3, 0.5] },
    );

    sections.forEach((section) => {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    });

    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 50) {
        setActiveSection(sections[sections.length - 1].id);
      }
    };
    window.addEventListener("scroll", handleScroll);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToSection = (id) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Navbar lightTheme />

      <aside className="hidden xl:flex fixed left-0 top-0 h-screen w-64 flex-col justify-between bg-white z-40 pt-24 border-r border-slate-100/50">
        <div className="w-full mt-6 pl-2">
          <h3 className="text-[10px] font-bold tracking-widest text-[#94a3b8] uppercase mb-4 pl-6">
            ON THIS PAGE
          </h3>
          <nav className="flex flex-col gap-1">
            {sections.map((s) => {
              const Icon = s.icon;
              const isActive = activeSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`relative flex items-center gap-4 w-full pl-6 py-4 text-[13px] font-bold uppercase tracking-wider transition-colors ${
                    isActive 
                    ? "text-[#38bdf8] bg-slate-50/80" 
                    : "text-[#8BA1BA] hover:text-slate-600 hover:bg-slate-50/50"
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#38bdf8]" />
                  )}
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-[#38bdf8]" : "text-[#8BA1BA]"} />
                  <span className="text-left">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="w-full p-6 mt-auto border-t border-slate-100/50 bg-slate-50/30">
          <button
            type="button"
            onClick={() => setShowDockingOptions((prev) => !prev)}
            className="inline-flex w-full items-center justify-center rounded-lg bg-[#0ea5e9] px-4 py-3 text-[13px] font-bold tracking-widest uppercase text-white hover:bg-[#0284c7] transition-colors shadow-lg shadow-[#0ea5e9]/30"
          >
            Start Docking
          </button>

          {showDockingOptions && (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col">
              <Link
                to="/cavity"
                onClick={() => setShowDockingOptions(false)}
                className="px-4 py-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0ea5e9] transition-colors border-b border-slate-100"
              >
                Auto-Blind Docking
              </Link>
              <Link
                to="/active"
                onClick={() => setShowDockingOptions(false)}
                className="px-4 py-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0ea5e9] transition-colors"
              >
                Active-site Docking
              </Link>
            </div>
          )}
        </div>
      </aside>

      <div className="xl:pl-64">

      {/* ─── HERO: Documentation ─── */}
      <section id="docs-hero" className="relative pt-32 pb-16 overflow-hidden flex items-center">
        <div className="max-w-5xl mx-auto px-8 md:px-12 relative z-10 w-full">
          <AnimatedSection>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-[2px] bg-[#38bdf8]" />
              <span className="text-[11px] font-bold tracking-widest text-[#38bdf8] uppercase">
                MASTER VIRTUAL SCREENING
              </span>
            </div>
            <h1 className="text-4xl md:text-[46px] leading-[1.1] font-medium text-slate-800 mb-6 uppercase tracking-tight">
              OFFICIAL DOCUMENTATION
            </h1>
            <p className="text-slate-500 font-medium leading-[1.8] text-[15px] max-w-3xl">
              Discover how to harness Salidock's automated preparation, AI-driven cavity detection, and comprehensive analysis modules for medical-grade molecular dynamics.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* ─── SECTION: Auto Blind Docking & Cavity ─── */}
      <section id="auto-blind" className="pb-24 relative pt-12">
        <div className="max-w-5xl mx-auto px-8 md:px-12">
          
          <AnimatedSection className="mb-12">
             <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-sky-50 flex items-center justify-center">
                  <Compass className="w-8 h-8 text-[#0ea5e9]" strokeWidth={2} />
                </div>
                <div>
                   <h2 className="text-[16px] font-bold text-slate-700 tracking-wider mb-1 uppercase">Auto-Blind Docking</h2>
                   <div className="text-[11px] font-bold tracking-widest text-[#94a3b8] uppercase">
                     SYSTEM PROTOCOL 01 // AUTOMATED PREPARATION
                   </div>
                </div>
             </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-16 items-start">
            
            <AnimatedSection className="order-2 md:order-1 flex flex-col gap-10">
              <div className="text-slate-500 font-medium leading-[1.8] text-[15px]">
                Start discovery instantly. Upload an un-prepared target crystal structure (PDB) and your raw ligand file (SMILES, MOL2, SDF). Salidock manages the complicated backend conversion into AutoDock-compatible PDBQT formats entirely.
              </div>
              
              <div className="flex flex-col gap-6">
                {/* Card 1 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-slate-50/20">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
                  
                  <div className="flex items-center gap-3 mb-4">
                    <Activity className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                    <h4 className="text-[13px] font-bold text-[#38bdf8] uppercase tracking-wide">
                      AI-Driven Cavity Consensus
                    </h4>
                  </div>
                  <p className="text-[14px] text-slate-500 font-medium leading-[1.7]">
                    Leverage our state-of-the-art 3-method weighted consensus pipeline utilizing fpocket (geometry), P2Rank (machine learning), and VN-EGNN (neural network predictions) to identify probable binding sites with maximum confidence.
                  </p>
                </div>
                
                {/* Card 2 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-slate-50/20">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
                  
                  <div className="flex items-center gap-3 mb-4">
                    <Cpu className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                    <h4 className="text-[13px] font-bold text-[#38bdf8] uppercase tracking-wide">
                      Adaptive Engine Routing
                    </h4>
                  </div>
                  <p className="text-[14px] text-slate-500 font-medium leading-[1.7]">
                    Launch simultaneous docking instances across multiple predicted cavities. Docking uses the neural-network-driven GNINA engine for focused cavities (volume &le; 1000 Å³) and the high-efficiency QuickVina-W engine for larger blind volumes.
                  </p>
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={200} className="order-1 md:order-2 space-y-6">
              <TiltCard>
                <img src="/auto_blind_docking.png" alt="Auto Blind Docking Setup" className="rounded-xl border border-border shadow-2xl glass w-full" />
              </TiltCard>
              <TiltCard>
                <img src="/cavity detection.png" alt="AI Cavity Detection" className="rounded-xl border border-border shadow-2xl glass w-full" />
              </TiltCard>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ─── SECTION: Active Site Docking ─── */}
      <section id="active-site" className="pb-24 relative pt-12 border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-8 md:px-12">
          
          <AnimatedSection className="mb-12">
             <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-sky-50 flex items-center justify-center">
                  <Grid className="w-8 h-8 text-[#0ea5e9]" strokeWidth={2} />
                </div>
                <div>
                   <h2 className="text-[16px] font-bold text-slate-700 tracking-wider mb-1 uppercase">Active-Site Precision</h2>
                   <div className="text-[11px] font-bold tracking-widest text-[#94a3b8] uppercase">
                     SYSTEM PROTOCOL 02 // MANUAL TARGETING
                   </div>
                </div>
             </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-16 items-start">
            <AnimatedSection>
              <TiltCard>
                <img src="/grid.png" alt="Active Site Visual Grid Box" className="rounded-xl border border-border shadow-2xl glass w-full" />
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={200} className="flex flex-col gap-10">
              <div className="text-slate-500 font-medium leading-[1.8] text-[15px]">
                Have a specific binding pocket in mind? Fine-tune the search area with our interactive 3D Grid Box Viewer. Mol* visual fidelity combined with direct DOM coordinate mapping provides absolute certainty in targeted drug discovery.
              </div>
              
              <div className="flex flex-col gap-6">
                {/* Card 1 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-slate-50/20">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
                  
                  <div className="flex items-center gap-3 mb-4">
                    <Search className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                    <h4 className="text-[13px] font-bold text-[#38bdf8] uppercase tracking-wide">
                      Isolate Residues
                    </h4>
                  </div>
                  <p className="text-[14px] text-slate-500 font-medium leading-[1.7]">
                    Drag the Grid Box coordinates to surround specifically targeted protein residues crucial to catalytic function.
                  </p>
                </div>

                {/* Card 2 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-slate-50/20">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
                  
                  <div className="flex items-center gap-3 mb-4">
                    <Activity className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                    <h4 className="text-[13px] font-bold text-[#38bdf8] uppercase tracking-wide">
                      Optimal Target Routing
                    </h4>
                  </div>
                  <p className="text-[14px] text-slate-500 font-medium leading-[1.7]">
                    By adjusting the search box coordinates, the system dynamically routes docking to GNINA if the targeted grid volume is &le; 1000 Å³ for high-resolution CNN-affinity scoring, or QuickVina-W if it exceeds 1000 Å³.
                  </p>
                </div>

                {/* Card 3 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-slate-50/20">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
                  
                  <div className="flex items-center gap-3 mb-4">
                    <Grid className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                    <h4 className="text-[13px] font-bold text-[#38bdf8] uppercase tracking-wide">
                      Real-time Overlay
                    </h4>
                  </div>
                  <p className="text-[14px] text-slate-500 font-medium leading-[1.7]">
                    Visually verify grid inclusions via our custom translucent Mol* canvas overlay rendering.
                  </p>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ─── SECTION: Analyzing Results ─── */}
      <section id="results" className="py-24 relative">
        <div className="max-w-5xl mx-auto px-8 md:px-12">
          
          <AnimatedSection className="mb-12">
             <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-sky-50 flex items-center justify-center">
                  <LayoutDashboard className="w-8 h-8 text-[#0ea5e9]" strokeWidth={2} />
                </div>
                <div>
                   <h2 className="text-[16px] font-bold text-slate-700 tracking-wider mb-1 uppercase">Unprecedented Insight</h2>
                   <div className="text-[11px] font-bold tracking-widest text-[#94a3b8] uppercase">
                     SYSTEM PROTOCOL 03 // RESULT ANALYTICS
                   </div>
                </div>
             </div>
          </AnimatedSection>

          <AnimatedSection delay={100} className="mb-10">
              <div className="text-slate-500 font-medium leading-[1.8] text-[15px] max-w-3xl">
                Move from raw coordinates to publication-ready conclusions instantly using our visualization suite. Browse generated spatial conformations sorted seamlessly by thermodynamic binding affinity.
              </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            <AnimatedSection delay={100} className="h-full">
              <div className="relative p-1 border border-slate-200/80 rounded-sm bg-slate-50/20 h-full flex flex-col">
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <FileText className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                    <h4 className="text-[13px] font-bold text-[#38bdf8] uppercase tracking-wide">
                      3D Pose Browser
                    </h4>
                  </div>
                  <img src="/mol.png" alt="Compare Poses" className="rounded-lg shadow-sm border border-slate-200 mb-4 w-full" />
                  <p className="text-[14px] text-slate-500 font-medium leading-[1.7] mt-auto">Browse generated spatial conformations systematically and check the overall docking trajectory.</p>
                </div>
              </div>
            </AnimatedSection>
            
            <AnimatedSection delay={200} className="h-full">
              <div className="relative p-1 border border-slate-200/80 rounded-sm bg-slate-50/20 h-full flex flex-col">
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
                <div className="p-6 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <FileText className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                    <h4 className="text-[13px] font-bold text-[#38bdf8] uppercase tracking-wide">
                      Interaction Diagrams
                    </h4>
                  </div>
                  <img src="/2d_interaction.png" alt="2D Interaction Diagrams" className="rounded-lg shadow-sm border border-slate-200 mb-4 w-full" />
                  <p className="text-[14px] text-slate-500 font-medium leading-[1.7] mt-auto">Automatically-generated 2D interaction maps pinpointing hydrogen bonds and hydrophobic pockets.</p>
                </div>
              </div>
            </AnimatedSection>
          </div>

          <AnimatedSection delay={250}>
            <div className="relative p-8 md:p-10 border border-slate-200/80 rounded-sm bg-slate-50/20 mb-8 overflow-hidden">
              <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
              
              <div className="absolute -right-10 -top-10 opacity-[0.03]">
                <FileText size={150} />
              </div>

              <div className="flex items-center gap-3 mb-6">
                 <FileText className="w-5 h-5 text-[#38bdf8]" strokeWidth={2.5} />
                 <h4 className="text-[15px] font-bold text-[#38bdf8] uppercase tracking-wide">
                   Publication-Quality Exports
                 </h4>
              </div>
              <p className="text-[15px] text-slate-500 font-medium leading-[1.8] mb-8 max-w-3xl">
                Salidock provides direct high-resolution image rendering from both the 3D structural viewer and the 2D conceptual arrays, ensuring your reports are immediately presentation-ready without external editing.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-8">
                <div>
                  <h4 className="text-[12px] font-bold text-slate-700 uppercase tracking-widest mb-3">
                    3D Mol* Export
                  </h4>
                  <ul className="text-[13px] text-slate-500 font-medium space-y-3">
                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shrink-0 mt-1.5" />Navigate to any generated pose in the 3D Viewer.</li>
                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shrink-0 mt-1.5" />Adjust your camera angle, zoom, and clipping planes.</li>
                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shrink-0 mt-1.5" />Click the Download Icon in the viewer toolbar.</li>
                  </ul>
                </div>

                <div>
                  <h4 className="text-[12px] font-bold text-slate-700 uppercase tracking-widest mb-3">
                    2D Interaction Map Export
                  </h4>
                  <ul className="text-[13px] text-slate-500 font-medium space-y-3">
                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shrink-0 mt-1.5" />Open the 2D Interactions tab in the Results Panel.</li>
                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shrink-0 mt-1.5" />Pan and zoom the SVG layout to your focus area.</li>
                    <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9] shrink-0 mt-1.5" />Click the Download Icon to save a lossless SVG.</li>
                  </ul>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100">
                <h4 className="text-[12px] font-bold text-slate-700 uppercase tracking-widest mb-6">
                  Mol* 3D Visualization Tips
                </h4>
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="relative pl-4 border-l-2 border-sky-100">
                    <h5 className="text-[12px] font-bold text-[#0ea5e9] uppercase tracking-wide mb-2">
                      1. Add Residue Labels
                    </h5>
                    <p className="text-[13px] text-slate-500 font-medium leading-[1.6]">
                      Select binding-site residues &rarr; right panel &rarr; Labels &rarr; toggle Residue Name + Number. Or use Components &rarr; Around Ligand &rarr; add a Label representation.
                    </p>
                  </div>

                  <div className="relative pl-4 border-l-2 border-sky-100">
                    <h5 className="text-[12px] font-bold text-[#0ea5e9] uppercase tracking-wide mb-2">
                      2. Show Interactions (H-bonds etc.)
                    </h5>
                    <p className="text-[13px] text-slate-500 font-medium leading-[1.6]">
                      Go to Structure &rarr; Structure Tools (top toolbar) &rarr; Structure Measurements. Use "Interactions" (Structure tab) &mdash; Mol* has a built-in non-covalent interaction detection layer. Alternatively: Extensions &rarr; Interactions (if enabled) gives color-coded contacts.
                    </p>
                  </div>

                  <div className="relative pl-4 border-l-2 border-sky-100">
                    <h5 className="text-[12px] font-bold text-[#0ea5e9] uppercase tracking-wide mb-2">
                      3. Clean Up the Binding Site View
                    </h5>
                    <p className="text-[13px] text-slate-500 font-medium leading-[1.6]">
                      Show only residues within 4&ndash;5 Å of the ligand using Around Ligand selection. Switch surrounding residues to "Ball & Stick" not full stick &mdash; reduces clutter. Set protein to Cartoon, coloured by chain or secondary structure.
                    </p>
                  </div>

                  <div className="relative pl-4 border-l-2 border-sky-100">
                    <h5 className="text-[12px] font-bold text-[#0ea5e9] uppercase tracking-wide mb-2">
                      4. Color the Ligand Distinctively
                    </h5>
                    <p className="text-[13px] text-slate-500 font-medium leading-[1.6]">
                      Orange is fine, but try yellow or CPK coloring &mdash; more publication standard.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={300}>
            <div className="relative p-1 border border-slate-200/80 rounded-sm bg-slate-50/20 overflow-hidden">
               <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
               <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-[#0ea5e9]" />
               <div className="bg-white p-2">
                 <img src="/table.png" alt="Affinity Tables" className="rounded border border-slate-100 shadow-sm w-full mx-auto" />
               </div>
            </div>
          </AnimatedSection>

        </div>
      </section>

      <Footer lightTheme />
      </div>
    </div>
  );
};

export default Documentation;
