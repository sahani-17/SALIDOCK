import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import Button from "../components/ui/Button";
import {
  BookOpen,
  Cpu,
  Grid,
  LayoutDashboard,
  Search,
  FileText,
  Zap,
  ChevronRight,
  Activity,
  Compass,
  FlaskConical,
  Layers,
  Target,
  Network,
} from "lucide-react";

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
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, hsl(var(--primary) / ${glare.opacity}), transparent 60%)`,
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
      style={{ background: "hsl(var(--primary) / 0.05)" }}
    />
  );
};

/* ─── Corner Accent Card ─── */
const AccentCard = ({ children, className = "" }) => (
  <div className={`relative p-8 border border-border rounded-sm bg-muted/20 ${className}`}>
    <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-primary" />
    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-primary" />
    {children}
  </div>
);

/* ─── Step Badge ─── */
const StepBadge = ({ n, label }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
      <span className="text-[13px] font-bold text-primary-foreground">{n}</span>
    </div>
    <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
  </div>
);

const Documentation = () => {
  const sections = [
    { id: "docs-hero",   label: "Overview",           icon: BookOpen },
    { id: "input",       label: "Step 1 — Input",      icon: FlaskConical },
    { id: "prepare",     label: "Step 2 — Prepare",    icon: Layers },
    { id: "auto-blind",  label: "Single Dock",          icon: Compass },
    { id: "batch-dock",  label: "Batch Dock",           icon: Network },
    { id: "active-site", label: "Active-Site Mode",     icon: Grid },
    { id: "results",     label: "Results & Exports",   icon: LayoutDashboard },
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
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Navbar lightTheme />

      {/* ─── Left Sidebar ─── */}
      <aside className="hidden xl:flex fixed left-0 top-0 h-screen w-64 flex-col justify-between bg-card z-40 pt-24 border-r border-border">
        <div className="w-full mt-6 pl-2">
          <h3 className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-4 pl-6">
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
                      ? "text-primary bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary" />
                  )}
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-primary" : "text-muted-foreground"} />
                  <span className="text-left">{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="w-full p-6 mt-auto border-t border-border bg-muted/30">
          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setShowDockingOptions((prev) => !prev)}
          >
            Start Docking
          </Button>

          {showDockingOptions && (
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-elevated flex flex-col">
              <Link
                to="/dock"
                onClick={() => setShowDockingOptions(false)}
                className="px-4 py-3 text-[12px] font-bold text-foreground hover:bg-muted hover:text-primary transition-colors border-b border-border"
              >
                Auto-Blind Docking
              </Link>
              <Link
                to="/dock?mode=active"
                onClick={() => setShowDockingOptions(false)}
                className="px-4 py-3 text-[12px] font-bold text-foreground hover:bg-muted hover:text-primary transition-colors"
              >
                Active-Site Docking
              </Link>
            </div>
          )}
        </div>
      </aside>

      <div className="xl:pl-64">

        {/* ══════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════ */}
        <section id="docs-hero" className="relative pt-32 pb-20 overflow-hidden">
          <div className="max-w-5xl mx-auto px-8 md:px-12 relative z-10 w-full">
            <AnimatedSection>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-[2px] bg-primary" />
                <span className="text-[11px] font-bold tracking-widest text-primary uppercase">
                  Platform Reference
                </span>
              </div>
              <h1 className="text-4xl md:text-[46px] leading-[1.1] font-medium text-foreground mb-6 uppercase tracking-tight">
                Official Documentation
              </h1>
              <p className="text-muted-foreground font-medium leading-[1.9] text-[15px] max-w-3xl mb-12">
                Salidock provides a complete, end-to-end computational docking pipeline —
                from raw structure input through automated preparation, binding-site prediction,
                and docking execution, to interactive result analysis. This reference covers each
                stage of the workflow in the order you will encounter it.
              </p>

              {/* Workflow Overview Cards */}
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { n: "01", icon: FlaskConical, label: "Input & Preparation", desc: "Upload protein and ligand, select chains, strip heteroatoms." },
                  { n: "02", icon: Compass,      label: "Docking Execution",    desc: "Choose Auto-Blind or Active-Site mode, run the simulation." },
                  { n: "03", icon: LayoutDashboard, label: "Analysis & Export", desc: "Visualise poses in 3D, inspect 2D interaction maps, download complexes." },
                ].map(({ n, icon: Icon, label, desc }) => (
                  <AccentCard key={n} className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-[10px] font-bold tracking-widest text-muted-foreground">{n}</span>
                      <Icon className="w-4 h-4 text-primary" strokeWidth={2.5} />
                      <h3 className="text-[13px] font-bold text-foreground uppercase tracking-wide">{label}</h3>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">{desc}</p>
                  </AccentCard>
                ))}
              </div>
            </AnimatedSection>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ══════════════════════════════════════════════
            STEP 1 — INPUT
        ══════════════════════════════════════════════ */}
        <section id="input" className="py-24 relative">
          <div className="max-w-5xl mx-auto px-8 md:px-12">

            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-primary/10 flex items-center justify-center">
                  <FlaskConical className="w-8 h-8 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-foreground tracking-wider mb-1 uppercase">Step 1 — Input</h2>
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    SYSTEM PROTOCOL 01 // STRUCTURE INGESTION
                  </div>
                </div>
              </div>
            </AnimatedSection>

            <div className="grid md:grid-cols-2 gap-16 items-start">

              <AnimatedSection className="flex flex-col gap-8">
                <p className="text-muted-foreground font-medium leading-[1.9] text-[15px]">
                  The workflow begins at the <strong className="text-foreground">Input</strong> step.
                  Both a protein receptor and a small-molecule ligand must be provided before
                  the pipeline can proceed.
                </p>

                <div className="flex flex-col gap-5">
                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Layers className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Protein Receptor
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7] mb-4">
                      Three intake modes are supported:
                    </p>
                    <ul className="text-[13px] text-muted-foreground font-medium space-y-2">
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">PDB File</strong> — upload a crystallographic or homology-modelled structure directly.</span></li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">FASTA</strong> — submit an amino-acid sequence; ESMFold generates a predicted structure.</span></li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">UniProt ID</strong> — the AlphaFold DB model is fetched directly from EMBL-EBI.</span></li>
                    </ul>
                  </AccentCard>

                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Zap className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Ligand Molecule
                      </h4>
                    </div>
                    <ul className="text-[13px] text-muted-foreground font-medium space-y-2">
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">SDF / MOL2</strong> — upload a 3D structure file.</span></li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">SMILES</strong> — enter a canonical SMILES string; 3D coordinates are generated automatically via OpenBabel.</span></li>
                    </ul>
                  </AccentCard>
                </div>

                <div className="p-4 border-l-2 border-primary/40 bg-muted/30">
                  <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                    <strong className="text-foreground">Step 2 — Prepare</strong> immediately follows.
                    Select which protein chains and heteroatom groups to retain, then confirm.
                    Protonation and PDBQT conversion are handled automatically by PDBFixer and OpenBabel.
                  </p>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={200}>
                <TiltCard>
                  <img
                    src="/auto_blind_docking.png"
                    alt="Step 1 — Upload Input Files: protein receptor (PDB / FASTA / UniProt) and ligand molecule (SDF / SMILES)"
                    className="rounded-xl border border-border shadow-2xl w-full"
                  />
                </TiltCard>
                <p className="text-[11px] text-muted-foreground font-medium mt-3 text-center tracking-wide uppercase">
                  Fig. 1 — Input step showing receptor and ligand intake panels
                </p>
              </AnimatedSection>

            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ══════════════════════════════════════════════
            STEP 2 — PREPARE
        ══════════════════════════════════════════════ */}
        <section id="prepare" className="py-24 relative">
          <div className="max-w-5xl mx-auto px-8 md:px-12">

            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-primary/10 flex items-center justify-center">
                  <Layers className="w-8 h-8 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-foreground tracking-wider mb-1 uppercase">Step 2 — Prepare</h2>
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    SYSTEM PROTOCOL 02 // STRUCTURE PREPARATION
                  </div>
                </div>
              </div>
            </AnimatedSection>

            <div className="grid md:grid-cols-2 gap-16 items-start">

              <AnimatedSection delay={200}>
                <TiltCard>
                  <img
                    src="/prepare.png"
                    alt="Step 2 — Protein Configuration: chain selection toggles and heteroatom checkboxes before structure preparation"
                    className="rounded-xl border border-border shadow-2xl w-full"
                  />
                </TiltCard>
                <p className="text-[11px] text-muted-foreground font-medium mt-3 text-center tracking-wide uppercase">
                  Fig. 2 — Prepare step showing cofactor/heteroatom selection and ligand optimisation
                </p>
              </AnimatedSection>

              <AnimatedSection className="flex flex-col gap-8">
                <p className="text-muted-foreground font-medium leading-[1.9] text-[15px]">
                  Before docking can proceed, the raw input structure must be cleaned and
                  standardised. The <strong className="text-foreground">Prepare</strong> step exposes
                  the structural elements detected in the uploaded file and lets you decide
                  exactly what the docking engine will see.
                </p>

                <div className="flex flex-col gap-5">
                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Layers className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Chain Selection
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Multi-chain structures display each chain as a selectable toggle.
                      Retain only the chains that constitute the target binding domain —
                      removing unrelated chains reduces noise in cavity detection and
                      accelerates the docking calculation.
                    </p>
                  </AccentCard>

                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Search className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Heteroatom Handling
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Co-crystallised ligands, ions, and solvent molecules are parsed and listed
                      individually. Tick any heteroatoms to retain in the final receptor — useful
                      when a catalytic metal ion or cofactor is essential to the binding site
                      geometry.
                    </p>
                  </AccentCard>

                  <div className="p-4 border-l-2 border-primary/40 bg-muted/30">
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Clicking <strong className="text-foreground">Prepare Protein</strong> triggers
                      PDBFixer for structure repair (missing residues, non-standard amino acids)
                      followed by OpenBabel for protonation and PDBQT conversion.
                      The ligand undergoes the same conversion automatically.
                    </p>
                  </div>
                </div>
              </AnimatedSection>

            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ══════════════════════════════════════════════
            SECTION 3 — AUTO-BLIND DOCKING
        ══════════════════════════════════════════════ */}
        <section id="auto-blind" className="py-24 relative">
          <div className="max-w-5xl mx-auto px-8 md:px-12">

            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-primary/10 flex items-center justify-center">
                  <Compass className="w-8 h-8 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-foreground tracking-wider mb-1 uppercase">Auto-Blind Docking</h2>
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    SYSTEM PROTOCOL 02 // AUTOMATED CAVITY CONSENSUS
                  </div>
                </div>
              </div>
            </AnimatedSection>

            <div className="grid md:grid-cols-2 gap-16 items-start">

              <AnimatedSection className="order-2 md:order-1 flex flex-col gap-8">
                <p className="text-muted-foreground font-medium leading-[1.9] text-[15px]">
                  Select <strong className="text-foreground">Auto-Blind Docking</strong> at the Configure step to
                  let Salidock autonomously detect the most probable binding sites across the entire
                  protein surface and dock into each one simultaneously.
                </p>

                <div className="flex flex-col gap-5">
                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Network className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Consensus Cavity Detection
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Three independent tools run in parallel and their ranked pocket lists are
                      merged into a single consensus ranking: a geometric algorithm (fpocket),
                      a machine-learning predictor (P2Rank), and a deep-learning residue classifier
                      (PUResNetV2.0). The top 5 cavities by consensus score are forwarded to docking.
                    </p>
                  </AccentCard>

                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Cpu className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Adaptive Engine Routing
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Each cavity is dispatched to the most appropriate docking engine based on its
                      predicted volume and confidence tier. Compact, high-confidence sites are routed
                      to <strong className="text-foreground">GNINA</strong> for focused CNN-scored docking;
                      large or low-confidence volumes are handled by <strong className="text-foreground">QuickVina-W</strong> for
                      efficient whole-protein blind search.
                    </p>
                  </AccentCard>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={200} className="order-1 md:order-2 space-y-6">
                <TiltCard>
                  <img
                    src="/modes.png"
                    alt="Configure step showing Auto-Blind and Active-Site docking mode selection"
                    className="rounded-xl border border-border shadow-2xl w-full"
                  />
                </TiltCard>
                <p className="text-[11px] text-muted-foreground font-medium mt-3 text-center tracking-wide uppercase">
                  Fig. 4 — Configure step with Auto-Blind Docking selected
                </p>
              </AnimatedSection>

            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ══════════════════════════════════════════════
            BATCH DOCKING
        ══════════════════════════════════════════════ */}
        <section id="batch-dock" className="py-24 relative">
          <div className="max-w-5xl mx-auto px-8 md:px-12">

            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-primary/10 flex items-center justify-center">
                  <Network className="w-8 h-8 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-foreground tracking-wider mb-1 uppercase">Batch Docking</h2>
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    SYSTEM PROTOCOL 04 // MULTI-LIGAND SCREENING
                  </div>
                </div>
              </div>
            </AnimatedSection>

            <div className="grid md:grid-cols-2 gap-16 items-start">

              <AnimatedSection className="flex flex-col gap-8">
                <p className="text-muted-foreground font-medium leading-[1.9] text-[15px]">
                  <strong className="text-foreground">Batch Dock</strong> screens an entire ligand
                  library against a single protein receptor in one submission. It mirrors the
                  Single Dock workflow (Input → Prepare → Configure) but adds a parallel
                  ligand optimisation stage and an explicit cavity selection step.
                </p>

                <div className="flex flex-col gap-5">
                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Network className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Consensus Cavity Selection
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Unlike Single Dock — where all top-ranked cavities are docked automatically —
                      Batch Dock presents the consensus pocket table and lets you <strong className="text-foreground">select
                      exactly one target cavity</strong>. Every ligand in the library is docked
                      exclusively into that site, keeping results directly comparable across compounds.
                    </p>
                  </AccentCard>

                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Cpu className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Cavity Table Columns
                      </h4>
                    </div>
                    <ul className="text-[13px] text-muted-foreground font-medium space-y-2">
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Rank</strong> — consensus rank across all three detection tools.</span></li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Confidence</strong> — HIGH / MEDIUM / LOW badge based on inter-tool agreement.</span></li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Volume (&#8491;³)</strong> — estimated pocket volume; also determines which docking engine is assigned.</span></li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Center [X, Y, Z]</strong> — spatial coordinates of the pocket centroid.</span></li>
                    </ul>
                  </AccentCard>

                  <div className="p-4 border-l-2 border-primary/40 bg-muted/30">
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Ligand library files are accepted as individual <strong className="text-foreground">SDF / MOL2</strong> files,
                      a multi-molecule SDF, a ZIP archive, or as a newline-delimited
                      <strong className="text-foreground"> SMILES list</strong>. All conformers are
                      geometry-optimised (MMFF94) before docking begins.
                    </p>
                  </div>
                </div>
              </AnimatedSection>

              <AnimatedSection delay={200}>
                <TiltCard>
                  <img
                    src="/batch_cavity.png"
                    alt="Batch Dock Configure step — Consensus Cavity Site table listing pocket rank, confidence, volume and centre coordinates with one cavity selected"
                    className="rounded-xl border border-border shadow-2xl w-full"
                  />
                </TiltCard>
                <p className="text-[11px] text-muted-foreground font-medium mt-3 text-center tracking-wide uppercase">
                  Fig. 5 — Batch Dock cavity selection table with confidence tiers
                </p>
              </AnimatedSection>

            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ══════════════════════════════════════════════
            SECTION 3 — ACTIVE-SITE DOCKING
        ══════════════════════════════════════════════ */}
        <section id="active-site" className="py-24 relative">
          <div className="max-w-5xl mx-auto px-8 md:px-12">

            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-primary/10 flex items-center justify-center">
                  <Grid className="w-8 h-8 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-foreground tracking-wider mb-1 uppercase">Active-Site Docking</h2>
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    SYSTEM PROTOCOL 03 // MANUAL TARGETING
                  </div>
                </div>
              </div>
            </AnimatedSection>

            <div className="grid md:grid-cols-2 gap-16 items-start">

              <AnimatedSection>
                <TiltCard>
                  <img
                    src="/grid.png"
                    alt="Active-Site Docking — 3D Grid Box Viewer showing search volume positioned over protein binding pocket"
                    className="rounded-xl border border-border shadow-2xl w-full"
                  />
                </TiltCard>
                <p className="text-[11px] text-muted-foreground font-medium mt-3 text-center tracking-wide uppercase">
                  Fig. 6 — Grid Box Viewer with axis-coloured search volume overlay
                </p>
              </AnimatedSection>

              <AnimatedSection delay={200} className="flex flex-col gap-8">
                <p className="text-muted-foreground font-medium leading-[1.9] text-[15px]">
                  When the binding pocket is known a priori — from a co-crystal structure,
                  mutagenesis data, or literature — select <strong className="text-foreground">Active-Site Docking</strong> to
                  constrain the search volume to that specific region.
                </p>

                <div className="flex flex-col gap-5">
                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Search className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Grid Box Configuration
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      Define the search volume by specifying the grid centre coordinates
                      (X, Y, Z in Å) and box dimensions. Use <strong className="text-foreground">Auto-Detect</strong> to
                      initialise the centre at the protein's geometric centroid, then manually
                      refine to surround the residues of interest. The translucent box overlay in
                      the Mol* viewport updates in real time.
                    </p>
                  </AccentCard>

                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Activity className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Automatic Engine Selection
                      </h4>
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7]">
                      The docking engine is selected automatically from the grid geometry.
                      Focused search boxes routed to <strong className="text-foreground">GNINA</strong> produce
                      CNN-scored binding affinities; broader search volumes are handled
                      by <strong className="text-foreground">QuickVina-W</strong>. No manual engine selection is required.
                    </p>
                  </AccentCard>

                  <AccentCard className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Grid className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        Axis Legend
                      </h4>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { color: "#ef4444", label: "X-axis" },
                        { color: "#22c55e", label: "Y-axis" },
                        { color: "#3b82f6", label: "Z-axis" },
                      ].map((c) => (
                        <div key={c.label} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: c.color }} />
                          <span className="text-[12px] text-muted-foreground font-medium">{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </AccentCard>
                </div>
              </AnimatedSection>

            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ══════════════════════════════════════════════
            SECTION 4 — RESULTS & EXPORTS
        ══════════════════════════════════════════════ */}
        <section id="results" className="py-24 relative">
          <div className="max-w-5xl mx-auto px-8 md:px-12">

            <AnimatedSection className="mb-12">
              <div className="flex items-center gap-6">
                <div className="w-[72px] h-[72px] shrink-0 bg-primary/10 flex items-center justify-center">
                  <LayoutDashboard className="w-8 h-8 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-foreground tracking-wider mb-1 uppercase">Results & Exports</h2>
                  <div className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
                    SYSTEM PROTOCOL 04 // RESULT ANALYTICS
                  </div>
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={100} className="mb-10">
              <p className="text-muted-foreground font-medium leading-[1.9] text-[15px] max-w-3xl">
                On completion, all docked poses are presented in an interactive analysis environment.
                Results are grouped by cavity and ordered by binding affinity (kcal/mol, most negative first).
              </p>
            </AnimatedSection>

            {/* 3D Viewer + 2D Interactions */}
            <div className="grid md:grid-cols-2 gap-8 mb-12">

              <AnimatedSection delay={100} className="h-full">
                <div className="relative p-1 border border-border rounded-sm bg-muted/20 h-full flex flex-col">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-primary" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-primary" />
                  <div className="p-5 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-3">
                      <Target className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        3D Pose Viewer
                      </h4>
                    </div>
                    {/* mol.png is a 3840×2160 Mol* export — crop into the upper-left
                        quadrant where the protein-ligand complex sits */}
                    <div
                      className="rounded-lg border border-border mb-4 w-full overflow-hidden"
                      style={{ aspectRatio: "16/9" }}
                    >
                      <img
                        src="/mol.png"
                        alt="Mol* 3D viewer — protein shown as cartoon ribbon with docked ligand in ball-and-stick, binding residues labelled"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "35% 30%",
                        }}
                      />
                    </div>
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7] mt-auto">
                      Protein–ligand complexes are rendered in Mol* with residue labels, non-covalent
                      interaction contacts, and full camera control (rotate / pan / zoom). Representation
                      style and colour scheme are adjustable via the viewer toolbar.
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium mt-2 text-center tracking-wide uppercase">
                  Fig. 7 — 3D binding complex with pocket residues labelled
                </p>
              </AnimatedSection>

              <AnimatedSection delay={200} className="h-full">
                <div className="relative p-1 border border-border rounded-sm bg-muted/20 h-full flex flex-col">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-primary" />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-primary" />
                  <div className="p-5 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-3">
                      <FileText className="w-5 h-5 text-primary" strokeWidth={2.5} />
                      <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide">
                        2D Interaction Map
                      </h4>
                    </div>
                    <img
                      src="/2d_interaction.png"
                      alt="2D interaction diagram with colour-coded residue nodes: hydrogen bonds (green), salt bridges (orange), van der Waals (grey)"
                      className="rounded-lg shadow-sm border border-border mb-4 w-full"
                    />
                    <p className="text-[13px] text-muted-foreground font-medium leading-[1.7] mt-auto">
                      Automatically generated per pose using ProLIF and RDKit. Residue nodes are
                      colour-coded by interaction type — hydrogen bond, salt bridge, π-cation,
                      attractive charge, and van der Waals — with binding affinity annotated
                      at the bottom of the diagram.
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium mt-2 text-center tracking-wide uppercase">
                  Fig. 8 — 2D interaction map with colour-coded residue contacts
                </p>
              </AnimatedSection>

            </div>

            {/* Binding Cavities Table */}
            <AnimatedSection delay={250} className="mb-12">
              <div className="relative p-1 border border-border rounded-sm bg-muted/20 overflow-hidden">
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-primary" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-primary" />
                <div className="bg-card p-2">
                  <img
                    src="/table.png"
                    alt="Binding Cavities table listing cavity IDs, docking modes, affinities in kcal/mol, pocket centres, and per-pose view/download actions"
                    className="rounded border border-border shadow-sm w-full mx-auto"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground font-medium mt-3 text-center tracking-wide uppercase">
                Fig. 9 — Binding Cavities table ranked by affinity with cavity IDs and spatial coordinates
              </p>
            </AnimatedSection>

            {/* Export Details */}
            <AnimatedSection delay={300}>
              <div className="relative p-8 md:p-10 border border-border rounded-sm bg-muted/20 overflow-hidden">
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-primary" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-[2.5px] border-r-[2.5px] border-primary" />
                <div className="absolute -right-10 -top-10 opacity-[0.03]">
                  <FileText size={150} />
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <FileText className="w-5 h-5 text-primary" strokeWidth={2.5} />
                  <h4 className="text-[15px] font-bold text-primary uppercase tracking-wide">
                    Exporting Results
                  </h4>
                </div>

                <div className="grid sm:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-[12px] font-bold text-foreground uppercase tracking-widest mb-3">
                      3D Structure Export
                    </h4>
                    <ul className="text-[13px] text-muted-foreground font-medium space-y-3">
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Select any pose from the <em>Viewing Pose</em> dropdown.</li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Adjust camera angle, zoom, and representation in the toolbar.</li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Click the download icon in the table row to save the complex as a PDB file.</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-[12px] font-bold text-foreground uppercase tracking-widest mb-3">
                      2D Interaction Map Export
                    </h4>
                    <ul className="text-[13px] text-muted-foreground font-medium space-y-3">
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Switch to the <em>2D Interactions</em> tab.</li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Use the pose selector to navigate between conformations.</li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Click the download icon to save a lossless SVG ready for publication.</li>
                    </ul>
                  </div>
                </div>

                {/* Mol* Tips */}
                <div className="mt-8 pt-8 border-t border-border">
                  <h4 className="text-[12px] font-bold text-foreground uppercase tracking-widest mb-6">
                    Mol* Visualisation Tips
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-6">
                    {[
                      {
                        title: "1. Add Residue Labels",
                        body: "Select binding-site residues → right panel → Labels → toggle Residue Name + Number. Or use Components → Around Ligand → add a Label representation.",
                      },
                      {
                        title: "2. Show Non-Covalent Interactions",
                        body: "Go to Structure → Structure Tools → Structure Measurements. The Interactions tab provides colour-coded contact detection built into Mol*.",
                      },
                      {
                        title: "3. Isolate the Binding Pocket",
                        body: "Use the 'Around Ligand' selection to display only residues within 4–5 Å. Switch surrounding residues to Ball & Stick and set the protein to Cartoon coloured by secondary structure.",
                      },
                      {
                        title: "4. Ligand Colouring",
                        body: "CPK or element-symbol colouring is preferred for publication figures. Avoid default single-colour schemes when submitting to journals.",
                      },
                    ].map(({ title, body }) => (
                      <div key={title} className="relative pl-4 border-l-2 border-primary/20">
                        <h5 className="text-[12px] font-bold text-primary uppercase tracking-wide mb-2">{title}</h5>
                        <p className="text-[13px] text-muted-foreground font-medium leading-[1.6]">{body}</p>
                      </div>
                    ))}
                  </div>
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
