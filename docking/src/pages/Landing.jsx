import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Play, Rocket } from "lucide-react";
import Navbar from "../components/Navbar";
import promoVideo from "../assets/Salidock Promo.mp4";

const StatItem = ({ value, label }) => (
  <div className="flex flex-col gap-1.5">
    <div className="text-[#0ea5e9] font-medium text-[13px] md:text-[14px] tracking-tight">{value}</div>
    <div className="text-[10px] md:text-[11px] tracking-widest text-[#94a3b8] font-medium uppercase">{label}</div>
  </div>
);

const DemoPanel = ({ isPlaying, setIsPlaying }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (isPlaying && videoRef.current) {
      videoRef.current.play().catch(() => {});
    } else if (!isPlaying && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  return (
    <div className="relative w-full max-w-[750px] mx-auto lg:ml-auto">
      {/* Decorative corner accents */}
      <div className="absolute -top-6 -left-6 w-16 h-16 border-t border-l border-slate-200 pointer-events-none" />
      <div className="absolute -bottom-6 -right-6 w-16 h-16 border-b-2 border-r-2 border-[#0ea5e9] pointer-events-none" />

      {/* Main Frame */}
      <div className="bg-white p-3 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] relative">
        
        {/* Top Badges */}
        <div className="absolute -top-3.5 left-6 bg-white border border-slate-100 shadow-sm px-3 py-1.5 flex items-center gap-2 z-10">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] font-bold tracking-widest text-[#94a3b8] uppercase">WATCH_DEMO</span>
        </div>
        
        <div className="absolute -top-3.5 right-6 bg-white border border-slate-100 shadow-sm px-3 py-1.5 z-10 hidden sm:block">
          <span className="text-[10px] font-bold tracking-widest text-[#94a3b8] uppercase">RESOLUTION: 4K_UHD</span>
        </div>

        {/* Video Wrapper */}
        <div className="relative aspect-[16/10]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            controls={isPlaying}
            playsInline
            muted={!isPlaying}
            loop
          >
            <source src={promoVideo} type="video/mp4" />
          </video>

          {!isPlaying && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <button
                type="button"
                onClick={() => setIsPlaying(true)}
                className="w-[72px] h-[72px] rounded-[20px] bg-[#0ea5e9] text-white flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-[#0ea5e9]/30"
              >
                <Play className="w-8 h-8 ml-1" fill="currentColor" />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

const Landing = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDockingOptions, setShowDockingOptions] = useState(false);

  return (
    <div className="min-h-screen bg-[#fafbfc] relative overflow-hidden pt-24 font-inter z-0">
      {/* Dotted Grid Background */}
      <div 
        className="absolute inset-0 -z-10" 
        style={{ 
          backgroundImage: 'radial-gradient(circle at 1px 1px, #e2e8f0 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} 
      />

      <Navbar lightTheme />

      <section className="flex items-center min-h-[calc(100vh-6rem)] relative z-10 py-12">
        <div className="max-w-[1300px] mx-auto w-full px-6 lg:px-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 items-center">
            
            {/* Left Column - Text Content */}
            <div className="flex flex-col">
              <h1 className="text-[2.5rem] md:text-5xl lg:text-[42px] leading-[1.15] text-slate-900 tracking-tight">
                <span className="font-bold text-[#0f172a]">SALIDOCK :</span> <span className="font-semibold text-[#1e293b]">Next-Generation</span>
                <br />
                <span className="font-bold text-[#0ea5e9] mt-1 inline-block">Molecular Docking</span>
              </h1>

              <p className="mt-8 text-[15px] md:text-[17px] text-slate-600 leading-relaxed max-w-[540px]">
                Experience seamless computational biology workflows. Automate your
                docking, predict cavities with high precision, and visualize
                interactions in one integrated platform.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4 relative z-20">
                <button
                  type="button"
                  onClick={() => setShowDockingOptions(true)}
                  className="inline-flex items-center gap-2.5 px-8 py-4 bg-[#0ea5e9] text-white font-bold text-[13px] tracking-widest uppercase hover:bg-[#0284c7] transition-colors"
                >
                  <Rocket size={18} fill="currentColor" />
                  START DOCKING
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowDockingOptions(!showDockingOptions)}
                    className={"inline-flex items-center justify-between gap-12 px-6 py-4 bg-white border text-slate-700 font-bold text-[13px] tracking-widest uppercase hover:bg-slate-50 transition-colors min-w-[200px] " + (showDockingOptions ? "border-slate-300 shadow-sm" : "border-slate-200")}
                  >
                    <span>SELECT MODE</span>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-colors duration-300 ${showDockingOptions ? 'text-[#0ea5e9]' : ''}`}>
                      <polyline points="2 12 6 12 10 18 14 6 18 12 22 12" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showDockingOptions && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-white border border-slate-200 shadow-xl py-1 flex flex-col z-30 opacity-100 transition-opacity">
                      <Link
                        to="/active"
                        className="px-5 py-3.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0ea5e9] transition-colors flex items-center gap-3 border-b border-slate-100"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        Active Site Docking
                      </Link>
                      <Link
                        to="/cavity"
                        className="px-5 py-3.5 text-[13px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0ea5e9] transition-colors flex items-center gap-3"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0ea5e9]" />
                        Auto-Blind Docking
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Section */}
              <div className="mt-16 pt-8 border-t border-slate-200/80 grid grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-[600px]">
                <StatItem 
                  value="99.8% RMSD PRECISION" 
                  label="GEOMETRIC ACCURACY" 
                />
                <StatItem 
                  value="1.2ms LATENCY SPEED" 
                  label="COMPUTATION TIME" 
                />
                <StatItem 
                  value="10k+ LIGAND LIBRARY" 
                  label="MOLECULAR DATABASE" 
                />
              </div>
            </div>

            {/* Right Column - Video Info */}
            <div className="lg:pl-8 xl:pl-12 w-full mt-10 lg:mt-0">
              <DemoPanel isPlaying={isPlaying} setIsPlaying={setIsPlaying} />
            </div>
            
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
