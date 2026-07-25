import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import Button from "../components/ui/Button";
import { StickyScroll } from "../components/ui/sticky-scroll-reveal";
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

/* ─── Premium Screenshot Frame (Mac Window Style with Full Content Fitting) ─── */
const ScreenshotFrame = ({ src, alt, caption, className = "" }) => (
  <div className={`flex flex-col w-full h-full ${className}`}>
    <TiltCard className="h-full">
      <div className="w-full h-full rounded-2xl border border-border/80 bg-card shadow-2xl overflow-hidden flex flex-col group transition-all duration-300 hover:border-primary/40">
        <div className="h-7 bg-muted/60 border-b border-border/80 px-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80 border border-[#E0443E]/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80 border border-[#DEA123]/40" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80 border border-[#1AAB29]/40" />
          </div>
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70 uppercase truncate px-2">
            salidock-interface // preview
          </span>
          <div className="w-10" />
        </div>
        <div className="flex-1 relative w-full h-full overflow-hidden bg-card flex items-center justify-center p-2">
          <img
            src={src}
            alt={alt}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.01]"
          />
        </div>
      </div>
    </TiltCard>
    {caption && (
      <p className="text-[10px] text-muted-foreground font-medium mt-2 text-center tracking-wide uppercase shrink-0">
        {caption}
      </p>
    )}
  </div>
);

const stickyDocsContent = [
  {
    id: "input",
    title: "Step 1 — Input Ingestion",
    description: (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <FlaskConical size={16} /> SYSTEM PROTOCOL 01 // INGESTION
        </div>
        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">Protein Receptor Modes</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">PDB File</strong> — Direct upload (.pdb, .ent)</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">FASTA</strong> — ESMFold sequence structure prediction</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">UniProt ID</strong> — Direct AlphaFold DB model fetch</span></li>
          </ul>
        </AccentCard>

        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">Ligand Molecule Modes</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">SDF / MOL2</strong> — Direct 3D chemical file upload</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">SMILES</strong> — Canonical SMILES with auto 3D conformer generation</span></li>
          </ul>
        </AccentCard>
      </div>
    ),
    content: (
      <ScreenshotFrame
        src="/auto_blind_docking.png"
        alt="Step 1 — Input Intake Panels"
        caption="Fig. 1 — Input step showing receptor and ligand intake panels"
      />
    ),
  },
  {
    id: "prepare",
    title: "Step 2 — Structure Preparation",
    description: (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <Layers size={16} /> SYSTEM PROTOCOL 02 // PREPARATION
        </div>
        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">Preparation Protocol</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Chain Filtering</strong> — Toggle specific target chains to retain</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Heteroatoms & Water</strong> — Strip or preserve specific ions & cofactors</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Automated Repair</strong> — PDBFixer protonation & OpenBabel PDBQT conversion</span></li>
          </ul>
        </AccentCard>
      </div>
    ),
    content: (
      <ScreenshotFrame
        src="/prepare.png"
        alt="Step 2 — Protein Configuration"
        caption="Fig. 2 — Structure preparation & chain selection"
      />
    ),
  },
  {
    id: "auto-blind",
    title: "Step 3 — Auto-Blind Cavities (wRRF)",
    description: (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <Compass size={16} /> SYSTEM PROTOCOL 03 // CONSENSUS
        </div>
        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">Consensus Pocket Detection</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">3 Predictors</strong> — fpocket, P2Rank, PUResNetV2.0</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Top Cavities</strong> — Automatic ranking of top 5 consensus binding sites</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Smart Routing</strong> — GNINA (CNN scoring) for compact sites, QuickVina-W for large volumes</span></li>
          </ul>
        </AccentCard>
      </div>
    ),
    content: (
      <ScreenshotFrame
        src="/modes.png"
        alt="Auto-Blind Docking mode selection"
        caption="Fig. 3 — Auto-Blind Docking mode configuration"
      />
    ),
  },
  {
    id: "batch-dock",
    title: "Step 4 — Batch Screening",
    description: (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <Network size={16} /> SYSTEM PROTOCOL 04 // SCREENING
        </div>
        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">Multi-Ligand Screening</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Library Intake</strong> — Multi-SDF, ZIP archive, or newline SMILES list</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Target Cavity Lock</strong> — Select 1 target pocket from consensus table for uniform scoring</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">MMFF94 Optimization</strong> — Parallel 3D conformer geometry optimization</span></li>
          </ul>
        </AccentCard>
      </div>
    ),
    content: (
      <ScreenshotFrame
        src="/batch_cavity.png"
        alt="Batch Dock Cavity Selection"
        caption="Fig. 4 — Batch Dock cavity selection table with confidence tiers"
      />
    ),
  },
  {
    id: "active-site",
    title: "Step 5 — Targeted Active-Site Box",
    description: (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <Grid size={16} /> SYSTEM PROTOCOL 05 // TARGETING
        </div>
        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">Targeted Grid Setup</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Spatial Coordinates</strong> — Custom X, Y, Z grid center (Å) & box dimensions</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">3D Viewport Overlay</strong> — Live real-time grid box visualization in Mol*</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Auto-Detect Centroid</strong> — 1-click centroid initialization from target residues</span></li>
          </ul>
        </AccentCard>
      </div>
    ),
    content: (
      <ScreenshotFrame
        src="/grid.png"
        alt="Active-Site 3D Grid Box Viewer"
        caption="Fig. 5 — Grid Box Viewer with axis-coloured search volume overlay"
      />
    ),
  },
  {
    id: "results-3d",
    title: "Step 6 — 3D Pose & Surface Analytics",
    description: (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <LayoutDashboard size={16} /> SYSTEM PROTOCOL 06 // 3D VISUALIZATION
        </div>
        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">3D Binding Complex Inspection</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Interactive Mol* Canvas</strong> — Full 3D rotation, zooming, slab slicing, & pose switching</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Pocket & Surface Display</strong> — Toggle cavity surface mesh, pocket residues, & atom labels</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Complex Download</strong> — 1-click PDB export of receptor bound to top-ranked ligand poses</span></li>
          </ul>
        </AccentCard>
      </div>
    ),
    content: (
      <ScreenshotFrame
        src="/mol.png"
        alt="Results 3D Pose Analytics"
        caption="Fig. 6 — 3D binding complex & pocket surface in Mol*"
      />
    ),
  },
  {
    id: "results-2d",
    title: "Step 7 — 2D Interaction Diagram",
    description: (
      <div className="flex flex-col gap-4 mt-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
          <Activity size={16} /> SYSTEM PROTOCOL 07 // 2D MAPS
        </div>
        <AccentCard className="p-5">
          <h4 className="text-[13px] font-bold text-primary uppercase tracking-wide mb-2">2D Contact Analysis</h4>
          <ul className="text-[13px] text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">ProLIF Contact Mapping</strong> — Color-coded non-covalent bonds (H-bonds, salt bridges, hydrophobic)</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Bond Distance Overlay</strong> — Explicit distance annotations (Å) between ligand heavy atoms and pocket residues</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground">Vector Graphic Export</strong> — Download high-resolution publication-ready SVG diagrams</span></li>
          </ul>
        </AccentCard>
      </div>
    ),
    content: (
      <ScreenshotFrame
        src="/2d_interaction.png"
        alt="Results 2D Interaction Diagram"
        caption="Fig. 7 — 2D non-covalent interaction map & bond distance annotations"
      />
    ),
  },
];

const Documentation = () => {
  const sections = [
    { id: "docs-hero",   label: "Overview",           icon: BookOpen },
    { id: "input",       label: "Step 1 — Input",      icon: FlaskConical },
    { id: "prepare",     label: "Step 2 — Prepare",    icon: Layers },
    { id: "auto-blind",  label: "Single Dock",          icon: Compass },
    { id: "batch-dock",  label: "Batch Dock",           icon: Network },
    { id: "active-site", label: "Active-Site Mode",     icon: Grid },
    { id: "results-3d",  label: "3D Viewer",           icon: LayoutDashboard },
    { id: "results-2d",  label: "2D Interactions",     icon: Activity },
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
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-10 w-full">
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
            STICKY SCROLL WORKFLOW PIPELINE
        ══════════════════════════════════════════════ */}
        <section className="py-20 relative">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
            <StickyScroll content={stickyDocsContent} />
          </div>
        </section>

        <div className="border-t border-border" />

        {/* ══════════════════════════════════════════════
            EXPORTS & TIPS
        ══════════════════════════════════════════════ */}
        <section id="exports" className="py-20 relative">
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">

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
                    <ul className="text-[13px] text-muted-foreground font-medium space-y-3 mb-4">
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Switch to the <em>2D Interactions</em> tab.</li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Toggle contact distance annotations and bond type color matches.</li>
                      <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />Click the download icon to save a publication-ready SVG.</li>
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
