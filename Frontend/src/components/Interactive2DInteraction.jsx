import React, { useState } from 'react';
import { Sparkles, Eye, Info, Check, Filter, Layers } from 'lucide-react';

const RESIDUES = [
  { id: 'asp128', name: 'ASP 128', role: 'Pocket Wall', type: 'H-Bond', color: '#10b981', distance: '2.7 Å', energy: '-2.1 kcal/mol', x: 120, y: 80, lx: 210, ly: 150 },
  { id: 'ser45', name: 'SER 45', role: 'Backbone H-Bond', type: 'H-Bond', color: '#10b981', distance: '2.9 Å', energy: '-1.8 kcal/mol', x: 380, y: 85, lx: 290, ly: 150 },
  { id: 'trp108', name: 'TRP 108', role: 'Aromatic Pocket Base', type: 'Pi-Stacking', color: '#a855f7', distance: '3.4 Å', energy: '-2.4 kcal/mol', x: 420, y: 230, lx: 310, ly: 220 },
  { id: 'arg84', name: 'ARG 84', role: 'Charged Pocket Entrance', type: 'Salt Bridge', color: '#3b82f6', distance: '3.1 Å', energy: '-3.2 kcal/mol', x: 360, y: 350, lx: 280, ly: 270 },
  { id: 'tyr83', name: 'TYR 83', role: 'Hydrophobic Pocket Lip', type: 'H-Bond', color: '#10b981', distance: '2.8 Å', energy: '-1.9 kcal/mol', x: 140, y: 340, lx: 220, ly: 270 },
  { id: 'val125', name: 'VAL 125', role: 'Hydrophobic Floor', type: 'Hydrophobic', color: '#f59e0b', distance: '3.8 Å', energy: '-1.2 kcal/mol', x: 80, y: 210, lx: 190, ly: 210 },
];

export default function Interactive2DInteraction() {
  const [hoveredResidue, setHoveredResidue] = useState(null);
  const [selectedResidue, setSelectedResidue] = useState(null);
  const [filterType, setFilterType] = useState('ALL');
  const [showDistances, setShowDistances] = useState(true);
  const [showCavitySurface, setShowCavitySurface] = useState(true);

  const activeResidue = hoveredResidue || selectedResidue;

  const filteredResidues = RESIDUES.filter(r => {
    if (filterType === 'HBOND') return r.type === 'H-Bond';
    if (filterType === 'HYDROPHOBIC') return r.type === 'Hydrophobic' || r.type === 'Pi-Stacking';
    return true;
  });

  return (
    <div className="w-full bg-card/90 border border-border/80 rounded-2xl shadow-elevated overflow-hidden flex flex-col backdrop-blur-md">
      {/* Header Controls Bar */}
      <div className="px-4 py-3 bg-muted/40 border-b border-border/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">Interactive 2D Cavity & Ligand Contact Map</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-primary/10 text-primary border border-primary/20">
            wRRF Cavity #1
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCavitySurface(!showCavitySurface)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
              showCavitySurface ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-background border-border text-muted-foreground'
            }`}
          >
            {showCavitySurface ? 'Cavity Pocket: ON' : 'Cavity Pocket: OFF'}
          </button>

          <div className="flex bg-background border border-border rounded-lg p-0.5 text-[11px]">
            {['ALL', 'HBOND', 'HYDROPHOBIC'].map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterType(mode)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  filterType === mode ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {mode === 'ALL' ? 'All Contacts' : mode === 'HBOND' ? 'H-Bonds' : 'Hydrophobic'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowDistances(!showDistances)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
              showDistances ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-background border-border text-muted-foreground'
            }`}
          >
            {showDistances ? 'Distances: ON' : 'Distances: OFF'}
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative aspect-[16/10] w-full bg-gradient-to-b from-background to-card/50 flex items-center justify-center p-2 select-none overflow-hidden">
        <svg viewBox="0 0 500 400" className="w-full h-full max-h-[380px] overflow-visible">
          <defs>
            <filter id="glow-primary" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <linearGradient id="cavityGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Smooth W-RRF Surface Cavity Pocket Contour */}
          {showCavitySurface && (
            <g className="transition-all duration-500">
              <path
                d="M 120 80 Q 250 40 380 85 Q 450 160 420 230 Q 400 320 360 350 Q 250 390 140 340 Q 60 280 80 210 Q 70 120 120 80 Z"
                fill="url(#cavityGrad)"
                stroke="hsl(var(--primary))"
                strokeWidth="1.5"
                strokeDasharray="6 4"
                opacity="0.8"
              />
              <text x="250" y="65" textAnchor="middle" fill="hsl(var(--primary))" fontSize="10" fontWeight="extrabold" letterSpacing="1.5" opacity="0.7">
                wRRF CONSENSUS CAVITY BOUNDARY
              </text>
            </g>
          )}

          {/* Non-Covalent Interaction Lines */}
          {filteredResidues.map((res) => {
            const isHovered = activeResidue?.id === res.id;
            const midX = (res.x + res.lx) / 2;
            const midY = (res.y + res.ly) / 2;

            return (
              <g key={`link-${res.id}`}>
                <line
                  x1={res.x}
                  y1={res.y}
                  x2={res.lx}
                  y2={res.ly}
                  stroke={res.color}
                  strokeWidth={isHovered ? 3.5 : 2}
                  strokeDasharray={res.type === 'H-Bond' ? '5 4' : res.type === 'Salt Bridge' ? '8 4' : '2 2'}
                  opacity={isHovered ? 1 : 0.7}
                  className="transition-all duration-300"
                />

                {/* Distance Label Badge */}
                {showDistances && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x="-18"
                      y="-9"
                      width="36"
                      height="18"
                      rx="4"
                      fill="hsl(var(--card))"
                      stroke={res.color}
                      strokeWidth="1"
                      opacity="0.9"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill="hsl(var(--foreground))"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {res.distance}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Central Ligand Molecule representation */}
          <g transform="translate(250, 210)" className="cursor-pointer">
            {/* Ligand Outer Pocket Glow Ring */}
            <circle r="65" fill="hsl(var(--primary) / 0.08)" stroke="hsl(var(--primary) / 0.25)" strokeWidth="1.5" strokeDasharray="4 4" />
            <circle r="48" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />
            
            {/* Chemical Core Structure Visual */}
            <path
              d="M-20,-12 L0,-24 L20,-12 L20,12 L0,24 L-20,12 Z"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path
              d="M-10,-5 L0,-12 L10,-5 L10,5 L0,12 L-10,5 Z"
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1.5"
              opacity="0.6"
            />
            <circle cx="0" cy="0" r="4" fill="hsl(var(--primary))" />

            {/* Heteroatom Labels */}
            <text x="-25" y="-15" fill="#ef4444" fontSize="10" fontWeight="bold">O</text>
            <text x="22" y="-15" fill="#3b82f6" fontSize="10" fontWeight="bold font-mono">N</text>
            <text x="22" y="20" fill="#f59e0b" fontSize="10" fontWeight="bold font-mono">S</text>
            <text x="-28" y="20" fill="#3b82f6" fontSize="10" fontWeight="bold font-mono">HN</text>
            <text x="0" y="38" textAnchor="middle" fill="hsl(var(--foreground))" fontSize="11" fontWeight="bold" className="uppercase font-mono tracking-wider">
              LIGAND
            </text>
          </g>

          {/* Surrounding Cavity Residue Nodes */}
          {filteredResidues.map((res) => {
            const isHovered = activeResidue?.id === res.id;
            return (
              <g
                key={`node-${res.id}`}
                transform={`translate(${res.x}, ${res.y})`}
                onMouseEnter={() => setHoveredResidue(res)}
                onMouseLeave={() => setHoveredResidue(null)}
                onClick={() => setSelectedResidue(selectedResidue?.id === res.id ? null : res)}
                className="cursor-pointer transition-all duration-300"
              >
                {/* Node Outer Ring */}
                <circle
                  r={isHovered ? 26 : 22}
                  fill="hsl(var(--card))"
                  stroke={res.color}
                  strokeWidth={isHovered ? 3 : 1.8}
                  filter={isHovered ? "url(#glow-primary)" : undefined}
                />
                <circle
                  r={isHovered ? 20 : 17}
                  fill={res.color}
                  opacity={isHovered ? 0.25 : 0.12}
                />

                {/* Residue Name Text */}
                <text
                  x="0"
                  y="4"
                  textAnchor="middle"
                  fill="hsl(var(--foreground))"
                  fontSize={isHovered ? "11" : "10"}
                  fontWeight="bold"
                  className="font-mono tracking-tight"
                >
                  {res.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Live Residue & Cavity Role Readout Badge */}
        {activeResidue ? (
          <div className="absolute bottom-3 left-3 right-3 bg-card/95 border border-border p-3 rounded-xl shadow-elevated flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: activeResidue.color }} />
              <div>
                <span className="font-bold text-foreground">{activeResidue.name}</span>
                <span className="text-primary font-semibold ml-2">[{activeResidue.role}]</span>
                <span className="text-muted-foreground ml-2">({activeResidue.type} interaction)</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-mono font-mono-code font-semibold">
              <span className="text-muted-foreground">Dist: <strong className="text-foreground">{activeResidue.distance}</strong></span>
              <span className="text-primary font-bold">{activeResidue.energy}</span>
            </div>
          </div>
        ) : (
          <div className="absolute bottom-3 left-3 right-3 bg-card/75 border border-border/50 p-2.5 rounded-xl flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="italic">Hover over any cavity residue node (ASP 128, SER 45, TRP 108) to inspect 2D binding contact geometry & role.</span>
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase font-bold shrink-0">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10b981]" />H-Bond</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3b82f6]" />Salt Bridge</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f59e0b]" />Hydrophobic</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#a855f7]" />Pi-Stacking</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
