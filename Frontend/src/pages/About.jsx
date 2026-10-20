import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import AppSidebar from "../components/AppSidebar";
import {
  Target,
  Network,
  Zap,
  FlaskConical,
  Microscope,
  ClipboardList,
  Eye,
  Database,
  Factory,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowRight,
  Wand2,
} from "lucide-react";

const ABOUT_SIDEBAR_GROUPS = [
  {
    label: "About SaliDock",
    items: [
      { id: "mission", title: "Mission & Architecture", icon: Sparkles },
      { id: "technology", title: "Technology Stack", icon: Zap },
      { id: "who-we-serve", title: "Who We Serve", icon: ClipboardList },
    ],
  },
];

const TECHNOLOGIES = [
  {
    name: "GNINA Engine",
    role: "Deep Learning Docking & Scoring",
    icon: Zap,
    tag: "Core Engine",
    description:
      "Deep convolutional neural network (CNN) docking evaluation providing atomic grid cross-entropy scoring, empirical binding affinity estimation, and conformational sampling.",
    highlights: ["CNN Pose Score & Affinity", "Atom-Grid Representations", "Cross-Entropy Loss"],
  },
  {
    name: "wRRF Consensus Pocket Detection",
    role: "Tri-Method Cavity Search",
    icon: Target,
    tag: "Blind Docking",
    description:
      "Weighted Robust Rank Fusion (wRRF) uniting geometric Voronoi vertices (fpocket), machine learning (P2Rank), and deep learning (PUResNet) to accurately detect the top binding cavities.",
    highlights: ["Rank-Fused Consensus", "fpocket · P2Rank · PUResNet", "Top-5 Cavity Automation"],
  },
  {
    name: "Mol* (Molstar) Viewer",
    role: "WebGL 3D Visualization",
    icon: Eye,
    tag: "Interactive 3D",
    description:
      "Modern WebGL molecular graphics engine delivering silky 60 FPS real-time protein-ligand rendering, interactive pocket slicing, and multi-chain representations directly in the browser.",
    highlights: ["Zero-Install WebGL", "Real-Time Chain Slicing", "Intermolecular Contacts"],
  },
  {
    name: "RDKit Cheminformatics",
    role: "Ligand Preparation & 2D Depiction",
    icon: Microscope,
    tag: "Cheminformatics",
    description:
      "Industry-standard cheminformatics toolkit handling SMILES parsing, 3D conformer generation, protonation, molecular descriptors, and dynamic 2D interaction diagram generation.",
    highlights: ["SMILES / SDF Parsing", "3D Conformer Generation", "Chemical Sanitization"],
  },
  {
    name: "Open Babel",
    role: "Universal Molecular Converter",
    icon: Network,
    tag: "Format Interop",
    description:
      "Comprehensive multi-format chemical toolbox ensuring seamless translation between PDB, SDF, MOL2, and PDBQT with automated charge assignment and coordinate normalization.",
    highlights: ["Format Transcoding", "Gasteiger / Kollman Charges", "Coordinate Standardization"],
  },
  {
    name: "PLIP Profiler",
    role: "Non-Covalent Interaction Analysis",
    icon: Database,
    tag: "Residue Analysis",
    description:
      "Protein-Ligand Interaction Profiler extracting atomic non-covalent contacts: hydrogen bonds, hydrophobic interactions, π-stacking, π-cation interactions, and salt bridges.",
    highlights: ["H-Bond Detection", "π-π & Salt Bridges", "Binding Pocket Footprints"],
  },
];

const PERSONAS = [
  {
    title: "Academic Researchers",
    icon: FlaskConical,
    tag: "Structural Biology & Academia",
    description:
      "Conduct complex structural biology studies with confidence, full reproducibility, and open data export in a modern computational environment.",
    benefits: [
      "No local software installation or compiler issues",
      "wRRF consensus reduces single-algorithm false positives",
      "Export publication-ready 3D complexes & 2D contact maps",
    ],
  },
  {
    title: "Biotech & Industry Teams",
    icon: Factory,
    tag: "Drug Discovery & Screening",
    description:
      "Pharmaceutical and biotech teams looking to accelerate hit-to-lead campaigns and batch-screen compound libraries with enterprise-grade stability.",
    benefits: [
      "High-throughput batch screening for multi-ligand sets",
      "Deterministic CNN scoring for binder prioritization",
      "Accessible cloud pipeline with queue tracking",
    ],
  },
  {
    title: "Students & Educators",
    icon: BookOpen,
    tag: "Bioinformatics Education",
    description:
      "An intuitive, visual gateway for learning molecular docking mechanics, binding pocket geometry, and energetic scoring without setup barriers.",
    benefits: [
      "Immediate visual feedback on binding cavities",
      "Explore receptor-ligand interactions hands-on",
      "Step-by-step guided workflow with clear parameters",
    ],
  },
];

const About = () => {
  const shouldReduceMotion = useReducedMotion();
  const [activeSection, setActiveSection] = useState("mission");

  // Track scroll position to update active sidebar item
  useEffect(() => {
    const sectionIds = ["mission", "technology", "who-we-serve"];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -25% 0px", threshold: [0.1, 0.3, 0.5] }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Apple spring animation variant
  const cardSpring = {
    type: "spring",
    stiffness: 260,
    damping: 24,
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col justify-between">
      <Navbar />

      <div className="flex-1 flex flex-col">
        {/* Left Collapsible Glass Sidebar */}
        <div className="hidden xl:block">
          <AppSidebar
            groups={ABOUT_SIDEBAR_GROUPS}
            activeSection={activeSection}
            onSectionClick={scrollToSection}
            headerTitle="About SaliDock"
            headerSubtitle="Consensus Platform"
          />
        </div>

        {/* Main Content Area */}
        <div className="xl:pl-64 flex-1">
          <main className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 pt-28 pb-20 space-y-24">
          {/* ══════════════════════════════════════════════
              HERO / MISSION SECTION (BENTO GRID)
          ══════════════════════════════════════════════ */}
          <section id="mission" className="scroll-mt-32">
            <motion.div
              initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={cardSpring}
              className="space-y-4 mb-10"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 backdrop-blur-md">
                <Sparkles size={13} className="text-primary" />
                <span>Next-Generation Molecular Docking</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] text-foreground leading-[1.12]">
                Bridging Computational Rigor
                <br />
                <span className="text-primary italic font-medium">with Accessible Discovery.</span>
              </h1>

              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-3xl tracking-[-0.005em]">
                Molecular docking is essential for understanding protein–ligand recognition, yet conventional
                tools remain fragmented across disparate command-line packages and complex file formats.
                SaliDock unifies automated preparation, multi-algorithm consensus cavity detection, deep learning
                scoring, and interactive 3D exploration into a frictionless, zero-install platform.
              </p>
            </motion.div>

            {/* Mission Keynote Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Bento 1: Consensus Engine (Large Card, spans 2 columns) */}
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={cardSpring}
                className="md:col-span-2 rounded-3xl bg-card/65 dark:bg-card/40 backdrop-blur-2xl border border-border/70 dark:border-white/10 p-6 sm:p-8 apple-specular-edge shadow-elevated flex flex-col justify-between group hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <Target size={20} />
                    </div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20">
                      Consensus Cavity Search
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground tracking-tight mb-2">
                    Eliminating Single-Method Cavity Bias with wRRF
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Traditional docking often relies on a single pocket detection heuristic that can miss atypical
                    allosteric sites or cryptic pockets. SaliDock integrates Weighted Robust Rank Fusion (wRRF),
                    combining geometric Voronoi vertices (fpocket), random forest machine learning (P2Rank), and
                    3D convolutional neural networks (PUResNet) to score and prioritize candidate cavities with consensus confidence.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-border/50 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground mr-1">Core Metrics:</span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/50">
                    Tri-Method Consensus
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/50">
                    Top-5 Automated Pocket Guided
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Volume & Druggability Ranking
                  </span>
                </div>
              </motion.div>

              {/* Bento 2: CNN Scoring (1 column) */}
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...cardSpring, delay: 0.08 }}
                className="rounded-3xl bg-card/65 dark:bg-card/40 backdrop-blur-2xl border border-border/70 dark:border-white/10 p-6 sm:p-8 apple-specular-edge shadow-elevated flex flex-col justify-between group hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                      <Zap size={20} />
                    </div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Deep Learning
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground tracking-tight mb-2">
                    GNINA CNN Scoring
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Moving beyond classical empirical force fields: GNINA convolutional neural networks evaluate atomic grids
                    to score true physical binders, generating reliable affinity estimates (kcal/mol) and cross-entropy confidence.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-border/50 flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/50">
                    Empirical & CNN Rescoring
                  </span>
                </div>
              </motion.div>

              {/* Bento 3: Universal Preparation (1 column) */}
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...cardSpring, delay: 0.12 }}
                className="rounded-3xl bg-card/65 dark:bg-card/40 backdrop-blur-2xl border border-border/70 dark:border-white/10 p-6 sm:p-8 apple-specular-edge shadow-elevated flex flex-col justify-between group hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                      <Cpu size={20} />
                    </div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      Automated Pipeline
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground tracking-tight mb-2">
                    Universal Structure Ingestion
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Clean, protonate, and sanitize receptors and ligands in seconds. SaliDock automatically extracts co-crystallized
                    waters, computes Gasteiger partial charges, and handles PDB, SDF, MOL2, and SMILES without manual scripts.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-border/50 flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/50">
                    Zero Shell Setup
                  </span>
                </div>
              </motion.div>

              {/* Bento 4: Global Health & Open Science (Large Card, spans 2 columns) */}
              <motion.div
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ ...cardSpring, delay: 0.16 }}
                className="md:col-span-2 rounded-3xl bg-card/65 dark:bg-card/40 backdrop-blur-2xl border border-border/70 dark:border-white/10 p-6 sm:p-8 apple-specular-edge shadow-elevated flex flex-col justify-between group hover:border-primary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <ShieldCheck size={20} />
                    </div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Open Biomedical Science
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground tracking-tight mb-2">
                    Democratizing Discovery for Real-World Biomedical Health
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    By removing proprietary licensing barriers and steep computational learning curves, SaliDock empowers
                    research labs globally to screen compounds against infectious diseases, antimicrobial resistance targets,
                    oncology kinase domains, and neglected tropical diseases with state-of-the-art accuracy.
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-border/50 flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/50">
                    Antimicrobial Resistance
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/50">
                    Kinase Inhibitors
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/50">
                    Neglected Pathogens
                  </span>
                </div>
              </motion.div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════
              TECHNOLOGY STACK (SCIENTIFIC GRID)
          ══════════════════════════════════════════════ */}
          <section id="technology" className="scroll-mt-32">
            <div className="space-y-4 mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 backdrop-blur-md">
                <Layers size={13} className="text-primary" />
                <span>Open-Source Scientific Foundation</span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-foreground leading-[1.15]">
                Built on Battle-Tested Engines
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl tracking-[-0.005em]">
                Every component of SaliDock relies on verified, peer-reviewed computational biology software,
                orchestrated into a unified, responsive web pipeline.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {TECHNOLOGIES.map((tech, idx) => {
                const Icon = tech.icon;
                return (
                  <motion.div
                    key={tech.name}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...cardSpring, delay: idx * 0.04 }}
                    whileHover={shouldReduceMotion ? {} : { y: -3 }}
                    className="rounded-3xl bg-card/65 dark:bg-card/40 backdrop-blur-2xl border border-border/70 dark:border-white/10 p-6 apple-specular-edge shadow-elevated flex flex-col justify-between group hover:border-primary/40 transition-all duration-200"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                          <Icon size={18} />
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-muted/70 text-muted-foreground border border-border/40">
                          {tech.tag}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-foreground tracking-tight mb-1 group-hover:text-primary transition-colors">
                        {tech.name}
                      </h3>
                      <p className="text-xs font-medium text-primary/80 mb-3">
                        {tech.role}
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {tech.description}
                      </p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-border/50 flex flex-wrap gap-1">
                      {tech.highlights.map((h) => (
                        <span
                          key={h}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted/50 text-muted-foreground border border-border/40"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* ══════════════════════════════════════════════
              WHO WE SERVE (PERSONA DECK)
          ══════════════════════════════════════════════ */}
          <section id="who-we-serve" className="scroll-mt-32">
            <div className="space-y-4 mb-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 backdrop-blur-md">
                <ClipboardList size={13} className="text-primary" />
                <span>Empowering The Scientific Community</span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-foreground leading-[1.15]">
                Tailored for Discovery at Every Scale
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl tracking-[-0.005em]">
                Whether you are exploring structural biology in a classroom or screening compound libraries in a drug discovery lab,
                SaliDock adapts to your workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {PERSONAS.map((persona, idx) => {
                const Icon = persona.icon;
                return (
                  <motion.div
                    key={persona.title}
                    initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ ...cardSpring, delay: idx * 0.06 }}
                    whileHover={shouldReduceMotion ? {} : { y: -3 }}
                    className="rounded-3xl bg-card/65 dark:bg-card/40 backdrop-blur-2xl border border-border/70 dark:border-white/10 p-6 sm:p-7 apple-specular-edge shadow-elevated flex flex-col justify-between group hover:border-primary/40 transition-all duration-200"
                  >
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5 group-hover:scale-105 transition-transform">
                        <Icon size={22} />
                      </div>

                      <span className="text-[10px] font-bold tracking-wider uppercase text-primary mb-1 block">
                        {persona.tag}
                      </span>
                      <h3 className="text-lg font-semibold text-foreground tracking-tight mb-2.5">
                        {persona.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-6">
                        {persona.description}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-border/50 space-y-2">
                      {persona.benefits.map((b) => (
                        <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/80 shrink-0 mt-1.5" />
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* ══════════════════════════════════════════════
              CALL TO ACTION BANNER (APPLE KEYNOTE)
          ══════════════════════════════════════════════ */}
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={cardSpring}
            className="rounded-3xl bg-gradient-to-br from-card/80 via-card/50 to-primary/5 dark:from-card/60 dark:via-card/30 dark:to-primary/10 backdrop-blur-2xl border border-border/80 dark:border-white/10 p-8 sm:p-10 apple-specular-edge shadow-elevated flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                Ready to Run Your First Docking Simulation?
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">
                Upload your target receptor or provide a 4-letter PDB code. Our wRRF consensus pipeline will detect pockets and begin docking in seconds.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                to="/dock"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:brightness-105 active:scale-[0.97] transition-all shadow-sm apple-specular-edge"
              >
                <Wand2 size={15} />
                <span>Single Dock</span>
              </Link>
              <Link
                to="/docs"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/80 bg-card/60 backdrop-blur-md text-foreground font-semibold text-xs sm:text-sm hover:border-primary/40 active:scale-[0.97] transition-all"
              >
                <span>Read Docs</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </motion.div>
        </main>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default About;
