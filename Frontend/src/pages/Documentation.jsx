import React, { useRef, useEffect, useState, useMemo } from "react";
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
  Sparkles,
  Command,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Download,
  Flame,
  Info,
  Dna,
  Atom
} from "lucide-react";
import AppSidebar from "../components/AppSidebar";

/* ─── Scroll Section Wrapper ─── */
const AnimatedSection = ({ children, className = "", delay = 0 }) => {
  const { ref, isVisible } = useScrollAnimation(0.1);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(24px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

/* ─── 3D Tilt Card (Apple subtle depth) ─── */
const TiltCard = ({ children, className = "" }) => {
  const cardRef = useRef(null);
  const [transform, setTransform] = useState("");
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMouseMove = (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - y) * 6;
    const rotateY = (x - 0.5) * 6;
    setTransform(`perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.008,1.008,1.008)`);
    setGlare({ x: x * 100, y: y * 100, opacity: 0.08 });
  };

  const handleMouseLeave = () => {
    setTransform("perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)");
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

/* ─── Apple Frosted Card ─── */
const AppleCard = ({ children, className = "" }) => (
  <div className={`rounded-3xl bg-card/75 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] shadow-elevated apple-specular-edge p-6 ${className}`}>
    {children}
  </div>
);

/* ─── Premium Screenshot Frame (Mac Window Style with Full Content Fitting) ─── */
const ScreenshotFrame = ({ src, alt, caption, className = "" }) => (
  <div className={`flex flex-col w-full h-full ${className}`}>
    <TiltCard className="h-full">
      <div className="w-full h-full rounded-2xl bg-card shadow-2xl overflow-hidden flex flex-col group transition-all duration-300 border border-white/[0.08]">
        <div className="h-7 bg-muted/60 px-3.5 flex items-center justify-between shrink-0 border-b border-border/40">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80" />
          </div>
          <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70 uppercase truncate px-2">
            salidock // runtime-preview
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
      <p className="text-[10px] text-muted-foreground font-semibold mt-2 text-center tracking-wider uppercase shrink-0">
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <FlaskConical size={16} /> SYSTEM PROTOCOL 01 // INGESTION
        </div>
        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Dna size={14} /> Protein Receptor Modes
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">PDB File Upload</strong> — Direct intake of .pdb or .ent crystallography coordinates</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">FASTA Sequence</strong> — Direct ESMFold 3D structure prediction from sequence (up to 400 residues)</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">UniProt ID</strong> — Direct AlphaFold DB model retrieval with pLDDT confidence</span></li>
          </ul>
        </AppleCard>

        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Atom size={14} /> Ligand Molecule Modes
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">SDF / MOL2 Files</strong> — Multi-conformer chemical files with 3D atomic coordinates</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">SMILES String</strong> — Canonical or isomeric SMILES with automated 3D embedding and MMFF94 minimization</span></li>
          </ul>
        </AppleCard>
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <Layers size={16} /> SYSTEM PROTOCOL 02 // PREPARATION
        </div>
        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <ShieldCheck size={14} /> Structure Preparation Pipeline
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Chain Filtering</strong> — Select specific biological chains or keep all intact</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Heteroatoms & Ions</strong> — Strip crystal solvent or retain critical active-site cofactors (e.g. Zn²⁺, Mg²⁺, HEM)</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Protonation & Charges</strong> — PDBFixer hydrogen addition & OpenBabel Gasteiger partial charges</span></li>
          </ul>
        </AppleCard>
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <Compass size={16} /> SYSTEM PROTOCOL 03 // CONSENSUS
        </div>
        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Sparkles size={14} /> Weighted Reciprocal Rank Fusion
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Ensemble Predictors</strong> — fpocket (Voronoi tessellation), P2Rank (Random Forest ML), PUResNet (Deep ResNet)</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Consensus Clustering</strong> — DBSCAN 4.5 Å centroid clustering ranks top 5 non-redundant pockets</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Smart Routing</strong> — GNINA CNN scoring for compact pockets (&lt;1200 Å³), QuickVina-W for large surfaces</span></li>
          </ul>
        </AppleCard>
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <Network size={16} /> SYSTEM PROTOCOL 04 // SCREENING
        </div>
        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Zap size={14} /> High-Throughput Ensemble Screening
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Chemical Library Intake</strong> — Multi-mol SDF, compressed ZIP folder, or newline SMILES lists</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Consensus Target Lock</strong> — Select a single high-confidence cavity deck card to target all ligands uniformly</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Real-Time Leaderboard</strong> — Stream completed conformers ranked by negative binding affinity</span></li>
          </ul>
        </AppleCard>
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <Grid size={16} /> SYSTEM PROTOCOL 05 // TARGETING
        </div>
        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Target size={14} /> Custom 3D Search Grid Box
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Coordinates (Å)</strong> — User-specified X, Y, Z center coordinates and box dimensions</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">3D Viewer Overlay</strong> — Live real-time color-coded search volume box rendered in Mol*</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Centroid Detection</strong> — 1-click centroid calculation based on active macromolecule</span></li>
          </ul>
        </AppleCard>
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <LayoutDashboard size={16} /> SYSTEM PROTOCOL 06 // 3D VISUALIZATION
        </div>
        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Activity size={14} /> 3D Binding Complex Inspection
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Interactive Mol* Canvas</strong> — Full 3D rotation, zooming, slab slicing, and pose switching</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Surface & Pocket Mesh</strong> — Toggle solvent-accessible surface, cavity bounding box, and residue contacts</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Complex Download</strong> — 1-click PDB export of receptor bound to top-ranked ligand poses</span></li>
          </ul>
        </AppleCard>
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
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
          <Activity size={16} /> SYSTEM PROTOCOL 07 // 2D MAPS
        </div>
        <AppleCard className="p-5">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Network size={14} /> 2D Contact Analysis
          </h4>
          <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">ProLIF Contact Mapping</strong> — Color-coded non-covalent bonds (H-bonds, salt bridges, π-stacking)</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Bond Distances (Å)</strong> — Explicit distance annotations between heavy ligand atoms and residue side chains</span></li>
            <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span><strong className="text-foreground font-semibold">Vector SVG Export</strong> — Download publication-grade vector diagrams with legend</span></li>
          </ul>
        </AppleCard>
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

const SEARCH_TOPICS = [
  { id: "input", title: "PDB / FASTA / UniProt Intake", section: "Step 1 — Input", category: "Ingestion" },
  { id: "prepare", title: "Chain Selection & Heteroatoms", section: "Step 2 — Prepare", category: "Structure Prep" },
  { id: "auto-blind", title: "wRRF Consensus (fpocket, P2Rank, PUResNet)", section: "Step 3 — Auto-Blind", category: "Consensus" },
  { id: "batch-dock", title: "Batch Multi-Ligand Screening (MMFF94)", section: "Step 4 — Batch Screening", category: "Screening" },
  { id: "active-site", title: "Active-Site Coordinates & Grid Box", section: "Step 5 — Targeted Mode", category: "Targeting" },
  { id: "results-3d", title: "Mol* 3D Pose Inspection & Surface Mesh", section: "Step 6 — 3D Viewer", category: "Visualization" },
  { id: "results-2d", title: "ProLIF 2D Interaction Diagrams (SVG)", section: "Step 7 — 2D Maps", category: "Analysis" },
  { id: "exports", title: "Exporting Results & Mol* Tips", section: "Platform Reference", category: "Exports" },
];

const Documentation = () => {
  const sections = [
    { id: "docs-hero",   label: "Overview",           icon: BookOpen },
    { id: "scrubber",    label: "3-Stage Scrubber",   icon: Layers },
    { id: "input",       label: "Step 1 — Input",      icon: FlaskConical },
    { id: "prepare",     label: "Step 2 — Prepare",    icon: Layers },
    { id: "auto-blind",  label: "Single Dock",          icon: Compass },
    { id: "batch-dock",  label: "Batch Dock",           icon: Network },
    { id: "active-site", label: "Active-Site Mode",     icon: Grid },
    { id: "results-3d",  label: "3D Viewer",           icon: LayoutDashboard },
    { id: "results-2d",  label: "2D Interactions",     icon: Activity },
    { id: "exports",     label: "Exports & Tips",      icon: FileText },
  ];

  const [activeSection, setActiveSection] = useState("docs-hero");
  const [showDockingOptions, setShowDockingOptions] = useState(false);

  // Spotlight Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);



  // 3-Stage Pipeline Scrubber active stage
  const [activePipelineStage, setActivePipelineStage] = useState(1);

  // Filter search results
  const filteredSearch = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return SEARCH_TOPICS.filter(t => t.title.toLowerCase().includes(q) || t.section.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [searchQuery]);

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

  const docsSidebarGroups = [
    {
      label: "Getting Started",
      items: [
        { id: "docs-hero", title: "Overview", icon: BookOpen },
        { id: "scrubber", title: "3-Stage Scrubber", icon: Layers },
      ],
    },
    {
      label: "Pipeline Steps",
      items: [
        { id: "input", title: "Step 1 — Input", icon: FlaskConical },
        { id: "prepare", title: "Step 2 — Prepare", icon: Layers },
      ],
    },
    {
      label: "Docking Modes",
      items: [
        {
          id: "auto-blind",
          title: "Single Docking",
          icon: Compass,
          subItems: [
            { id: "auto-blind", title: "Auto-Blind Cavity" },
            { id: "active-site", title: "Active-Site Pocket" },
          ],
        },
        { id: "batch-dock", title: "Batch Screening", icon: Network },
      ],
    },
    {
      label: "Analysis & Post-Processing",
      items: [
        { id: "results-3d", title: "3D Pose Viewer", icon: LayoutDashboard },
        { id: "results-2d", title: "2D Interaction Diagrams", icon: Activity },
        { id: "exports", title: "Exports & Mol* Tips", icon: FileText },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col justify-between selection:bg-primary/20 selection:text-primary">
      <Navbar />

      <div className="flex-1 flex flex-col">
        <div className="hidden xl:block relative z-50">
          <AppSidebar
            groups={docsSidebarGroups}
            activeSection={activeSection}
            onSectionClick={scrollToSection}
            headerTitle="Documentation"
            headerSubtitle="Developer & Workflow Guide"
            actionButton={{
              label: "Start Docking",
              onClick: () => setShowDockingOptions((prev) => !prev),
            }}
          />
          {showDockingOptions && (
            <div className="fixed left-4 bottom-16 w-56 z-50 overflow-hidden rounded-2xl border border-white/[0.1] bg-card/90 backdrop-blur-2xl shadow-2xl flex flex-col p-1.5 animate-fade-in-up apple-specular-edge">
              <Link
                to="/dock"
                onClick={() => setShowDockingOptions(false)}
                className="px-4 py-2.5 text-xs font-bold text-foreground hover:bg-primary/10 hover:text-primary transition-colors border-b border-border/50 rounded-xl flex items-center justify-between"
              >
                <span>Single Docking</span>
                <ChevronRight size={13} />
              </Link>
              <Link
                to="/batch-dock"
                onClick={() => setShowDockingOptions(false)}
                className="px-4 py-2.5 text-xs font-bold text-foreground hover:bg-primary/10 hover:text-primary transition-colors rounded-xl flex items-center justify-between"
              >
                <span>Batch Screening</span>
                <ChevronRight size={13} />
              </Link>
            </div>
          )}
        </div>

        <div className="xl:pl-64 flex-1">
          {/* ══════════════════════════════════════════════
              HERO & SPOTLIGHT SEARCH BAR
          ══════════════════════════════════════════════ */}
          <section id="docs-hero" className="relative pt-32 pb-14 overflow-hidden">
            <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 relative z-10 w-full">
              <AnimatedSection>
                <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-primary uppercase mb-4">
                  <BookOpen size={15} /> PLATFORM DEVELOPER REFERENCE
                </div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
                  SaliDock Architecture & Documentation
                </h1>
                <p className="text-muted-foreground text-sm md:text-base leading-relaxed max-w-3xl mb-8">
                  Comprehensive reference for SaliDock's end-to-end computational pipeline — from macromolecular structure input, automated protonation, and wRRF consensus pocket detection, to 3D convolutional neural network (GNINA CNN) scoring and interactive vector exports.
                </p>

                {/* Apple Spotlight Search Command Bar */}
                <div className="relative max-w-2xl mb-12">
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/80 backdrop-blur-2xl border transition-all duration-200 shadow-elevated ${
                    searchFocused ? 'border-primary ring-2 ring-primary/20 apple-specular-edge' : 'border-border/80 hover:border-primary/40'
                  }`}>
                    <Search size={18} className="text-primary shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                      placeholder="Spotlight search protocols, algorithms, parameters, APIs..."
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
                    />
                    <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted/60 border border-border/60 text-[10px] font-mono-code text-muted-foreground shrink-0">
                      <Command size={10} /> K
                    </div>
                  </div>

                  {/* Spotlight Search Results Dropdown */}
                  {searchFocused && filteredSearch.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 p-2 rounded-2xl bg-card/95 backdrop-blur-2xl border border-white/[0.1] shadow-2xl z-50 animate-fade-in-up divide-y divide-border/40">
                      {filteredSearch.map((item) => (
                        <div
                          key={item.id}
                          onMouseDown={() => { scrollToSection(item.id); setSearchQuery(""); }}
                          className="p-3 rounded-xl hover:bg-primary/10 transition-colors cursor-pointer flex items-center justify-between group"
                        >
                          <div>
                            <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                              {item.title}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {item.section} • <span className="font-semibold">{item.category}</span>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3-Stage Pipeline Physical Scrubber Card */}
                <div id="scrubber" className="mb-8">
                  <div className="flex items-center justify-between mb-3.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      3-Stage Execution Scrubber
                    </span>
                    <span className="text-xs text-primary font-semibold">Click stage to navigate</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      {
                        step: "01",
                        title: "Ingestion & Sanitization",
                        desc: "PDB / AlphaFold DB, MMFF94 force field & Gasteiger charges",
                        id: "input",
                        icon: FlaskConical
                      },
                      {
                        step: "02",
                        title: "wRRF Cavity Consensus",
                        desc: "fpocket, P2Rank & PUResNet with 4.5 Å DBSCAN clustering",
                        id: "auto-blind",
                        icon: Compass
                      },
                      {
                        step: "03",
                        title: "Sampling & CNN Rescoring",
                        desc: "AutoDock Vina, GNINA 3D CNN rescoring & ProLIF 2D maps",
                        id: "results-3d",
                        icon: Sparkles
                      },
                    ].map((st, idx) => {
                      const Icon = st.icon;
                      const active = activePipelineStage === idx + 1;
                      return (
                        <button
                          key={st.step}
                          type="button"
                          onClick={() => {
                            setActivePipelineStage(idx + 1);
                            scrollToSection(st.id);
                          }}
                          className={`p-4 rounded-2xl border text-left transition-all duration-150 ease-out active:scale-[0.98] flex gap-3.5 ${
                            active
                              ? 'border-primary/60 bg-card/90 shadow-md ring-1 ring-primary/25 apple-specular-edge'
                              : 'border-border/70 bg-card/40 hover:bg-card/70 hover:border-primary/30'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted/70 text-muted-foreground'}`}>
                            <Icon size={16} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-mono-code font-bold text-primary">Stage {st.step}</span>
                              <h3 className="font-bold text-xs text-foreground tracking-tight">{st.title}</h3>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{st.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </AnimatedSection>
            </div>
          </section>

          <div className="border-t border-border/60" />



          {/* ══════════════════════════════════════════════
              STICKY SCROLL WORKFLOW PIPELINE
          ══════════════════════════════════════════════ */}
          <section className="py-20 relative">
            <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
              <StickyScroll content={stickyDocsContent} />
            </div>
          </section>

          <div className="border-t border-border/60" />

          {/* ══════════════════════════════════════════════
              EXPORTS & PRO TIPS SECTION
          ══════════════════════════════════════════════ */}
          <section id="exports" className="py-20 relative">
            <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
              <AnimatedSection delay={200}>
                <AppleCard className="p-8 md:p-10">
                  <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border/60">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Download size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground tracking-tight">Export Protocols & Journal Publishing Guidelines</h3>
                      <p className="text-xs text-muted-foreground">Standards for publication-ready coordinates, complex PDBs, and 2D vector figures.</p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-8 mb-8">
                    <div>
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <LayoutDashboard size={14} className="text-primary" /> 3D Complex PDB Structure Export
                      </h4>
                      <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
                        <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span>Select target pose from the <em>Viewing Pose</em> dropdown in the viewer toolbar.</span></li>
                        <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span>Adjust camera angle, zoom, surface mesh transparency, and atom labeling.</span></li>
                        <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span>Click the download icon in the table row to save the receptor-ligand complex as a unified PDB file.</span></li>
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Activity size={14} className="text-primary" /> 2D Interaction Diagram (Vector SVG)
                      </h4>
                      <ul className="text-xs text-muted-foreground font-medium space-y-2.5">
                        <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span>Switch to the <em>2D Interactions</em> tab on the Results page.</span></li>
                        <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span>Toggle bond distance annotations and bond type color matches.</span></li>
                        <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" /><span>Click download to save a publication-ready SVG with infinite vector resolution.</span></li>
                      </ul>
                    </div>
                  </div>

                  {/* Mol* Professional Tips Callouts */}
                  <div className="pt-6 border-t border-border/60">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                      Mol* Visualization Pro-Tips
                    </h4>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                      {[
                        { title: "Residue Labels", body: "Select active residues → Components → Around Ligand → add Label representation to clearly show pocket numbers." },
                        { title: "Non-Covalent Bonds", body: "Go to Structure Tools → Structure Measurements to activate native Mol* contact detection lines." },
                        { title: "Pocket Isolation", body: "Isolate residues within 4.5 Å and switch to Ball & Stick while leaving receptor cartoon translucent." },
                        { title: "Element Coloring", body: "CPK element-symbol coloring is preferred for journal peer-review submission figures." },
                      ].map((tip, i) => (
                        <div key={i} className="p-3.5 rounded-2xl bg-card/40 border border-border/60 text-xs">
                          <h5 className="font-bold text-primary mb-1">{tip.title}</h5>
                          <p className="text-muted-foreground text-[11px] leading-relaxed">{tip.body}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </AppleCard>
              </AnimatedSection>
            </div>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Documentation;

