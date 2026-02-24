import React, { useEffect, useState } from 'react';
import Logo from '../assets/logo.png'

const Landing = () => {
  const [rotation, setRotation] = useState(0);
  const [ligandProgress, setLigandProgress] = useState(0);
  const [logoError, setLogoError] = useState(false);


  // Animation loop for rotation and ligand movement
  useEffect(() => {
    let frameId;
    const animate = () => {
      setRotation(prev => (prev + 1) % 360);
      // Ligand moves in a loop (approaching and docking)
      setLigandProgress(prev => (prev + 0.005) % 1);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Configuration - Increased widths to fill center space better
  const basePairCount = 20;
  const helixHeight = 650;
  const helixWidth = 180;
  const verticalSpacing = helixHeight / basePairCount;

  // Choose index 8 as the "Binding Pocket"
  const bindingSiteIndex = 8;

  return (
    // bg-gradient-to-br from-[#0a1628] via-[#1a3a52] to-[#2d5a7b]
    <div className="flex flex-col md:flex-row items-center justify-around min-h-screen bg-slate-950 overflow-hidden px-8 md:px-16 lg:px-24 relative">

      {/* TOP LEFT LOGO AREA */}
      <div className="absolute top-8 left-8 md:left-12 flex items-center gap-4 z-50">
        <div className="relative h-28 flex items-center">
          {!logoError ? (
            <img
              src={Logo}
              alt="Salidock Logo"
              className="h-full w-auto object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center rotate-45">
                <div className="-rotate-45 text-white font-bold">S</div>
              </div>
              <span className="text-white font-black tracking-widest text-xl">SALIDOCK</span>
            </div>
          )}
        </div>
      </div>

      {/* LEFT SIDE: DNA ANIMATION */}
      <div
        className="relative py-10 flex items-center justify-center"
        style={{
          width: `${helixWidth + 100}px`,
          height: `${helixHeight}px`,
          perspective: '1200px',
          // Added a 12-degree tilt to the right from the top
          transform: 'rotate(55deg)'
        }}
      >
        {[...Array(basePairCount)].map((_, i) => {
          const angleOffset = i * 25;
          const currentAngle = (rotation + angleOffset) * (Math.PI / 180);

          const xPos = Math.sin(currentAngle) * (helixWidth / 2);
          const zIndex = Math.round(Math.cos(currentAngle) * 100);
          const depthScale = 0.6 + (Math.cos(currentAngle) + 1) * 0.2;
          const opacity = 0.3 + (Math.cos(currentAngle) + 1) * 0.35;
          const isEven = i % 2 === 0;

          const isBindingPocket = i === bindingSiteIndex;

          return (
            <div
              key={i}
              className="absolute w-full flex items-center justify-center transition-all duration-75"
              style={{
                top: `${i * verticalSpacing}px`,
                transform: `scale(${depthScale})`,
                zIndex: zIndex,
                opacity: opacity
              }}
            >
              {/* Highlight Binding Pocket */}
              {isBindingPocket && (
                <div className="absolute inset-0 -m-4 border-2 border-dashed border-yellow-400/40 rounded-xl animate-pulse flex items-center justify-end">
                  <span className="absolute -right-36 text-[10px] uppercase tracking-widest text-yellow-400 font-bold bg-yellow-400/10 px-2 py-1 rounded">
                    Binding Pocket
                  </span>
                </div>
              )}

              {/* Left Backbone Node */}
              <div
                className={`absolute w-5 h-5 rounded-full bg-gradient-to-br from-blue-300 to-blue-700 shadow-[0_0_15px_rgba(59,130,246,0.6)] ${isBindingPocket ? 'ring-2 ring-yellow-400' : ''}`}
                style={{ transform: `translateX(${xPos}px)` }}
              />

              {/* Connecting Base Pair Rung */}
              <div
                className="h-1.5 flex overflow-hidden rounded-full shadow-sm"
                style={{
                  width: `${Math.abs(xPos * 2)}px`,
                  background: isBindingPocket
                    ? `linear-gradient(to right, #fbbf24, #f59e0b)`
                    : `linear-gradient(to right, ${isEven ? '#22d3ee' : '#a855f7'} 50%, ${isEven ? '#2563eb' : '#ec4899'} 50%)`
                }}
              />

              {/* Right Backbone Node */}
              <div
                className={`absolute w-5 h-5 rounded-full bg-gradient-to-br from-blue-300 to-blue-700 shadow-[0_0_15px_rgba(59,130,246,0.6)] ${isBindingPocket ? 'ring-2 ring-yellow-400' : ''}`}
                style={{ transform: `translateX(${-xPos}px)` }}
              />

              {/* Ligand Animation */}
              {isBindingPocket && (
                <div
                  className="absolute"
                  style={{
                    transform: `translateX(${(1 - ligandProgress) * -250 + xPos}px) scale(${0.5 + ligandProgress * 0.5})`,
                    opacity: ligandProgress > 0.8 ? 1 : ligandProgress,
                    zIndex: 200
                  }}
                >
                  <div className="relative group">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full shadow-[0_0_25px_#fbbf24] border border-white/50 animate-bounce" />
                    <span className="absolute -top-10 -left-4 text-xs text-yellow-300 font-bold whitespace-nowrap">
                      Ligand
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* RIGHT SIDE: CONTENT */}
      <div className="flex-1 max-w-3xl text-right flex flex-col items-end justify-center py-10 lg:pl-20">
        <div className="space-y-4">
          <p className="text-blue-400 font-semibold tracking-[0.4em] uppercase text-sm mb-6">
            Welcome to
          </p>
          <h1 className="text-7xl md:text-8xl lg:text-9xl font-black text-white tracking-tighter leading-none">
            SALI<span className='text-[#a8d54f]'>DOCK</span>
          </h1>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-slate-300 tracking-tight leading-tight max-w-xl ml-auto">
            Your Molecular Docking Solution
          </h2>
        </div>

        <div className="mt-5 h-[2px] w-64 bg-gradient-to-l from-blue-500 to-transparent"></div>

        <p className="mt-5 text-slate-400 text-xl lg:text-2xl max-w-lg font-light leading-relaxed">
          Advanced computational modeling for drug discovery and structural biology.
        </p>

        {/* ACTION BUTTONS */}
        <div className="mt-5 flex flex-col sm:flex-row md:flex-row gap-6">
          <a href="/cavity"><button className="hover:cursor-pointer px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all duration-300 font-bold text-lg shadow-xl shadow-blue-900/30 active:scale-95 border border-blue-400/30 whitespace-nowrap">
            Cavity-Based Blind Docking
          </button></a>

          <a href="/active"><button className="hover:cursor-pointer px-10 py-4 bg-transparent hover:bg-blue-900/20 text-blue-300 rounded-full transition-all duration-300 font-bold text-lg border-2 border-blue-500/30 active:scale-95 whitespace-nowrap">
            Active - Site Docking
          </button></a>
        </div>
      </div>

      {/* Legend / Info */}
      <div className="absolute bottom-10 left-10 text-slate-400 text-xs border-l border-slate-800 pl-4 hidden xl:block">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
          <span>Small Molecule Ligand</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border border-dashed border-yellow-400"></div>
          <span>Target Binding Pocket</span>
        </div>
      </div>

      {/* Background Decorative Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[600px] h-[800px] bg-blue-600/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-0 right-0 w-[700px] h-[700px] bg-blue-900/15 blur-[180px] rounded-full"></div>
      </div>
    </div>
  );
};

export default Landing;