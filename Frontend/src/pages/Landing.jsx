import React from "react";
import { Link } from "react-router-dom";
import { Play, Rocket, Wand2, Target, ArrowRight } from "lucide-react";
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

const Feature = ({ icon, title, desc }) => {
    const Icon = icon;
    return (
        <div className="interactive rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-elevated transition-all">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Icon size={18} className="text-primary" aria-hidden="true" />
            </div>
            <h3 className="font-medium text-foreground mb-1.5">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
        </div>
    );
};

const HowStep = ({ n, title, desc }) => (
    <div className="relative">
        <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-medium text-sm flex items-center justify-center">{n}</span>
            <h3 className="font-medium text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed pl-11">{desc}</p>
    </div>
);

const Landing = () => (
    <div className="landing-page min-h-screen bg-background relative overflow-hidden font-sans z-0 flex flex-col">
            {/* Background – AnimatedRays for dark theme, PerspectiveGrid for light theme */}
            <div className="absolute inset-0 z-0">
                <HeroBackground />
            </div>

            {/* Content layer – pointer-events:none lets hover pass to grid; interactive children re-enable it via CSS */}
            <div className="relative z-10 flex flex-col min-h-screen landing-content">

            <Navbar />

            {/* Hero */}
            <section className="relative min-h-screen flex items-center">
                <div className="max-w-[1300px] mx-auto w-full px-6 lg:px-12 py-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <div className="flex flex-col">
                            <h1 className="font-medium text-5xl md:text-6xl lg:text-[64px] leading-[1.05] text-foreground">
                                Docking that respects
                                <br />
                                <em className="italic text-primary">the science.</em>
                            </h1>

                            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-[540px]">
                                Salidock runs the full pipeline — protein preparation, wRRF consensus cavity detection, GNINA CNN scoring — with an interactive Mol* viewer for every pose.
                            </p>

                            <div className="mt-8 flex flex-wrap items-center gap-3">
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
                                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors self-start"
                            >
                                Read the docs
                                <ArrowRight size={14} aria-hidden="true" />
                            </Link>

                        </div>{/* end left column */}

                        <div className="lg:pl-8 xl:pl-12 w-full mt-4 lg:mt-0">
                            <div className="relative w-full max-w-[720px] mx-auto lg:ml-auto">
                                <div className="interactive bg-card p-3 shadow-elevated rounded-2xl relative">
                                    <div className="absolute -top-3.5 left-6 bg-card shadow-sm px-3 py-1.5 flex items-center gap-2 z-10 rounded-full">
                                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                        <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Live · PDB 6LU7</span>
                                    </div>
                                    <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-card">
                                        <Hero3D pdbId="6LU7" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-20 border-t border-border bg-background/80 backdrop-blur-sm relative">
                <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
                    <div className="max-w-2xl mb-12">
                        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary mb-2">How it works</p>
                        <h2 className="font-medium text-4xl text-foreground">Four steps, one pipeline.</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                        <HowStep n="1" title="Input" desc="Upload a PDB, paste a FASTA sequence, or fetch a UniProt structure. Add a ligand as SDF or SMILES." />
                        <HowStep n="2" title="Prepare" desc="Pick chains and heteroatoms to keep. Salidock cleans the protein for docking." />
                        <HowStep n="3" title="Configure" desc="Auto-detect top 5 cavities with wRRF consensus, or place a manual grid box." />
                        <HowStep n="4" title="Analyze" desc="Explore poses in an interactive 3D viewer with 2D interaction diagrams and per-pose downloads." />
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="py-20 relative">
                <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
                    <div className="max-w-2xl mb-12">
                        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary mb-2">Capabilities</p>
                        <h2 className="font-medium text-4xl text-foreground">Everything a docking run needs.</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Feature icon={Wand2} title="Single Dock" desc="Prepare a single protein-ligand pair, choose your pocket, and run docking simulation." />
                        <Feature icon={Target} title="Batch Dock" desc="Screen a library of multiple ligands against a target protein in a single automated run." />
                        <Feature icon={Rocket} title="GNINA Engine" desc="Deep learning CNN scoring engine with pose ranking, CNN score, and affinity prediction." />
                        <Feature icon={Play} title="Mol* 3D Viewer" desc="Rotate, section, and colour by chain, secondary structure, hydrophobicity, or element." />
                        <Feature icon={ArrowRight} title="2D Interactions" desc="Ligplot-style diagrams of every contact between ligand and pocket residues." />
                        <Feature icon={Rocket} title="AlphaFold-ready" desc="Predict structures from sequence or pull directly from UniProt in one click." />
                    </div>
                </div>
            </section>


            {/* CTA */}
            <section className="py-24 relative">
                <div className="max-w-[900px] mx-auto px-6 lg:px-12 text-center">
                    <h2 className="font-medium text-4xl md:text-5xl text-foreground">Ready to dock your first ligand?</h2>
                    <p className="mt-4 text-lg text-muted-foreground">Start a run in under a minute — no install, no queue.</p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            to="/dock"
                            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all shadow-glow"
                        >
                            <Wand2 size={16} aria-hidden="true" />
                            Single Dock
                        </Link>
                        <Link
                            to="/batch-dock"
                            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-border bg-background text-foreground font-semibold text-sm hover:border-primary/40 hover:text-primary transition-all"
                        >
                            <Target size={16} aria-hidden="true" />
                            Batch Dock
                        </Link>
                    </div>
                </div>
            </section>



            <Footer />

            </div>{/* end landing-content */}
        </div>
    );

export default Landing;
