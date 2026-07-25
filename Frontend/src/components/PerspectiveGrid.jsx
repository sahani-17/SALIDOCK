import React, { useEffect, useRef, useCallback } from "react";

/**
 * PerspectiveGrid – Canvas-based isometric tile grid with radial teal cursor glow.
 *
 * Uses a single <canvas> instead of N×N DOM elements for 60fps performance.
 * On hover, lights up nearest tiles with a radial falloff in Steel Teal (#4C7C93)
 * and Brightened Teal (#6FA6BE) core.
 */
export function PerspectiveGrid({
    className = "",
    gridSize = 40,
    showOverlay = true,
    fadeRadius = 80,
}) {
    const canvasRef = useRef(null);
    const activeTilesRef = useRef(new Map());
    const rafRef = useRef(null);
    const animatingRef = useRef(false);
    const drawFnRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        // Canvas pixel size – match 80rem in px
        const rootFontSize =
            parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const size = Math.round(80 * rootFontSize);
        canvas.width = size;
        canvas.height = size;

        const tileSize = size / gridSize;
        const activeTiles = activeTilesRef.current;

        // ── Theme colours ──
        const root = getComputedStyle(document.documentElement);
        const toHsla = (v) => v.trim().replace(/\s+/g, ", ");
        const borderHsla = toHsla(root.getPropertyValue("--border"));        // #2A323A (210, 16%, 20%)
        const primaryHsla = toHsla(root.getPropertyValue("--primary"));      // #4C7C93 (199, 32%, 44%)
        const glowHsla = toHsla(root.getPropertyValue("--primary-glow"));    // #6FA6BE (198, 38%, 59%)

        // ── Pre-render static low-contrast grid lines ──
        const staticCanvas = document.createElement("canvas");
        staticCanvas.width = size;
        staticCanvas.height = size;
        const sCtx = staticCanvas.getContext("2d");
        sCtx.strokeStyle = `hsla(${borderHsla}, 0.35)`;
        sCtx.lineWidth = 1;
        sCtx.beginPath();
        for (let i = 0; i <= gridSize; i++) {
            const p = Math.round(i * tileSize) + 0.5;
            sCtx.moveTo(p, 0);
            sCtx.lineTo(p, size);
            sCtx.moveTo(0, p);
            sCtx.lineTo(size, p);
        }
        sCtx.stroke();

        // Draw static grid once
        ctx.drawImage(staticCanvas, 0, 0);

        // ── Animation loop ──
        let running = true;

        function draw() {
            if (!running) return;

            ctx.clearRect(0, 0, size, size);
            ctx.drawImage(staticCanvas, 0, 0);

            for (const [key, tileData] of activeTiles) {
                const sep = key.indexOf(",");
                const col = +key.substring(0, sep);
                const row = +key.substring(sep + 1);
                const { opacity, isCore } = typeof tileData === "number" ? { opacity: tileData, isCore: false } : tileData;

                const x = col * tileSize + 0.5;
                const y = row * tileSize + 0.5;

                // Fill tile with radial falloff glow
                const colorHsla = isCore ? glowHsla : primaryHsla;
                const alphaMultiplier = isCore ? 0.35 : 0.22;

                ctx.fillStyle = `hsla(${colorHsla}, ${(opacity * alphaMultiplier).toFixed(3)})`;
                ctx.fillRect(x, y, tileSize - 1, tileSize - 1);

                // Highlight border lines nearest cursor
                ctx.strokeStyle = `hsla(${glowHsla}, ${(opacity * 0.45).toFixed(3)})`;
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, tileSize - 1, tileSize - 1);

                const next = opacity - 0.008; // smooth ~2s fade
                if (next <= 0) {
                    activeTiles.delete(key);
                } else {
                    activeTiles.set(key, { opacity: next, isCore });
                }
            }

            if (activeTiles.size > 0) {
                rafRef.current = requestAnimationFrame(draw);
            } else {
                rafRef.current = null;
                animatingRef.current = false;
            }
        }

        drawFnRef.current = draw;

        return () => {
            running = false;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            animatingRef.current = false;
        };
    }, [gridSize]);

    // ── Mouse handler – radial falloff radiating outward from cursor ──
    const handleMouseMove = useCallback(
        (e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const tileSize = canvas.width / gridSize;
            const col = Math.floor(e.nativeEvent.offsetX / tileSize);
            const row = Math.floor(e.nativeEvent.offsetY / tileSize);

            if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return;

            const tiles = activeTilesRef.current;

            // Radial distance falloff (radius 2.5 tiles)
            const radius = 2.5;
            for (let dc = -Math.ceil(radius); dc <= Math.ceil(radius); dc++) {
                for (let dr = -Math.ceil(radius); dr <= Math.ceil(radius); dr++) {
                    const nc = col + dc;
                    const nr = row + dr;
                    if (nc >= 0 && nc < gridSize && nr >= 0 && nr < gridSize) {
                        const dist = Math.sqrt(dc * dc + dr * dr);
                        if (dist <= radius) {
                            const falloff = Math.pow(1 - dist / radius, 1.2);
                            const nk = `${nc},${nr}`;
                            const isCore = dist < 1.0;
                            const existing = tiles.get(nk)?.opacity || 0;
                            
                            if (falloff > existing) {
                                tiles.set(nk, { opacity: falloff, isCore });
                            }
                        }
                    }
                }
            }

            if (!animatingRef.current && drawFnRef.current) {
                animatingRef.current = true;
                rafRef.current = requestAnimationFrame(drawFnRef.current);
            }
        },
        [gridSize]
    );

    return (
        <div
            className={`perspective-grid-root ${className}`}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                perspective: "2000px",
                transformStyle: "preserve-3d",
            }}
        >
            <canvas
                ref={canvasRef}
                onMouseMove={handleMouseMove}
                style={{
                    position: "absolute",
                    width: "80rem",
                    height: "80rem",
                    left: "50%",
                    top: "50%",
                    transform:
                        "translate(-50%, -50%) rotateX(30deg) rotateY(-5deg) rotateZ(20deg) scale(2)",
                    transformOrigin: "center",
                }}
            />

            {showOverlay && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        zIndex: 10,
                        background: `radial-gradient(circle, transparent 25%, hsl(var(--background)) ${fadeRadius}%)`,
                    }}
                />
            )}
        </div>
    );
}

export default PerspectiveGrid;
