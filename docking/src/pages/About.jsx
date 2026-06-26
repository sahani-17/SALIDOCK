import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useScrollAnimation } from "../hooks/useScrollAnimation";
import {
  Lightbulb,
  Target,
  Network,
  Users,
  GraduationCap,
  Briefcase,
  Zap,
  Quote,
  FlaskConical,
  History,
  Microscope,
  ClipboardList,
  Eye,
  Database,
  Factory,
  BookOpen
} from "lucide-react";
import { Mail, Linkedin, Globe, Github} from "lucide-react";

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
    setTransform(
      `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015,1.015,1.015)`,
    );
    setGlare({ x: x * 100, y: y * 100, opacity: 0.1 });
  };

  const handleMouseLeave = () => {
    setTransform(
      "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)",
    );
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
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, hsl(221 83% 53% / ${glare.opacity}), transparent 60%)`,
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
      style={{ background: "hsl(221 83% 53% / 0.05)" }}
    />
  );
};

const About = () => {
  const sections = [
    { id: "mission", label: "Our Mission", icon: Target },
    { id: "story", label: "Our Story", icon: History },
    { id: "what-we-do", label: "What We Do", icon: Microscope },
    { id: "team", label: "The Team", icon: Users },
    { id: "who-we-serve", label: "Who We Serve", icon: ClipboardList },
  ];
  const [activeSection, setActiveSection] = useState("mission");
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

    sections.forEach((s) => {
      const el = document.getElementById(s.id);
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
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <Navbar lightTheme />

      <aside className="hidden xl:flex fixed left-0 top-0 h-screen w-64 flex-col bg-white z-40 pt-24 border-r border-slate-100/50">
        <div className="w-full mt-6 pl-2">
          <h3 className="text-[10px] font-bold tracking-widest text-[#94a3b8] uppercase mb-4 pl-6">
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
                    ? "text-[#38bdf8] bg-slate-50/80" 
                    : "text-[#8BA1BA] hover:text-slate-600 hover:bg-slate-50/50"
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#38bdf8]" />
                  )}
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-[#38bdf8]" : "text-[#8BA1BA]"} />
                  {s.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="xl:pl-64">
        <main className="max-w-5xl mx-auto px-8 md:px-12 py-24 flex flex-col gap-32">
          {/* ─── OUR MISSION ─── */}
          <section id="mission" className="scroll-mt-32">
            <AnimatedSection>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-[2px] bg-[#38bdf8]" />
                <span className="text-[11px] font-bold tracking-widest text-[#38bdf8] uppercase">
                  01 / CORE PURPOSE
                </span>
              </div>
              <h1 className="text-4xl md:text-5xl font-medium text-slate-800 mb-6">
                Our Mission
              </h1>
              <h2 className="text-[22px] md:text-2xl font-bold text-[#0ea5e9] mb-10">
                Seamless, Rigorous, and Accessible Drug Discovery.
              </h2>
              
              <div className="relative p-8 md:p-10 border border-slate-200/80 rounded-sm bg-white mt-4">
                {/* Top left corner accent */}
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                <p className="text-slate-500 font-medium leading-[1.8] text-[15px] md:text-[16px]">
                  At SALIDOCK, we believe that computational drug discovery shouldn't be fragmented. We built this platform to solve a common frustration in cheminformatics: the time-consuming nature of molecular docking workflows. Our goal is to assemble the entire process into one unified platform, saving researchers valuable time and allowing them to focus on the science rather than the software.
                </p>
              </div>
            </AnimatedSection>
          </section>

          {/* ─── OUR STORY ─── */}
          <section id="story" className="scroll-mt-32">
            <AnimatedSection>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-[2px] bg-[#38bdf8]" />
                <span className="text-[11px] font-bold tracking-widest text-[#38bdf8] uppercase">
                  02 / GENESIS
                </span>
              </div>
              <h2 className="text-4xl md:text-[42px] font-medium text-slate-800 mb-12">
                Our Story: The "Lightbulb" Moment
              </h2>

              <div className="grid md:grid-cols-5 gap-12 lg:gap-16 items-start">
                <div className="md:col-span-2 flex flex-col gap-6 text-slate-500 font-medium leading-[1.8] text-[15px]">
                  <p>
                    What started as a minor project utilizing basic machine learning evolved into something far more significant. During a rigorous molecular docking workshop, our founding team realized that current tools lacked biophysical grounding and cross-platform synergy.
                  </p>
                  <p>
                    The transition from a "black box" ML approach to a biophysically grounded platform was our turning point. We realized that researchers needed transparency and precision that only integrated workflows could provide.
                  </p>
                </div>

                <div className="md:col-span-3 relative bg-slate-50/60 p-8 md:py-10 md:px-12 border-l-[3.5px] border-[#0ea5e9]">
                  {/* Faint big quote mark */}
                  <div className="absolute top-4 left-6 text-[100px] font-serif text-[#0ea5e9] opacity-[0.12] leading-none select-none">
                    "
                  </div>
                  <p className="relative z-10 text-lg md:text-[22px] font-bold italic text-[#1e293b] leading-relaxed pt-4">
                    "We moved away from fragmented tools and built a platform that integrates everything, allowing you to focus on the science."
                  </p>
                </div>
              </div>
            </AnimatedSection>
          </section>

          {/* ─── WHAT WE DO ─── */}
          <section id="what-we-do" className="scroll-mt-32">
            <AnimatedSection>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-[2px] bg-[#38bdf8]" />
                <span className="text-[11px] font-bold tracking-widest text-[#38bdf8] uppercase">
                  03 / CAPABILITIES
                </span>
              </div>
              <h2 className="text-4xl md:text-[42px] font-medium text-slate-800 mb-6">
                What We Do
              </h2>
              <h3 className="text-[20px] md:text-2xl font-bold text-[#0ea5e9] mb-12">
                Streamlining the Workflow
              </h3>

              <div className="grid md:grid-cols-3 gap-5 lg:gap-8 mb-12">
                {/* Card 1 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-white min-h-[220px]">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <Network className="w-6 h-6 text-[#0ea5e9] mb-6" strokeWidth={2.5} />
                  <h4 className="text-[15px] md:text-base font-bold text-slate-800 mb-3 block">Integrated Engine</h4>
                  <p className="text-slate-500 font-medium text-[13px] leading-[1.8]">
                    Seamlessly connecting the docking engine with advanced analytical modules.
                  </p>
                </div>

                {/* Card 2 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-white min-h-[220px]">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <Eye className="w-6 h-6 text-[#0ea5e9] mb-6" strokeWidth={2.5} />
                  <h4 className="text-[15px] md:text-base font-bold text-slate-800 mb-3 block">2D Visualization</h4>
                  <p className="text-slate-500 font-medium text-[13px] leading-[1.8]">
                    Real-time molecular rendering and 2D interaction mapping for immediate insights.
                  </p>
                </div>

                {/* Card 3 */}
                <div className="relative p-8 border border-slate-200/80 rounded-sm bg-white min-h-[220px]">
                  <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-[2.5px] border-l-[2.5px] border-[#0ea5e9]" />
                  <Database className="w-6 h-6 text-[#0ea5e9] mb-6" strokeWidth={2.5} />
                  <h4 className="text-[15px] md:text-base font-bold text-slate-800 mb-3 block">Dataset Handling</h4>
                  <p className="text-slate-500 font-medium text-[13px] leading-[1.8]">
                    Native support for PDBbind and large-scale cheminformatics datasets.
                  </p>
                </div>
              </div>

              {/* Bottom text block */}
              <div className="p-8 border border-slate-200/50 bg-slate-50/50 rounded-sm">
                <p className="text-slate-500 font-medium text-[14px] md:text-[15px] leading-[1.8]">
                  By eliminating technical bottlenecks and data fragmentation, SALIDOCK provides an end-to-end environment for molecular docking that is as powerful as it is intuitive.
                </p>
              </div>
            </AnimatedSection>
          </section>
        </main>


      {/* ─── THE TEAM ─── */}
      <section id="team" className="py-24 bg-white relative border-y border-slate-200">
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[180px] pointer-events-none opacity-20"
          style={{ background: "hsl(221 83% 53% / 0.12)" }}
        />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[150px] pointer-events-none opacity-10"
          style={{ background: "hsl(221 83% 53% / 0.08)" }}
        />

        <div className="max-w-5xl mx-auto px-8 md:px-12 relative z-10">
          <AnimatedSection className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-[2px] bg-[#38bdf8]" />
              <span className="text-[11px] font-bold tracking-widest text-[#38bdf8] uppercase">
                04 / LEADERSHIP
              </span>
            </div>
            <h2 className="text-4xl md:text-[42px] font-medium text-slate-800 mb-6">
              Behind the Vision of Salidock
            </h2>
            <p className="text-slate-500 font-bold text-[15px]">
              Built by students, guided by industry experts.
            </p>
          </AnimatedSection>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <AnimatedSection delay={100} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center h-full hover:border-blue-300 transition-colors shadow-sm">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-6 border-2 border-blue-200 bg-blue-50">
                    <img
                      src="/photo.png"
                      alt="Ahan Kumar Biswal"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <h3 className="font-bold text-xl mb-4">
                    Mr. Ahan Kumar Biswal
                  </h3>

                  {/* Social Icons */}
                  <div className="flex justify-center gap-4">
                    <a
                      href="mailto:ahanbiswal2003@gmail.com"
                      className="text-slate-500 hover:text-blue-600 transition"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Mail size={20} />
                    </a>

                    <a
                      href="https://www.linkedin.com/in/ahan-biswal-56a614333"
                      className="text-slate-500 hover:text-blue-600 transition"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Linkedin size={20} />
                    </a>

                    <a
                      href="https://github.com/Toxicvampire007"
                      className="text-slate-500 hover:text-blue-600 transition"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                       <Github size={20} />
                    </a>
                  </div>
                </div>
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={200} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center h-full hover:border-blue-300 transition-colors shadow-sm">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-6 border-2 border-blue-200 bg-blue-50">
                    <img
                      src="/photo2.png"
                      alt="Soumya Ranjan Sahani"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-bold text-xl mb-1">
                    Mr. Soumya Ranjan Sahani
                  </h3>

                  <div className="flex justify-center gap-4 mt-4">
                    <a
                      href="mailto:sahanisoumya356@gmail.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Mail size={20} />
                    </a>

                    <a
                      href="https://www.linkedin.com/in/soumya-ranjan-sahani-581874379"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Linkedin size={20} />
                    </a>

                    <a
                      href="https://github.com/sahani-17"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Github size={20} />
                    </a>
                  </div>
                </div>
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={200} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center h-full hover:border-blue-300 transition-colors shadow-sm">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-6 border-2 border-blue-200 bg-blue-50">
                    <img
                      src="/deep.jpeg"
                      alt="Deepan"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-bold text-xl mb-1">Mr. Deepan Balu</h3>

                  <div className="flex justify-center gap-4 mt-4">
                    <a
                      href="mailto:deepanbalud@gmail.com.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Mail size={20} />
                    </a>

                    <a
                      href="https://linkedin.com/in/deepan-balu"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Linkedin size={20} />
                    </a>

                    <a
                      href="https://github.com/deepan-codebuster"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Github size={20} />
                    </a>

                    <a
                      href="https://deepanbalu.vercel.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Globe size={20} />
                    </a>
                  </div>
                </div>
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={200} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center h-full hover:border-blue-300 transition-colors shadow-sm">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-6 border-2 border-blue-200 bg-blue-50">
                    <img
                      src="/alaka.png"
                      alt="Dr. Alaka Sahoo"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="font-bold text-xl mb-1">Dr. Alaka Sahoo</h3>

                  <div className="flex justify-center gap-4 mt-4">
                    <a
                      href="mailto:salixiras.bbsr@gmail.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Mail size={20} />
                    </a>

                    <a
                      href="https://www.linkedin.com/in/salixiras-research-private-limited/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Linkedin size={20} />
                    </a>

                    <a
                      href="https://salixirax.com/leadership"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                    >
                      <Globe size={20} />
                    </a>
                  </div>
                </div>
              </TiltCard>
            </AnimatedSection>

            <AnimatedSection delay={300} className="md:col-span-1">
              <TiltCard className="h-full">
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center h-full hover:border-blue-300 transition-colors relative overflow-hidden shadow-sm">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Lightbulb size={100} />
                  </div>
                  <div className="relative z-10">
                    <div className="w-24 h-24 mx-auto rounded-full overflow-hidden mb-6 border-2 border-blue-200 bg-blue-50">
                      <img
                        src="/Shasank.JPG.png"
                        alt="Dr. Shasank Sekhar Swain"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h3 className="font-bold text-xl mb-1">
                      Dr. Shasank Sekhar Swain
                    </h3>

                    <div className="flex justify-center gap-4 mt-4">
                      <a
                        href="mailto:salixiras.bbsr@gmail.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                      >
                        <Mail size={20} />
                      </a>

                      <a
                        href="https://www.linkedin.com/in/salixiras-research-private-limited/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                      >
                        <Linkedin size={20} />
                      </a>

                      <a
                        href="https://salixirax.com/leadership"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-blue-600 transition hover:scale-110"
                      >
                        <Globe size={20} />
                      </a>
                    </div>
                  </div>
                </div>
              </TiltCard>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* ─── WHO WE SERVE ─── */}
      <section id="who-we-serve" className="py-20 lg:py-24 bg-white scroll-mt-24">
        <div className="max-w-5xl mx-auto px-8 md:px-12 relative z-10">
          <AnimatedSection>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-[2px] bg-[#38bdf8]" />
              <span className="text-[11px] font-bold tracking-widest text-[#38bdf8] uppercase">
                05 / IMPACT
              </span>
            </div>
            <h2 className="text-4xl md:text-[42px] font-medium text-slate-800 mb-12">
              Who We Serve
            </h2>

            <div className="flex flex-col gap-6 w-full max-w-4xl">
              {/* Card 1 */}
              <div className="flex flex-col md:flex-row items-center md:items-center gap-8 p-8 md:px-10 md:py-8 border border-slate-200/80 bg-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-slate-50 to-transparent pointer-events-none -mr-16 -mt-16 transform rotate-12" />
                <div className="w-[72px] h-[72px] shrink-0 bg-[#e2e8f0]/40 flex items-center justify-center relative z-10">
                  <FlaskConical className="w-8 h-8 text-[#38bdf8]" strokeWidth={2} />
                </div>
                <div className="flex flex-col gap-2 relative z-10 text-center md:text-left">
                  <h3 className="text-[20px] md:text-[22px] font-bold text-slate-800 tracking-tight">Academic Researchers</h3>
                  <p className="text-slate-500 font-medium text-[14px] md:text-[15px] leading-[1.8]">
                    Conducting complex structural biology studies with confidence and reproducibility in a controlled computational environment.
                  </p>
                </div>
              </div>

              {/* Card 2 */}
              <div className="flex flex-col md:flex-row items-center md:items-center gap-8 p-8 md:px-10 md:py-8 border border-slate-200/80 bg-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-slate-50 to-transparent pointer-events-none -mr-16 -mt-16 transform rotate-12" />
                <div className="w-[72px] h-[72px] shrink-0 bg-[#e2e8f0]/40 flex items-center justify-center relative z-10">
                  <Factory className="w-8 h-8 text-[#38bdf8]" strokeWidth={2} />
                </div>
                <div className="flex flex-col gap-2 relative z-10 text-center md:text-left">
                  <h3 className="text-[20px] md:text-[22px] font-bold text-slate-800 tracking-tight">Industry Professionals</h3>
                  <p className="text-slate-500 font-medium text-[14px] md:text-[15px] leading-[1.8]">
                    Pharmaceutical teams looking to streamline and accelerate their drug discovery pipelines with enterprise-grade stability.
                  </p>
                </div>
              </div>

              {/* Card 3 */}
              <div className="flex flex-col md:flex-row items-center md:items-center gap-8 p-8 md:px-10 md:py-8 border border-slate-200/80 bg-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-slate-50 to-transparent pointer-events-none -mr-16 -mt-16 transform rotate-12" />
                <div className="w-[72px] h-[72px] shrink-0 bg-[#e2e8f0]/40 flex items-center justify-center relative z-10">
                  <BookOpen className="w-8 h-8 text-[#38bdf8]" strokeWidth={2} />
                </div>
                <div className="flex flex-col gap-2 relative z-10 text-center md:text-left">
                  <h3 className="text-[20px] md:text-[22px] font-bold text-slate-800 tracking-tight">Bioinformatics Students</h3>
                  <p className="text-slate-500 font-medium text-[14px] md:text-[15px] leading-[1.8]">
                    Needing an intuitive, all-in-one educational and research tool for learning computational docking and molecular exploration.
                  </p>
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

export default About;
