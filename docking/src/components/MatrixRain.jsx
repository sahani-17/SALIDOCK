import { useEffect, useRef } from "react";

const AMINO_ACIDS = [
    "ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY",
    "HIS", "ILE", "LEU", "LYS", "MET", "PHE", "PRO", "SER",
    "THR", "TRP", "TYR", "VAL",
];

const MatrixRain = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;

        let animId;
        const fontSize = 14;
        const lineHeight = fontSize * 1.5;
        const colSpacing = fontSize * 3.5;
        let columns = 0;
        let drops = [];
        let speeds = [];
        let opacities = [];
        let acids = [];

        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            canvas.width = canvas.offsetWidth * dpr;
            canvas.height = canvas.offsetHeight * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            columns = Math.floor(canvas.offsetWidth / colSpacing);
            drops = Array.from({ length: columns }, () => Math.random() * -30);
            speeds = Array.from({ length: columns }, () => 0.06 + Math.random() * 0.12);
            opacities = Array.from({ length: columns }, () => 0.25 + Math.random() * 0.35);
            acids = Array.from({ length: columns }, () =>
                Array.from({ length: 8 }, () => AMINO_ACIDS[Math.floor(Math.random() * AMINO_ACIDS.length)])
            );
        };

        resize();
        window.addEventListener("resize", resize);

        const draw = () => {
            const w = canvas.offsetWidth;
            const h = canvas.offsetHeight;

            ctx.fillStyle = "rgba(10, 15, 26, 0.08)";
            ctx.fillRect(0, 0, w, h);

            ctx.textBaseline = "top";

            for (let i = 0; i < columns; i++) {
                const x = i * colSpacing + fontSize;
                const y = drops[i] * lineHeight;

                const headAcid = acids[i][0];
                ctx.font = `700 ${fontSize}px "SF Mono", "Fira Code", "Cascadia Code", monospace`;
                ctx.shadowColor = "rgba(16, 235, 159, 0.6)";
                ctx.shadowBlur = 8;
                ctx.fillStyle = `rgba(180, 255, 220, ${Math.min(opacities[i] + 0.45, 0.95)})`;
                ctx.fillText(headAcid, x, y);
                ctx.shadowBlur = 0;

                for (let t = 1; t <= 6; t++) {
                    const trailY = y - t * lineHeight;
                    if (trailY > 0) {
                        const trailAcid = acids[i][t % acids[i].length];
                        const fade = 1 - t * 0.15;
                        const trailOpacity = opacities[i] * Math.max(fade, 0.05);
                        ctx.font = `600 ${fontSize}px "SF Mono", "Fira Code", "Cascadia Code", monospace`;
                        ctx.fillStyle = `rgba(16, 185, 129, ${trailOpacity})`;
                        ctx.fillText(trailAcid, x, trailY);
                    }
                }

                drops[i] += speeds[i];

                if (y > h && Math.random() > 0.97) {
                    drops[i] = Math.random() * -15;
                    speeds[i] = 0.06 + Math.random() * 0.12;
                    opacities[i] = 0.25 + Math.random() * 0.35;
                    acids[i] = Array.from({ length: 8 }, () =>
                        AMINO_ACIDS[Math.floor(Math.random() * AMINO_ACIDS.length)]
                    );
                }
            }

            animId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity: 0.55 }}
        />
    );
};

export default MatrixRain;
