import React, { useEffect, useState } from "react";

const cn = (...classes) => classes.filter(Boolean).join(" ");

export function AnimatedRays({
    className = "",
    children,
}) {
    const [isDark, setIsDark] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const checkDark = () => document.documentElement.classList.contains("dark");
        setIsDark(checkDark());

        const observer = new MutationObserver(() => setIsDark(checkDark()));
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    if (!mounted) return null;

    const stripes = `repeating-linear-gradient(
        100deg,
        var(--stripe-color, rgba(255,255,255,0.12)) 0%,
        var(--stripe-color, rgba(255,255,255,0.12)) 7%,
        transparent 10%,
        transparent 12%,
        var(--stripe-color, rgba(255,255,255,0.12)) 16%
    )`;
    const rainbow = `repeating-linear-gradient(
        100deg,
        #60a5fa 10%,
        #e879f9 15%,
        #60a5fa 20%,
        #5eead4 25%,
        #60a5fa 30%
    )`;

    return (
        <section className={cn("relative w-full h-full overflow-hidden", className)}>
            <style>{`
                @keyframes smoothRaysBg {
                    0% {
                        background-position: 0% 50%, 0% 50%;
                    }
                    50% {
                        background-position: 100% 50%, 100% 50%;
                    }
                    100% {
                        background-position: 0% 50%, 0% 50%;
                    }
                }
                .animate-rays-moving {
                    animation: smoothRaysBg 18s ease-in-out infinite !important;
                }
            `}</style>
            {/* Aurora Background — matches original .hero */}
            <div
                className="absolute inset-0 animate-rays-moving"
                style={{
                    backgroundImage: `${stripes}, ${rainbow}`,
                    backgroundSize: "300%, 200%",
                    filter: isDark
                        ? "opacity(60%) saturate(200%)"
                        : "invert(100%)",
                    maskImage: "radial-gradient(ellipse at 100% 0%, black 40%, transparent 70%)",
                    WebkitMaskImage: "radial-gradient(ellipse at 100% 0%, black 40%, transparent 70%)",
                }}
            >
                {/* Animated overlay — matches original .hero::after */}
                <div
                    className="absolute inset-0 animate-rays-moving"
                    style={{
                        backgroundImage: `${stripes}, ${rainbow}`,
                        backgroundSize: "200%, 100%",
                        mixBlendMode: "difference",
                    }}
                />
            </div>

            {children && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
                    {children}
                </div>
            )}
        </section>
    );
}

export default AnimatedRays;
