import React from "react";
import { Link } from "react-router-dom";
import { Wand2, Target, ArrowRight } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Hero3D from "../components/Hero3D";
import PerspectiveGrid from "../components/PerspectiveGrid";
import AnimatedRays from "../components/AnimatedRays";

const HeroBackground = () => {
    const [isDark, setIsDark] = React.useState(false);

    React.useEffect(() => {
        const checkDark = () => document.documentElement.classList.contains("dark");
        setIsDark(checkDark());

        const observer = new MutationObserver(() => setIsDark(checkDark()));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    if (isDark) {
        return <AnimatedRays className="w-full h-full" />;
    }

    return <PerspectiveGrid gridSize={40} showOverlay={true} fadeRadius={80} />;
};

const Landing = () => (
    <div className="landing-page min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden bg-background relative font-sans z-0 flex flex-col justify-between">
        {/* Background – AnimatedRays for dark theme, PerspectiveGrid for light theme */}
        <div className="absolute inset-0 z-0 pointer-events-none">
            <HeroBackground />
        </div>

        {/* Content layer */}
        <div className="relative z-10 flex flex-col min-h-screen lg:min-h-0 lg:h-full justify-between landing-content">
            <Navbar />

            {/* Hero Main Viewport */}
            <main className="flex-1 flex items-center my-auto py-4 sm:py-6">
                <div className="max-w-[1340px] mx-auto w-full px-6 lg:px-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                        {/* Left Column: Heading, Copy, Actions */}
                        <div className="flex flex-col">
                            <h1 className="font-medium text-4xl md:text-5xl lg:text-[52px] xl:text-[56px] leading-[1.08] text-foreground tracking-tight">
                                SaliDock:
                                <br />
                                <em className="italic text-primary">Beyond Conventional</em>
                                <br />
                                Molecular Docking
                            </h1>

                            <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed max-w-[540px]">
                                SaliDock advances this workflow through an integrated, end-to-end molecular docking pipeline designed to minimise the technical barriers associated with conventional protein–ligand preparation and docking.
                            </p>

                            <div className="mt-7 flex flex-wrap items-center gap-3">
                                <Link
                                    to="/dock"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all shadow-glow"
                                >
                                    <Wand2 size={16} aria-hidden="true" />
                                    Single Dock
                                </Link>
                                <Link
                                    to="/batch-dock"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border bg-background text-foreground font-semibold text-sm hover:border-primary/40 hover:text-primary transition-all"
                                >
                                    <Target size={16} aria-hidden="true" />
                                    Batch Dock
                                </Link>
                            </div>

                            <Link
                                to="/docs"
                                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors self-start"
                            >
                                Read the docs
                                <ArrowRight size={14} aria-hidden="true" />
                            </Link>
                        </div>

                        {/* Right Column: Two 3D Molecular Viewport Boxes */}
                        <div className="w-full">
                            <div className="flex flex-col gap-4 sm:gap-5 w-full max-w-[640px] mx-auto lg:ml-auto">
                                {/* Top Box: 6LUS (Target Receptor Structure) */}
                                <div className="interactive bg-card/90 backdrop-blur-sm p-2.5 sm:p-3 shadow-elevated rounded-2xl relative border border-border/80 hover:border-primary/40 transition-all group">
                                    <div className="absolute -top-3 left-4 bg-card border border-border/80 shadow-sm px-2.5 py-0.5 flex items-center gap-2 z-10 rounded-full">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Live · PDB 6LUS</span>
                                        <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">• Target Receptor</span>
                                    </div>
                                    <div className="relative h-[210px] sm:h-[235px] xl:h-[245px] rounded-xl overflow-hidden bg-card">
                                        <Hero3D pdbId="6LUS" colorScheme="sequence-id" proteinRepr="cartoon" spin={true} />
                                    </div>
                                </div>

                                {/* Bottom Box: 1DSP (Ligand Interaction Complex) */}
                                <div className="interactive bg-card/90 backdrop-blur-sm p-2.5 sm:p-3 shadow-elevated rounded-2xl relative border border-border/80 hover:border-primary/40 transition-all group">
                                    <div className="absolute -top-3 left-4 bg-card border border-border/80 shadow-sm px-2.5 py-0.5 flex items-center gap-2 z-10 rounded-full">
                                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Live · PDB 1DSP</span>
                                        <span className="text-[10px] text-primary/80 font-medium hidden sm:inline">• Ligand Interaction</span>
                                    </div>
                                    <div className="relative h-[210px] sm:h-[235px] xl:h-[245px] rounded-xl overflow-hidden bg-card">
                                        <Hero3D
                                            pdbId="1DSP"
                                            showInteractions={true}
                                            showPocketResidues={true}
                                            colorScheme="chain-id"
                                            proteinRepr="cartoon"
                                            ligandRepr="ball-and-stick"
                                            spin={true}
                                            focusOnLigand={true}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    </div>
);

export default Landing;
