import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Upload, FlaskConical, Target, Zap, BarChart3, Dna, Eye, Network, GitCompareArrows, ArrowRight, ChevronDown,
} from "lucide-react";
import MatrixRain from "../components/MatrixRain";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useScrollAnimation } from "../hooks/useScrollAnimation";

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

/* ─── Animated count-up stat ─── */
const AnimatedCounter = ({ target, suffix = "", prefix = "" }) => {
  const { ref, isVisible } = useScrollAnimation(0.3);
  const [count, setCount] = useState(0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isVisible || hasAnimated.current) return;
    hasAnimated.current = true;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [isVisible, target]);

  return (
    <span ref={ref} className="text-4xl md:text-5xl font-black text-primary mb-1 tabular-nums font-mono-code">
      {prefix}{count}{suffix}
    </span>
  );
};

const StatCounter = ({ numericTarget, suffix, prefix, label, delay }) => {
  const { ref, isVisible } = useScrollAnimation(0.3);
  return (
    <div
      ref={ref}
      className="text-center transition-all duration-700 ease-out"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      <AnimatedCounter target={numericTarget} suffix={suffix} prefix={prefix} />
      <div className="text-sm text-muted-foreground mt-2 font-medium">{label}</div>
    </div>
  );
};

/* ─── Typewriter effect ─── */
const Typewriter = ({ text, className = "" }) => {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, 25);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span className={className}>
      {displayed}
      {!done && <span className="inline-block w-[2px] h-[1.1em] bg-primary ml-0.5 animate-pulse align-middle rounded-full" />}
    </span>
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
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transform, transition: "transform 0.3s ease-out" }}
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

/* ─── Terminal Preview ─── */
const terminalLines = [
  { type: "comment", text: "# Load protein structure" },
  { type: "cmd", text: "salidock load --pdb 1BNA.pdb" },
  { type: "output", text: "✓ Loaded 1BNA — 486 atoms, 24 residues" },
  { type: "cmd", text: "salidock detect-cavities --method fpocket" },
  { type: "output", text: "✓ Found 3 binding cavities (scores: 0.94, 0.87, 0.72)" },
  { type: "cmd", text: "salidock dock --ligand aspirin.smi --cavity 1" },
  { type: "output", text: "⟳ Running AutoDock Vina..." },
  { type: "output", text: "✓ Docking complete — Best ΔG: -8.3 kcal/mol" },
  { type: "cmd", text: "salidock export --format sdf --top 5" },
  { type: "output", text: "✓ Exported top 5 poses → results/poses.sdf" },
];

const TerminalPreview = () => {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= terminalLines.length) {
          setTimeout(() => setVisibleLines(0), 2000);
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 600);
    return () => clearInterval(timer);
  }, [visibleLines === 0]);

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm overflow-hidden shadow-2xl shadow-background/80">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/80">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive/60" />
          <div className="w-3 h-3 rounded-full bg-warning/60" />
          <div className="w-3 h-3 rounded-full bg-primary/60" />
        </div>
        <span className="text-xs text-muted-foreground font-mono-code ml-2">salidock — terminal</span>
      </div>
      {/* Terminal body */}
      <div className="p-5 h-[360px] overflow-hidden font-mono-code text-[13px] leading-relaxed space-y-1">
        {terminalLines.slice(0, visibleLines).map((line, i) => (
          <div
            key={i}
            className="animate-fade-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {line.type === "comment" && (
              <span className="text-muted-foreground/50">{line.text}</span>
            )}
            {line.type === "cmd" && (
              <div>
                <span className="text-primary">❯ </span>
                <span className="text-foreground/90">{line.text}</span>
              </div>
            )}
            {line.type === "output" && (
              <span className={`${line.text.startsWith("✓") ? "text-primary/80" : line.text.startsWith("⟳") ? "text-warning/80" : "text-muted-foreground"}`}>
                {"  "}{line.text}
              </span>
            )}
          </div>
        ))}
        {visibleLines < terminalLines.length && (
          <div>
            <span className="text-primary">❯ </span>
            <span className="inline-block w-[7px] h-[15px] bg-primary/70 animate-pulse rounded-sm" />
          </div>
        )}
      </div>
    </div>
  );
};

const features = [
  { icon: Dna, title: "AlphaFold Integration", desc: "Predict protein structures directly from sequence or UniProt ID" },
  { icon: FlaskConical, title: "SMILES Input", desc: "Generate 3D ligand structures from SMILES notation instantly" },
  { icon: Target, title: "Cavity Detection", desc: "AI-powered binding site detection with consensus scoring" },
  { icon: Zap, title: "Active-Site Docking", desc: "Pinpoint regions with manually defined XYZ coordinates for targeted docking" },
  { icon: Eye, title: "Interactive 3D Viewer", desc: "Mol*-powered visualization with multiple representations" },
  { icon: Network, title: "2D Interactions", desc: "Seamless generation of comprehensive 2D ligand-receptor interaction maps" },
  { icon: GitCompareArrows, title: "Pose Comparison", desc: "Side-by-side comparison of docking poses with shared residue analysis" },
];

/* ─── Feature Slider with drag + auto-scroll ─── */
const FeatureSlider = () => {
  const trackRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || isDragging || isPaused) return;
    const interval = setInterval(() => {
      track.scrollLeft += 0.5;
      if (track.scrollLeft >= track.scrollWidth / 2) {
        track.scrollLeft = 0;
      }
    }, 16);
    return () => clearInterval(interval);
  }, [isDragging, isPaused]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - (trackRef.current?.offsetLeft || 0));
    setScrollLeft(trackRef.current?.scrollLeft || 0);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !trackRef.current) return;
    e.preventDefault();
    const x = e.pageX - (trackRef.current.offsetLeft || 0);
    trackRef.current.scrollLeft = scrollLeft - (x - startX);
  };

  const handleEnd = () => setIsDragging(false);

  const handleTouchStart = (e) => {
    setIsDragging(true);
    setStartX(e.touches[0].pageX - (trackRef.current?.offsetLeft || 0));
    setScrollLeft(trackRef.current?.scrollLeft || 0);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || !trackRef.current) return;
    const x = e.touches[0].pageX - (trackRef.current.offsetLeft || 0);
    trackRef.current.scrollLeft = scrollLeft - (x - startX);
  };

  const duplicated = [...features, ...features, ...features];

  return (
    <section className="py-28 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center mb-16">
          <span className="inline-block text-xs font-semibold uppercase tracking-widest text-primary/70 mb-4">Capabilities</span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mb-4 tracking-tight">
            Powerful Features for Modern Research
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">Everything you need for molecular docking in one unified platform</p>
        </AnimatedSection>
      </div>

      <div
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => { setIsPaused(false); setIsDragging(false); }}
      >
        <div className="absolute left-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />

        <div
          ref={trackRef}
          className="flex gap-5 overflow-x-hidden cursor-grab active:cursor-grabbing px-6 select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleEnd}
        >
          {duplicated.map((f, i) => (
            <div
              key={`f-${i}`}
              className="group relative w-[380px] flex-shrink-0 rounded-2xl border border-border p-7 backdrop-blur-xl bg-card/60 hover:border-primary/30 hover:shadow-[0_0_50px_-15px_hsl(160_84%_39%_/_0.2)] transition-all duration-500 hover:-translate-y-1"
            >
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative z-10 pointer-events-none">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-5 group-hover:bg-primary/15 transition-all duration-500">
                  <f.icon size={22} strokeWidth={1.5} />
                </div>
                <h3 className="font-bold text-base text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      <CursorGlow />
      <Navbar />

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
        {/* Ambient glow orbs */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-[200px] pointer-events-none" style={{ background: "hsl(160 84% 39% / 0.06)" }} />

        <MatrixRain />

        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-7">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary border border-primary/20 bg-primary/5 rounded-full px-4 py-1.5 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Next-Gen Docking Software
          </span>
          <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto">
            <img src="/logo.png" alt="SaliDock 3D Logo" className="w-full h-auto object-contain drop-shadow-[0_0_30px_rgba(16,185,129,0.15)]" />
          </div>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed min-h-[3.5rem] mt-2">
            <Typewriter text="One platform to dock, visualize, and discover — no switching, no delays, just results." />
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-1">
            <a
              href="#methodologies"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-primary text-primary-foreground font-bold text-base hover:brightness-110 active:scale-[0.97] transition-all glow-emerald-lg"
            >
              Start Docking Now <ArrowRight size={18} />
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-border text-muted-foreground font-medium text-sm hover:text-foreground hover:border-primary/30 transition-all"
            >
              Learn More <ChevronDown size={16} />
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground/40">
          <ChevronDown size={20} className="animate-bounce" />
        </div>
      </section>


      {/* ─── FEATURES SLIDER ─── */}
      <div id="features">
        <FeatureSlider />
      </div>


      {/* ─── METHODOLOGIES ─── */}
      <section id="methodologies" className="py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-primary/70 mb-4">Methodologies</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-foreground mb-4 tracking-tight">Our Core Methodologies</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Choose the right simulation engine for your specific research goals</p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: Target,
                title: "Auto-Blind Docking",
                desc: "Leverage a powerful consensus of P2Rank and fpocket to automatically identify the most viable binding pockets across the entire protein surface. This mode is ideal for novel targets or orphan receptors where the binding site is uncharacterized, providing a data-driven starting point for de novo drug discovery",
                bullets: ["Site-specific ligand placement", "Induced fit simulation"],
                link: "/cavity",
                cta: "Configure Auto-Blind Docking",
              },
              {
                icon: Zap,
                title: "Active-Site Docking",
                desc: "Take full control by defining specific residues or XYZ coordinates for targeted docking. Designed for expert users with experimental data (X-ray, NMR) or known lead compounds, this mode bypasses site prediction to focus computational resources on a precise region for maximum accuracy and lead optimization.",
                bullets: ["Autonomous site detection", "Stochastic search algorithms"],
                link: "/active",
                cta: "Explore Active-Site Docking",
              },
            ].map((m) => (
              <AnimatedSection key={m.title}>
                <TiltCard className="h-full">
                  <div className="rounded-2xl bg-card border border-border p-8 hover:border-primary/25 hover:shadow-[0_0_50px_-15px_hsl(160_84%_39%_/_0.12)] transition-all duration-500 h-full flex flex-col">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-6">
                      <m.icon size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-3">{m.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-5">{m.desc}</p>

                    <Link
                      to={m.link}
                      className="mt-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all group"
                    >
                      {m.cta} <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </TiltCard>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>


      <Footer />
    </div>
  );
};

export default Landing;