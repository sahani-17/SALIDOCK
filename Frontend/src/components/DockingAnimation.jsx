import React, { useEffect, useState, useRef } from "react";

const MolecularAnimation = () => {
    const [phase, setPhase] = useState(0);
    const phaseRef = useRef(0);

    useEffect(() => {
        const durations = [1200, 1800, 1800, 1500, 4000, 1200];
        let timer = null;
        let active = true;

        const scheduleNext = () => {
            if (!active) return;
            const currentDuration = durations[phaseRef.current];
            timer = setTimeout(() => {
                if (!active) return;
                phaseRef.current = (phaseRef.current + 1) % durations.length;
                setPhase(phaseRef.current);
                scheduleNext();
            }, currentDuration);
        };

        scheduleNext();

        return () => {
            active = false;
            if (timer) clearTimeout(timer);
        };
    }, []);

    const screenOpacity = phase === 5 ? 0 : phase === 0 ? 0.6 : 1;
    const proteinVisible = phase >= 1;
    const ligandVisible = phase >= 2;
    const glowVisible = phase >= 3 && phase <= 4;
    const showHBonds = phase >= 3 && phase <= 4;
    const zooming = phase === 4;
    const fadeAll = phase === 5;

    const monitorOpacity = zooming ? 0 : 1;

    // Zoom transform applied on a wrapper div (not SVG <g>) so CSS transitions work
    const zoomScale = zooming ? 1.8 : 1;
    const zoomX = zooming ? -30 : 0;
    const zoomY = zooming ? -20 : 0;

    return (
        <div className="relative w-full h-full flex items-center justify-center p-4">
            {/* Background glows */}
            <div className="absolute w-[400px] h-[400px] rounded-full bg-blue-600/10 blur-[120px] top-1/4 left-1/4" />
            <div className="absolute w-[300px] h-[300px] rounded-full bg-cyan-400/8 blur-[100px] bottom-1/4 right-1/4" />

            {/* Outer container — handles overall fade */}
            <div
                style={{
                    opacity: fadeAll ? 0 : screenOpacity,
                    transition: 'opacity 1s ease',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                }}
            >
                <div className="relative w-[90%] max-w-[620px] aspect-[13/10]">
                    {/* Monitor bezel — fades during zoom */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '16px',
                            border: '1px solid rgba(51,65,85,0.6)',
                            background: 'rgba(15,23,42,0.3)',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 0 60px -15px rgba(37,99,235,0.3)',
                            opacity: monitorOpacity,
                            transition: 'opacity 1s ease',
                        }}
                    >
                        {/* Top bar */}
                        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(51,65,85,0.4)' }}>
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                            <div className="w-2.5 h-2.5 rounded-full bg-lime-400/70" />
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500/70" />
                            <span className="ml-3 text-[10px] font-mono text-slate-500/60 tracking-wider">
                                SALIDOCK — Molecular Viewer
                            </span>
                        </div>
                    </div>

                    {/* SVG viewport — zoom applied via wrapper div */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            paddingTop: '36px',
                            overflow: 'hidden',
                            borderBottomLeftRadius: '16px',
                            borderBottomRightRadius: '16px',
                            transform: `scale(${zoomScale}) translate(${zoomX}px, ${zoomY}px)`,
                            transformOrigin: '50% 53%',
                            transition: 'transform 2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                        }}
                    >
                        <svg
                            viewBox="0 0 520 400"
                            className="w-full h-full"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <defs>
                                <radialGradient id="dockGlow" cx="50%" cy="50%">
                                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.8" />
                                    <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                                </radialGradient>
                                <radialGradient id="bindingGlow" cx="50%" cy="50%">
                                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                                    <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                                </radialGradient>
                                <filter id="softGlow">
                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                                <filter id="strongGlow">
                                    <feGaussianBlur stdDeviation="5" result="blur" />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                                <linearGradient id="helixGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <stop offset="100%" stopColor="#f87171" />
                                </linearGradient>
                                <linearGradient id="helixGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#dc2626" />
                                    <stop offset="100%" stopColor="#ef4444" />
                                </linearGradient>
                                <linearGradient id="sheetGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#22d3ee" />
                                    <stop offset="100%" stopColor="#67e8f9" />
                                </linearGradient>
                                <linearGradient id="sheetGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#06b6d4" />
                                    <stop offset="100%" stopColor="#22d3ee" />
                                </linearGradient>
                            </defs>

                            {/* Grid lines */}
                            <g style={{ opacity: zooming ? 0 : 0.05, transition: 'opacity 1s ease' }}>
                                {Array.from({ length: 14 }).map((_, i) => (
                                    <line key={`h${i}`} x1="0" y1={i * 30} x2="520" y2={i * 30} stroke="#3b82f6" strokeWidth="0.5" />
                                ))}
                                {Array.from({ length: 18 }).map((_, i) => (
                                    <line key={`v${i}`} x1={i * 30} y1="0" x2={i * 30} y2="400" stroke="#3b82f6" strokeWidth="0.5" />
                                ))}
                            </g>

                            {/* === PROTEIN STRUCTURE === */}
                            <g
                                style={{
                                    transform: proteinVisible ? 'translateY(0px)' : 'translateY(-80px)',
                                    opacity: proteinVisible ? 1 : 0,
                                    transition: 'transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.8s ease',
                                }}
                            >
                                {/* Alpha helix 1 — main */}
                                <path
                                    d="M 110 155 Q 140 100 175 140 Q 195 170 185 195"
                                    fill="none" stroke="url(#helixGrad)" strokeWidth="9" strokeLinecap="round" opacity="0.9" filter="url(#softGlow)"
                                />
                                {/* Alpha helix 2 */}
                                <path
                                    d="M 185 195 Q 175 218 200 235 Q 228 248 245 218"
                                    fill="none" stroke="url(#helixGrad)" strokeWidth="8" strokeLinecap="round" opacity="0.85"
                                />
                                {/* Alpha helix 3 — back */}
                                <path
                                    d="M 350 180 Q 360 215 340 245 Q 318 265 290 252"
                                    fill="none" stroke="url(#helixGrad2)" strokeWidth="7" strokeLinecap="round" opacity="0.7"
                                />
                                {/* Alpha helix 4 — small */}
                                <path
                                    d="M 290 252 Q 275 260 265 250 Q 258 238 268 225"
                                    fill="none" stroke="url(#helixGrad2)" strokeWidth="5" strokeLinecap="round" opacity="0.6"
                                />

                                {/* Beta sheet 1 */}
                                <path
                                    d="M 245 218 L 285 195 L 315 212 L 330 188"
                                    fill="none" stroke="url(#sheetGrad)" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" filter="url(#softGlow)"
                                />
                                <polygon points="330,188 342,172 354,190" fill="#22d3ee" opacity="0.8" />

                                {/* Beta sheet 2 — lower */}
                                <path
                                    d="M 160 260 L 195 248 L 225 262 L 245 250"
                                    fill="none" stroke="url(#sheetGrad2)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"
                                />
                                <polygon points="245,250 255,238 263,254" fill="#06b6d4" opacity="0.65" />

                                {/* Loop/coil 1 */}
                                <path
                                    d="M 175 140 Q 190 125 208 135 Q 225 148 245 130 Q 265 112 285 135 Q 292 148 285 195"
                                    fill="none" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 3" opacity="0.55"
                                />
                                {/* Loop/coil 2 */}
                                <path
                                    d="M 354 190 Q 365 205 350 180"
                                    fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" opacity="0.45"
                                />
                                {/* Loop/coil 3 — bottom connector */}
                                <path
                                    d="M 268 225 Q 255 230 248 240 Q 240 252 225 262"
                                    fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 4" opacity="0.45"
                                />

                                {/* Cα backbone dots */}
                                {[
                                    [130, 128], [155, 118], [185, 150], [208, 180],
                                    [230, 230], [265, 205], [300, 200], [335, 195],
                                    [345, 230], [310, 255], [180, 255], [210, 255],
                                ].map(([cx, cy], i) => (
                                    <circle key={`ca${i}`} cx={cx} cy={cy} r="2" fill="#94a3b8" opacity="0.3" />
                                ))}

                                {/* Binding pocket 1 */}
                                <ellipse
                                    cx="260" cy="215" rx="50" ry="40"
                                    fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 4" opacity="0.2"
                                    style={{ animation: 'pulseGlow 3s ease-in-out infinite' }}
                                />
                                {/* Binding pocket 2 */}
                                <ellipse
                                    cx="195" cy="252" rx="30" ry="22"
                                    fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="2 4" opacity="0.12"
                                />
                            </g>

                            {/* === LIGAND MOLECULE === */}
                            <g
                                style={{
                                    transform: ligandVisible ? 'translateX(0px)' : 'translateX(-100px)',
                                    opacity: ligandVisible ? 1 : 0,
                                    transition: 'transform 1.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.8s ease',
                                }}
                            >
                                {/* Ring 1 bonds (hexagon) */}
                                <line x1="232" y1="205" x2="245" y2="192" stroke="#64748b" strokeWidth="2" />
                                <line x1="245" y1="192" x2="262" y2="192" stroke="#64748b" strokeWidth="2" />
                                <line x1="262" y1="192" x2="275" y2="205" stroke="#64748b" strokeWidth="2" />
                                <line x1="275" y1="205" x2="268" y2="220" stroke="#64748b" strokeWidth="2" />
                                <line x1="268" y1="220" x2="248" y2="222" stroke="#64748b" strokeWidth="2" />
                                <line x1="248" y1="222" x2="232" y2="205" stroke="#64748b" strokeWidth="2" />

                                {/* Double bond indicators */}
                                <line x1="247" y1="195" x2="260" y2="195" stroke="#64748b" strokeWidth="1" opacity="0.5" />
                                <line x1="272" y1="208" x2="267" y2="218" stroke="#64748b" strokeWidth="1" opacity="0.5" />

                                {/* Ring 2 bonds (fused pentagon) */}
                                <line x1="275" y1="205" x2="292" y2="200" stroke="#64748b" strokeWidth="2" />
                                <line x1="292" y1="200" x2="298" y2="215" stroke="#64748b" strokeWidth="2" />
                                <line x1="298" y1="215" x2="285" y2="225" stroke="#64748b" strokeWidth="2" />
                                <line x1="285" y1="225" x2="268" y2="220" stroke="#64748b" strokeWidth="2" />

                                {/* Double bond in ring 2 */}
                                <line x1="290" y1="203" x2="295" y2="214" stroke="#64748b" strokeWidth="1" opacity="0.5" />

                                {/* Side chains */}
                                <line x1="245" y1="192" x2="238" y2="176" stroke="#64748b" strokeWidth="1.5" />
                                <line x1="292" y1="200" x2="308" y2="192" stroke="#64748b" strokeWidth="1.5" />
                                <line x1="298" y1="215" x2="315" y2="222" stroke="#64748b" strokeWidth="1.5" />
                                <line x1="248" y1="222" x2="242" y2="238" stroke="#64748b" strokeWidth="1.5" />
                                <line x1="232" y1="205" x2="215" y2="202" stroke="#64748b" strokeWidth="1.5" />

                                {/* Carbon atoms (green) */}
                                <circle cx="232" cy="205" r="5.5" fill="#4ade80" filter="url(#softGlow)" />
                                <circle cx="262" cy="192" r="5.5" fill="#4ade80" filter="url(#softGlow)" />
                                <circle cx="268" cy="220" r="5.5" fill="#4ade80" filter="url(#softGlow)" />
                                <circle cx="292" cy="200" r="5" fill="#4ade80" filter="url(#softGlow)" />
                                <circle cx="285" cy="225" r="5" fill="#4ade80" filter="url(#softGlow)" />

                                {/* Nitrogen atoms (blue) */}
                                <circle cx="245" cy="192" r="5" fill="#3b82f6" filter="url(#softGlow)" />
                                <circle cx="275" cy="205" r="5" fill="#3b82f6" filter="url(#softGlow)" />
                                <circle cx="248" cy="222" r="4.5" fill="#3b82f6" filter="url(#softGlow)" />

                                {/* Oxygen atoms (red) */}
                                <circle cx="238" cy="176" r="4" fill="#ef4444" filter="url(#softGlow)" />
                                <circle cx="315" cy="222" r="4" fill="#ef4444" filter="url(#softGlow)" />

                                {/* Sulfur atom (yellow) */}
                                <circle cx="308" cy="192" r="4.5" fill="#facc15" filter="url(#softGlow)" />

                                {/* Hydroxyl hydrogen */}
                                <circle cx="242" cy="238" r="2.5" fill="#e2e8f0" />
                                <circle cx="215" cy="202" r="2.5" fill="#e2e8f0" />

                                {/* Fluorine */}
                                <circle cx="298" cy="215" r="3.5" fill="#a78bfa" filter="url(#softGlow)" />
                            </g>

                            {/* === HYDROGEN BONDS === */}
                            {showHBonds && (
                                <g style={{ opacity: 0.6, animation: 'bindingGlow 2s ease-in-out infinite' }}>
                                    <line x1="245" y1="192" x2="225" y2="170" stroke="#22d3ee" strokeWidth="1.2" strokeDasharray="3 3" />
                                    <line x1="275" y1="205" x2="300" y2="200" stroke="#22d3ee" strokeWidth="1.2" strokeDasharray="3 3" />
                                    <line x1="248" y1="222" x2="230" y2="240" stroke="#22d3ee" strokeWidth="1.2" strokeDasharray="3 3" />
                                    <line x1="238" y1="176" x2="210" y2="165" stroke="#22d3ee" strokeWidth="1" strokeDasharray="2 3" />
                                </g>
                            )}

                            {/* === BINDING GLOW === */}
                            {glowVisible && (
                                <circle
                                    cx="260" cy="210" r="55"
                                    fill="url(#bindingGlow)"
                                    style={{ animation: 'bindingGlow 2s ease-in-out infinite' }}
                                />
                            )}

                            {/* === DOCK BURST (phase 3 only) === */}
                            {phase === 3 && (
                                <g>
                                    <circle
                                        cx="260" cy="210" r="0"
                                        fill="url(#dockGlow)"
                                        style={{ animation: 'dockGlow 1.2s ease-out forwards' }}
                                    />
                                    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
                                        const rad = (angle * Math.PI) / 180;
                                        const x = 260 + Math.cos(rad) * 35;
                                        const y = 210 + Math.sin(rad) * 30;
                                        return (
                                            <circle
                                                key={i}
                                                cx={x} cy={y} r="2"
                                                fill="#22d3ee"
                                                style={{
                                                    animation: `sparkBurst 0.8s ease-out ${i * 0.06}s forwards`,
                                                    transformOrigin: `${x}px ${y}px`,
                                                }}
                                            />
                                        );
                                    })}
                                </g>
                            )}

                            {/* Rotating ring indicator (phase 4) */}
                            {zooming && (
                                <g opacity="0.12">
                                    <circle
                                        cx="260" cy="210" r="90"
                                        fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeDasharray="4 6"
                                        style={{ animation: 'complexRotate 8s linear infinite', transformOrigin: '260px 210px' }}
                                    />
                                </g>
                            )}

                            {/* Status text */}
                            <g style={{ opacity: zooming ? 0 : 0.5, transition: 'opacity 1s ease' }}>
                                <text x="20" y="385" fill="#3b82f6" fontSize="9" fontFamily="monospace">
                                    {phase === 0 && "Initializing..."}
                                    {phase === 1 && "Loading protein structure..."}
                                    {phase === 2 && "Positioning ligand..."}
                                    {phase === 3 && "Docking in progress..."}
                                    {phase === 4 && "Analyzing binding pose..."}
                                    {phase === 5 && "Resetting..."}
                                </text>
                                <text x="420" y="385" fill="#22d3ee" fontSize="8" fontFamily="monospace" opacity="0.8">
                                    ΔG: -8.4 kcal/mol
                                </text>
                            </g>
                        </svg>
                    </div>

                    {/* Monitor stand — fades during zoom */}
                    <div
                        className="flex flex-col items-center mt-1"
                        style={{ opacity: monitorOpacity, transition: 'opacity 1s ease' }}
                    >
                        <div className="w-16 h-4 bg-gradient-to-b from-slate-700/40 to-transparent rounded-b-lg" />
                        <div className="w-24 h-1.5 bg-slate-700/20 rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MolecularAnimation;
