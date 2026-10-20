import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Wand2, Target, ArrowRight, RotateCw, Play, Pause, Search, Sparkles, Zap } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Hero3D from "../components/Hero3D";
import SegmentedControl from "../components/ui/SegmentedControl";
import AnimatedRays from "../components/AnimatedRays";



const STAGE_CONFIGS = {
    cavity: {
        id: "cavity",
        pdbId: "1DSP",
        pillLabel: "Cavity Detection",
        stepBadge: "1. Cavity Search",
        showPocketResidues: true,
        showPocketSurface: true,
        showPocketLabels: false,
        showInteractions: false,
        focusOnLigand: false,
        metricTitle: "Active Cavity C1 (Top Rank)",
        metricValue: "Volume: 1,842 Å³ · Cavity Guided",
        accentColor: "bg-emerald-500",
        badgeDot: "bg-emerald-500",
    },
    bound: {
        id: "bound",
        pdbId: "1DSP",
        pillLabel: "Bound Complex",
        stepBadge: "2. Docked Ligand",
        showPocketResidues: true,
        showPocketSurface: false,
        showPocketLabels: false,
        showInteractions: false,
        focusOnLigand: true,
        metricTitle: "Docked Small Molecule (Pose 1)",
        metricValue: "Affinity: -9.4 kcal/mol · RMSD 0.8 Å",
        accentColor: "bg-primary",
        badgeDot: "bg-primary",
    },
    interactions: {
        id: "interactions",
        pdbId: "1DSP",
        pillLabel: "Intermolecular Contacts",
        stepBadge: "3. Contacts",
        showPocketResidues: true,
        showPocketSurface: true,
        showPocketLabels: true,
        showInteractions: true,
        focusOnLigand: true,
        metricTitle: "Catalytic Pocket Contacts",
        metricValue: "6 H-Bonds · 14 Active Residues",
        accentColor: "bg-amber-500",
        badgeDot: "bg-amber-500",
    },
};

const STAGE_OPTIONS = [
    { value: "cavity", label: "1. Cavity Search", icon: Search },
    { value: "bound", label: "2. Bound Ligand", icon: Sparkles },
    { value: "interactions", label: "3. Contacts", icon: Zap },
];

const Landing = () => {
    const shouldReduceMotion = useReducedMotion();
    const [activeStage, setActiveStage] = useState("cavity");
    const [isPlaying, setIsPlaying] = useState(true);
    const [isSpinning, setIsSpinning] = useState(true);
    const isHoveredRef = useRef(false);

    // Auto-advance stages every 6.5s unless hovered or user manually interacted
    useEffect(() => {
        if (!isPlaying) return;
        const keys = ["cavity", "bound", "interactions"];
        const interval = setInterval(() => {
            if (isHoveredRef.current) return;
            setActiveStage((prev) => {
                const nextIndex = (keys.indexOf(prev) + 1) % keys.length;
                return keys[nextIndex];
            });
        }, 6500);

        return () => clearInterval(interval);
    }, [isPlaying]);

    const currentStage = STAGE_CONFIGS[activeStage] || STAGE_CONFIGS.cavity;

    // Framer motion variants (Apple-calibrated fluid springs)
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: shouldReduceMotion ? 0 : 0.08,
                delayChildren: shouldReduceMotion ? 0 : 0.04,
            },
        },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 18 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                type: "spring",
                stiffness: 260,
                damping: 24,
            },
        },
    };

    const heroStageVariants = {
        hidden: { opacity: 0, scale: shouldReduceMotion ? 1 : 0.96, y: shouldReduceMotion ? 0 : 24 },
        visible: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: {
                type: "spring",
                stiffness: 220,
                damping: 26,
                delay: shouldReduceMotion ? 0 : 0.16,
            },
        },
    };

    return (
        <div className="landing-page min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden bg-background relative font-sans z-0 flex flex-col justify-between">
            {/* Background – Animated Rays */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <AnimatedRays className="w-full h-full" />
            </div>

            {/* Content layer */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 flex flex-col min-h-screen lg:min-h-0 lg:h-full justify-between landing-content"
            >
                <Navbar />

                {/* Hero Main Viewport */}
                <main className="flex-1 flex items-center justify-center pt-20 lg:pt-24 pb-4 lg:pb-6 my-auto">
                    <div className="max-w-[1160px] xl:max-w-[1200px] mx-auto w-full px-6 lg:px-8">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                            {/* Left Column: Heading, Copy, Actions */}
                            <div className="flex flex-col justify-center max-w-[520px]">
                                <motion.h1
                                    variants={itemVariants}
                                    className="font-semibold text-3xl sm:text-4xl lg:text-[46px] xl:text-[50px] leading-[1.08] text-foreground tracking-[-0.03em]"
                                >
                                    SaliDock:
                                    <br />
                                    <span className="text-primary italic font-medium">Beyond Conventional</span>
                                    <br />
                                    Molecular Docking
                                </motion.h1>

                                <motion.p
                                    variants={itemVariants}
                                    className="mt-3.5 text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed tracking-[-0.005em]"
                                >
                                    An integrated, end-to-end blind docking pipeline that automatically identifies protein cavities, docks small-molecule ligands, and predicts binding energetics with zero install overhead.
                                </motion.p>

                                {/* Ready to dock section */}
                                <motion.div variants={itemVariants} className="mt-5 pt-4 border-t border-border/50">
                                    <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-[-0.015em]">
                                        Ready to dock your first ligand?
                                    </h2>
                                    <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground tracking-[-0.005em]">
                                        Start a run in under a minute — no install, no expertise needed.
                                    </p>

                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <Link
                                            to="/dock"
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out shadow-sm shadow-primary/20 apple-specular-edge"
                                        >
                                            <Wand2 size={15} aria-hidden="true" />
                                            Single Dock
                                        </Link>
                                        <Link
                                            to="/batch-dock"
                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/90 bg-card/70 backdrop-blur-md text-foreground font-semibold text-sm hover:border-primary/40 hover:bg-card active:scale-[0.97] transition-all duration-150 ease-out shadow-sm"
                                        >
                                            <Target size={15} aria-hidden="true" />
                                            Batch Dock
                                        </Link>
                                    </div>

                                    <Link
                                        to="/docs"
                                        className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary active:scale-[0.98] transition-all duration-150 self-start"
                                    >
                                        Read the docs
                                        <ArrowRight size={13} aria-hidden="true" />
                                    </Link>
                                </motion.div>
                            </div>

                            {/* Right Column: Unified Flagship 3D Showcase Card */}
                            <motion.div
                                variants={heroStageVariants}
                                className="w-full flex justify-center lg:justify-end"
                            >
                                <div
                                    className="relative w-full max-w-[480px] lg:max-w-[510px] xl:max-w-[540px]"
                                    onMouseEnter={() => {
                                        isHoveredRef.current = true;
                                    }}
                                    onMouseLeave={() => {
                                        isHoveredRef.current = false;
                                    }}
                                >
                                    {/* Ambient backlight glow matching brand logo */}
                                    <div className="absolute -inset-1.5 bg-gradient-to-tr from-blue-600/15 via-teal-500/10 to-amber-500/5 rounded-[32px] blur-2xl opacity-60 pointer-events-none -z-10" />

                                    {/* Main Glass Stage Card with Defined Apple Specular Edge */}
                                    <div className="interactive relative rounded-3xl bg-card/70 dark:bg-card/40 backdrop-blur-2xl border border-border/70 dark:border-white/10 shadow-elevated p-3.5 sm:p-4 apple-specular-edge flex flex-col gap-3 group transition-colors duration-300">
                                        {/* Top Bar: Model Status & Camera/Spin Controls */}
                                        <div className="flex items-center justify-between gap-1.5 px-1">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                                                <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
                                                    Receptor–Ligand Complex (1DSP)
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                {/* Auto-cycle pause/play toggle */}
                                                <button
                                                    type="button"
                                                    onClick={() => setIsPlaying((prev) => !prev)}
                                                    title={isPlaying ? "Pause auto-tour" : "Resume auto-tour"}
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-card/60 dark:bg-white/[0.08] hover:bg-card/90 dark:hover:bg-white/[0.15] border border-border/50 dark:border-white/15 text-muted-foreground hover:text-foreground transition-all active:scale-95"
                                                >
                                                    {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                                                </button>

                                                {/* Spin toggle */}
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSpinning((prev) => !prev)}
                                                    title={isSpinning ? "Pause 3D rotation" : "Resume 3D rotation"}
                                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full border transition-all active:scale-95 ${
                                                        isSpinning
                                                            ? "bg-primary/15 border-primary/40 text-primary dark:text-sky-300 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                                                            : "bg-card/60 dark:bg-white/[0.08] hover:bg-card/90 dark:hover:bg-white/[0.15] border border-border/50 dark:border-white/15 text-muted-foreground hover:text-foreground"
                                                    }`}
                                                >
                                                    <RotateCw size={12} className={isSpinning ? "animate-[spin_6s_linear_infinite]" : ""} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* 3D Molecular Viewport Container with Smooth Ambient Dissolve Mask */}
                                        <div
                                            className="relative h-[260px] sm:h-[290px] lg:h-[310px] xl:h-[330px] rounded-2xl overflow-hidden bg-card/25 dark:bg-black/30 border border-border/40 dark:border-white/5"
                                            style={{
                                                maskImage: "radial-gradient(ellipse 72% 72% at 50% 50%, #000 35%, rgba(0, 0, 0, 0.75) 62%, transparent 95%)",
                                                WebkitMaskImage: "radial-gradient(ellipse 72% 72% at 50% 50%, #000 35%, rgba(0, 0, 0, 0.75) 62%, transparent 95%)",
                                            }}
                                        >
                                            <Hero3D
                                                pdbId={currentStage.pdbId}
                                                showInteractions={currentStage.showInteractions}
                                                showPocketResidues={currentStage.showPocketResidues}
                                                showPocketLabels={currentStage.showPocketLabels}
                                                showPocketSurface={currentStage.showPocketSurface}
                                                focusOnLigand={currentStage.focusOnLigand}
                                                proteinRepr="cartoon"
                                                ligandRepr="ball-and-stick"
                                                colorScheme="chain-id"
                                                spin={isSpinning}
                                                transparent={true}
                                            />

                                            {/* Floating Hint (Bottom Right) */}
                                            <div className="absolute bottom-3 right-3 z-20 hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/60 dark:bg-black/40 backdrop-blur-md border border-border/50 dark:border-white/10 text-[10px] text-muted-foreground/80 shadow-sm pointer-events-none">
                                                <span>Drag to rotate</span>
                                                <span className="opacity-40">•</span>
                                                <span>Scroll to zoom</span>
                                            </div>
                                        </div>

                                        {/* Bottom Segmented Stage Switcher */}
                                        <div className="pt-0.5">
                                            <SegmentedControl
                                                options={STAGE_OPTIONS}
                                                value={activeStage}
                                                onChange={(val) => {
                                                    setActiveStage(val);
                                                    setIsPlaying(false); // Direct user interaction pauses auto-tour (Apple interruptibility)
                                                }}
                                                size="sm"
                                                className="w-full"
                                                id="hero-stage-control"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </main>

                <Footer />
            </motion.div>
        </div>
    );
};

export default Landing;
