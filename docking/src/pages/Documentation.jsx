import React, { useRef, useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { BookOpen, Cpu, Grid, LayoutDashboard, Search, FileText, Zap, ChevronRight, Activity } from "lucide-react";

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
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, hsl(160 84% 39% / ${glare.opacity}), transparent 60%)`,
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
      style={{ background: "hsl(160 84% 39% / 0.04)" }}
    />
  );
};

const Documentation = () => {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <CursorGlow />
      <Navbar />

      {/* ─── HERO: Documentation ─── */}
      <section className="relative pt-32 pb-20 overflow-hidden min-h-[50vh] flex items-center">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[150px] pointer-events-none opacity-40" style={{ background: "hsl(160 84% 39% / 0.08)" }} />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full text-center">
          <AnimatedSection>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <BookOpen size={16} />
              <span>Official Documentation</span>
            </div>
          </AnimatedSection>
          
          <AnimatedSection delay={100}>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-8">
              Master Virtual <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">
                Screening
              </span>
            </h1>
          </AnimatedSection>

          <AnimatedSection delay={200}>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Discover how to harness Salidock's automated preparation, AI-driven cavity detection, and comprehensive analysis modules.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* ─── SECTION: Auto Blind Docking & Cavity ─── */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            
            <AnimatedSection className="order-2 md:order-1">
              <div className="space-y-6">
                <div className="inline-flex items-center justify-center p-3 rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 mb-2">
                  <Cpu size={28} />
                </div>
                <h2 className="text-4xl font-bold">Auto-Blind Docking</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Start discovery instantly. Upload an un-prepared target crystal structure (PDB) and your raw ligand file (SMILES, MOL2, SDF). Salidock manages the complicated backend conversion into AutoDock-compatible PDBQT formats entirely.
                </p>
                
                <div className="space-y-6 mt-6">
                  <div className="p-5 rounded-xl bg-secondary/30 border border-border">
                    <h4 className="text-lg font-bold text-foreground flex items-center gap-2 mb-2">
                      <Search className="text-primary" size={20} />
                      AI-Driven Cavity Consensus
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Powered by the dual-engine consensus of the cutting-edge P2Rank machine learning algorithm and the fpocket geometric algorithm, our engine analyzes your entire protein's topological volume and maps out the most probable binding sites on its surface. It generates exact search coordinates mathematically perfectly placed over these predicted cavities.
                    </p>
                  </div>
                  
                  <div className="p-5 rounded-xl bg-secondary/30 border border-border">
                    <h4 className="text-lg font-bold text-foreground flex items-center gap-2 mb-2">
                      <Zap className="text-primary" size={20} />
                      Multi-Cavity Execution
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Once computed, AutoDock Vina instances are spawned simultaneously for each detected cavity. Instead of running just one localized search, you get comprehensive coverage to determine the absolute most viable binding pocket across the complex topology.
                    </p>
                  </div>
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
      <section className="py-24 bg-secondary/10 border-y border-border/50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            
            <AnimatedSection>
              <TiltCard>
                <img src="/grid.png" alt="Active Site Visual Grid Box" className="rounded-xl border border-border shadow-2xl glass w-full" />
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={200}>
              <div className="space-y-6">
                <div className="inline-flex items-center justify-center p-3 rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 mb-2">
                  <Grid size={28} />
                </div>
                <h2 className="text-4xl font-bold">Active-Site Precision</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Have a specific binding pocket in mind? Fine-tune the search area with our interactive 3D Grid Box Viewer. Mol* visual fidelity combined with direct DOM coordinate mapping provides absolute certainty in targeted drug discovery.
                </p>
                <ul className="space-y-4 mt-6 text-muted-foreground bg-secondary/30 p-6 rounded-xl border border-border">
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/20 p-2 rounded-lg mt-0.5"><ChevronRight size={16} className="text-primary" /></div>
                    <div>
                      <strong className="text-foreground block mb-0.5">Isolate Residues</strong>
                      Drag the Grid Box coordinates to surround specifically targeted protein residues crucial to catalytic function.
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/20 p-2 rounded-lg mt-0.5"><ChevronRight size={16} className="text-primary" /></div>
                    <div>
                      <strong className="text-foreground block mb-0.5">Maximize Efficiency</strong>
                      By narrowing the search space volume iteratively, you grant AutoDock Vina more exhaustiveness over a smaller topological field.
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="bg-primary/20 p-2 rounded-lg mt-0.5"><ChevronRight size={16} className="text-primary" /></div>
                    <div>
                      <strong className="text-foreground block mb-0.5">Real-time Overlay</strong>
                      Visually verify grid inclusions via our custom translucent Mol* canvas overlay rendering.
                    </div>
                  </li>
                </ul>
              </div>
            </AnimatedSection>

          </div>
        </div>
      </section>

      {/* ─── SECTION: Analyzing Results ─── */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <AnimatedSection>
            <div className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium mb-4">
                <LayoutDashboard size={16} />
                <span>Result Analytics</span>
              </div>
              <h2 className="text-4xl font-bold mb-4">Unprecedented Insight</h2>
              <p className="text-lg text-muted-foreground">
                Move from raw coordinates to publication-ready conclusions instantly using our visualization suite.
              </p>
            </div>
          </AnimatedSection>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <AnimatedSection delay={100} className="h-full">
              <TiltCard className="p-1 rounded-2xl bg-gradient-to-br from-border/50 to-transparent">
                <div className="bg-background rounded-xl h-full p-6 border border-border flex flex-col">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FileText size={20} className="text-primary"/> 3D Pose Browser</h3>
                  <img src="/mol.png" alt="Compare Poses" className="rounded-lg shadow-lg mb-4 w-full border border-border/50 flex-grow" />
                  <p className="text-sm text-muted-foreground">Browse generated spatial conformations sorted seamlessly by thermodynamic binding affinity. Check the overall trajectory.</p>
                </div>
              </TiltCard>
            </AnimatedSection>
            <AnimatedSection delay={200} className="h-full">
              <TiltCard className="p-1 rounded-2xl bg-gradient-to-br from-border/50 to-transparent">
                <div className="bg-background rounded-xl h-full p-6 border border-border flex flex-col">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FileText size={20} className="text-primary"/> Interaction Diagrams</h3>
                  <img src="/2d_interaction.png" alt="2D Interaction Diagrams" className="rounded-lg shadow-lg mb-4 w-full border border-border/50 flex-grow" />
                  <p className="text-sm text-muted-foreground">Automatically-generated 2D interaction maps. Pinpoint hydrogen bonds, π-stacking, and hydrophobic pockets per pose.</p>
                </div>
              </TiltCard>
            </AnimatedSection>
          </div>

          <AnimatedSection delay={250}>
            <div className="bg-gradient-to-r from-primary/20 via-primary/5 to-transparent border border-primary/30 p-8 rounded-2xl mb-8 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 opacity-10">
                <FileText size={150} />
              </div>
              <h3 className="text-2xl font-bold mb-3 flex items-center gap-2 text-foreground">
                Publication-Quality Exports
              </h3>
              <p className="text-muted-foreground mb-4 max-w-2xl">
                Salidock provides direct high-resolution image rendering from both the 3D structural viewer and the 2D conceptual arrays, ensuring your reports are immediately presentation-ready without external editing.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-6 mt-6">
                <div className="bg-background/50 p-4 rounded-xl border border-primary/20">
                  <h4 className="font-semibold text-primary mb-2 flex items-center gap-2">
                    <ChevronRight size={16}/> 3D Mol* Export
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>1. Navigate to any generated pose in the 3D Viewer.</li>
                    <li>2. Adjust your camera angle, zoom, and clipping planes.</li>
                    <li>3. Click the <strong>Download Icon</strong> in the viewer toolbar to render a transparent, high-res snapshot of the complex.</li>
                  </ul>
                </div>

                <div className="bg-background/50 p-4 rounded-xl border border-primary/20">
                  <h4 className="font-semibold text-primary mb-2 flex items-center gap-2">
                    <ChevronRight size={16}/> 2D Interaction Map Export
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>1. Open the 2D Interactions tab in the Results Panel.</li>
                    <li>2. Pan and zoom the SVG layout to your desired focus area.</li>
                    <li>3. Click the <strong>Download Icon</strong> in the top-right corner of the pane to save a lossless SVG diagram perfectly scaled for scientific papers.</li>
                  </ul>
                </div>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={300}>
            <TiltCard>
              <img src="/table.png" alt="Affinity Tables" className="rounded-xl border border-border shadow-2xl glass w-full mx-auto" />
            </TiltCard>
          </AnimatedSection>

        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Documentation;
