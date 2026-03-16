import React, { useRef, useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import { Lightbulb, Target, Network, Users, GraduationCap, Briefcase, Zap, Quote, FlaskConical } from "lucide-react";

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

const About = () => {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <CursorGlow />
      <Navbar />

      {/* ─── HERO: Our Mission ─── */}
      <section className="relative pt-32 pb-20 overflow-hidden min-h-[60vh] flex items-center">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full blur-[150px] pointer-events-none opacity-40" style={{ background: "hsl(160 84% 39% / 0.08)" }} />
        
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10 text-center">
          <AnimatedSection>
            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary mb-6">
              <Target size={16} /> Our Mission
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-8 leading-[1.1]">
              Seamless, Rigorous, and Accessible Drug Discovery.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              At SALIDOCK, we believe that computational drug discovery shouldn't be fragmented. We built this platform to solve a common frustration in cheminformatics: the time-consuming nature of molecular docking workflows. 
              Our goal is to assemble the entire process into one unified platform, saving researchers valuable time and allowing them to focus on the science rather than the software.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* ─── STORY: The "Lightbulb" Moment ─── */}
      <section className="py-24 relative bg-card/20 border-y border-border backdrop-blur-sm">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0iIzIyMiIgZmlsbC1vcGFjaXR5PSIwLjUiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <AnimatedSection>
              <div className="relative">
                <Lightbulb size={48} className="text-primary/20 absolute -top-6 -left-6" />
                <h2 className="text-3xl lg:text-4xl font-black mb-6 relative z-10">Our Story: <br/><span className="text-primary">The "Lightbulb" Moment</span></h2>
                <div className="space-y-6 text-muted-foreground leading-relaxed">
                  <p>
                    The journey of SALIDOCK is rooted in scientific curiosity and the willingness to learn from mistakes. The project initially began as our undergraduate minor project, where we attempted to predict Drug-Target Interactions (DTI) solely using machine learning models.
                  </p>
                  <p>
                    However, attending a molecular docking workshop sparked a crucial "lightbulb" moment for us. We realized that our purely data-driven ML approach lacked the necessary biophysical grounding—what we were doing wasn't scientifically robust enough for real-world application.
                  </p>
                  <p>
                    Recognizing this gap, we sought out our mentor, and our project pivoted in an entirely new, structure-based direction. We moved away from fragmented tools and began developing a platform that integrates everything from robust pocket prediction to comprehensive interaction analysis.
                  </p>
                </div>
              </div>
            </AnimatedSection>
            <AnimatedSection delay={200}>
              <TiltCard>
                <div className="relative rounded-2xl overflow-hidden glass border border-border p-1 bg-gradient-to-b from-card/80 to-background/40 h-full">
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-transparent opacity-50" />
                  <div className="p-10 flex flex-col items-center justify-center text-center h-full min-h-[350px]">
                    <Quote size={40} className="text-primary/30 mb-6" />
                    <p className="text-xl md:text-2xl font-semibold italic text-foreground tracking-tight leading-snug">
                      "We moved away from fragmented tools and built a platform that integrates everything, allowing you to focus on the science."
                    </p>
                  </div>
                </div>
              </TiltCard>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ─── WHAT WE DO ─── */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <AnimatedSection>
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-primary/70 mb-4">What We Do</span>
            <h2 className="text-3xl lg:text-4xl font-black mb-8">Streamlining the Workflow</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Traditional docking forces researchers to juggle multiple disparate tools to get results. 
              <span className="text-foreground font-semibold"> SALIDOCK eliminates this bottleneck.</span> By integrating the core docking engine with built-in features for visualizing 2D ligand-receptor interactions, we provide a complete, end-to-end solution. Whether you are benchmarking against complex datasets like PDBbind or running high-throughput screens, SALIDOCK is designed to handle it effortlessly.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* ─── THE TEAM ─── */}
      <section className="py-24 bg-card/10 relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[180px] pointer-events-none opacity-20" style={{ background: "hsl(160 84% 39% / 0.15)" }} />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[150px] pointer-events-none opacity-10" style={{ background: "hsl(160 84% 39% / 0.1)" }} />
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-black mb-4">The Team Behind SaliDock</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Built by students, guided by industry experts.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <AnimatedSection delay={100} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-8 text-center h-full hover:border-primary/30 transition-colors">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-6 border-2 border-primary/20 bg-primary/5">
                    <img src="/photo.png" alt="Ahan Kumar Biswal" className="w-full h-full object-cover" />
                  </div>
                  <h3 className="font-bold text-xl mb-1">Ahan Kumar Biswal</h3>
                  <p className="text-sm text-primary mb-4 font-semibold">Lead Developer</p>
                  <p className="text-sm text-muted-foreground">Pursuing MSc in Bioinformatics, building robust backend architectures and sleek UI designs.</p>
                </div>
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={200} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-8 text-center h-full hover:border-primary/30 transition-colors">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-6 border-2 border-primary/20 bg-primary/5">
                    <img src="/photo2.png" alt="Soumya Ranjan Sahani" className="w-full h-full object-cover" />
                  </div>
                  <h3 className="font-bold text-xl mb-1">Soumya Ranjan Sahani</h3>
                  <p className="text-sm text-primary mb-4 font-semibold">Lead Researcher</p>
                  <p className="text-sm text-muted-foreground">Pursuing MSc in Bioinformatics, focusing on molecular dynamics and scientific validation.</p>
                </div>
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={300} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-8 text-center h-full hover:border-primary/30 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Lightbulb size={100} />
                  </div>
                  <div className="relative z-10">
                    <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-6 text-primary border border-primary/20">
                      <Zap size={32} />
                    </div>
                    <h3 className="font-bold text-xl mb-1">Dr. Shasank Sekhar Swain</h3>
                    <p className="text-sm text-primary mb-4 font-semibold">Mentor & Funder</p>
                    <p className="text-sm text-muted-foreground">
                      Founder of <span className="text-foreground font-semibold">Salixiras Pvt. Ltd.</span> His expert guidance transformed SALIDOCK from a student project to an industry-ready tool.
                    </p>
                  </div>
                </div>
              </TiltCard>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ─── WHO WE SERVE ─── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-black mb-4">Who We Serve</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">SALIDOCK is built for anyone whose work relies on accurate molecular docking.</p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: FlaskConical,
                title: "Academic Researchers",
                desc: "Conducting complex structural biology studies with confidence and reproducibility.",
              },
              {
                icon: Briefcase,
                title: "Industry Professionals",
                desc: "Pharmaceutical teams looking to streamline and accelerate their drug discovery pipelines.",
              },
              {
                icon: GraduationCap,
                title: "Bioinformatics Students",
                desc: "Needing an intuitive, all-in-one educational and research tool for learning and exploration.",
              },
            ].map((role, i) => (
              <AnimatedSection key={i} delay={i * 150}>
                <div className="group rounded-2xl p-6 bg-card border border-border hover:border-primary/40 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-5 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                    <role.icon size={22} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{role.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{role.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
