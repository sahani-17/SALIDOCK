import React from "react";
import { Link } from "react-router-dom";
import { Play, Rocket, Wand2, Target, ArrowRight } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Hero3D from "../components/Hero3D";

const Feature = ({ icon, title, desc }) => {
    const Icon = icon;
    return (
        <div className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-elevated transition-all">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                <Icon size={18} className="text-primary" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
        </div>
    );
};

const HowStep = ({ n, title, desc }) => (
    <div className="relative">
        <div className="flex items-center gap-3 mb-2">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm flex items-center justify-center">{n}</span>
            <h3 className="font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed pl-11">{desc}</p>
    </div>
);

const Landing = () => (
    <div className="min-h-screen bg-background relative overflow-hidden font-sans z-0 flex flex-col">
            <div
                className="absolute inset-0 -z-10 opacity-60"
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)',
                    backgroundSize: '40px 40px',
                }}
                aria-hidden="true"
            />

            <Navbar />

            {/* Hero */}
            <section className="pt-32 pb-20 relative z-10">
                <div className="max-w-[1300px] mx-auto w-full px-6 lg:px-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <div className="flex flex-col">
                            <h1 className="font-display text-5xl md:text-6xl lg:text-[64px] leading-[1.05] text-foreground">
                                Docking that respects
                                <br />
                                <em className="italic text-primary">the science.</em>
                            </h1>

                            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-[540px]">
                                Salidock runs the full pipeline — protein preparation, wRRF consensus cavity detection, AutoDock Vina scoring — with an interactive Mol* viewer for every pose.
                            </p>

                            <div className="mt-8 flex flex-wrap items-center gap-3">
                                <Link
                                    to="/dock"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all shadow-glow"
                                >
                                    <Wand2 size={16} aria-hidden="true" />
                                    Auto-Blind Docking
                                </Link>
                                <Link
                                    to="/dock?mode=active"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border text-foreground font-semibold text-sm hover:border-primary/40 hover:text-primary transition-all"
                                >
                                    <Target size={16} aria-hidden="true" />
                                    Active-Site Docking
                                </Link>
                            </div>
                            <Link
                                to="/docs"
                                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors self-start"
                            >
                                Read the docs
                                <ArrowRight size={14} aria-hidden="true" />
                            </Link>

                            <div className="mt-12 pt-6 border-t border-border grid grid-cols-3 gap-6 max-w-[560px]">
                                <div>
                                    <p className="font-display text-2xl text-foreground">Vina</p>
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">Scoring engine</p>
                                </div>
                                <div>
                                    <p className="font-display text-2xl text-foreground">wRRF</p>
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">Cavity consensus</p>
                                </div>
                                <div>
                                    <p className="font-display text-2xl text-foreground">AlphaFold</p>
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mt-0.5">Structure input</p>
                                </div>
                            </div>
                        </div>

                        <div className="lg:pl-8 xl:pl-12 w-full mt-4 lg:mt-0">
                            <div className="relative w-full max-w-[720px] mx-auto lg:ml-auto">
                                <div className="absolute -top-4 -left-4 w-16 h-16 border-t border-l border-border pointer-events-none" aria-hidden="true" />
                                <div className="absolute -bottom-4 -right-4 w-16 h-16 border-b-2 border-r-2 border-primary pointer-events-none" aria-hidden="true" />
                                <div className="bg-card p-3 shadow-elevated rounded-2xl border border-border relative">
                                    <div className="absolute -top-3.5 left-6 bg-card border border-border shadow-sm px-3 py-1.5 flex items-center gap-2 z-10 rounded-full">
                                        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                        <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Live · PDB 1STP</span>
                                    </div>
                                    <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-muted">
                                        <Hero3D pdbId="1STP" />
                                    </div>
                                </div>
                                <p className="mt-4 text-xs text-muted-foreground text-center">
                                    Streptavidin bound to biotin — the same Mol* engine that powers every result.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-20 border-t border-border bg-card/40 relative z-10">
                <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
                    <div className="max-w-2xl mb-12">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary mb-2">How it works</p>
                        <h2 className="font-display text-4xl text-foreground">Four steps, one pipeline.</h2>
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
            <section className="py-20 relative z-10">
                <div className="max-w-[1200px] mx-auto px-6 lg:px-12">
                    <div className="max-w-2xl mb-12">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary mb-2">Capabilities</p>
                        <h2 className="font-display text-4xl text-foreground">Everything a docking run needs.</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Feature icon={Wand2} title="Auto-Blind Docking" desc="wRRF consensus finds the top 5 cavities automatically — no guessing where the pocket is." />
                        <Feature icon={Target} title="Active-Site Docking" desc="Place a grid box by coordinate or auto-center on the protein for targeted runs." />
                        <Feature icon={Rocket} title="AutoDock Vina" desc="Battle-tested scoring engine with pose ranking, RMSD, and binding affinity." />
                        <Feature icon={Play} title="Mol* 3D Viewer" desc="Rotate, section, and colour by chain, secondary structure, hydrophobicity, or element." />
                        <Feature icon={ArrowRight} title="2D Interactions" desc="Ligplot-style diagrams of every contact between ligand and pocket residues." />
                        <Feature icon={Rocket} title="AlphaFold-ready" desc="Predict structures from sequence or pull directly from UniProt in one click." />
                    </div>
                </div>
            </section>


            {/* CTA */}
            <section className="py-24 relative z-10">
                <div className="max-w-[900px] mx-auto px-6 lg:px-12 text-center">
                    <h2 className="font-display text-4xl md:text-5xl text-foreground">Ready to dock your first ligand?</h2>
                    <p className="mt-4 text-lg text-muted-foreground">Start a run in under a minute — no install, no queue.</p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <Link
                            to="/dock"
                            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all shadow-glow"
                        >
                            <Wand2 size={16} aria-hidden="true" />
                            Auto-Blind Docking
                        </Link>
                        <Link
                            to="/dock?mode=active"
                            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-border text-foreground font-semibold text-sm hover:border-primary/40 hover:text-primary transition-all"
                        >
                            <Target size={16} aria-hidden="true" />
                            Active-Site Docking
                        </Link>
                    </div>
                </div>
            </section>



            <Footer />
        </div>
    );

export default Landing;
