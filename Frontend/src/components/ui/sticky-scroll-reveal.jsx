import React, { useRef, useEffect, useState } from "react";

/**
 * StickyScroll – Reveals sticky content (e.g., screenshots/diagrams in a uniform aspect ratio)
 * alongside scrolling text steps.
 */
export function StickyScroll({ content, className = "" }) {
    const [activeCard, setActiveCard] = useState(0);
    const containerRef = useRef(null);
    const itemRefs = useRef([]);

    useEffect(() => {
        const handleScroll = () => {
            if (!containerRef.current) return;
            const itemElements = itemRefs.current;
            const containerTop = containerRef.current.getBoundingClientRect().top;
            const viewportHeight = window.innerHeight;

            let closestIndex = 0;
            let closestDistance = Infinity;

            itemElements.forEach((el, index) => {
                if (!el) return;
                const rect = el.getBoundingClientRect();
                // Distance from middle of viewport
                const distance = Math.abs(rect.top + rect.height / 2 - viewportHeight / 2);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestIndex = index;
                }
            });

            setActiveCard(closestIndex);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
    }, [content]);

    return (
        <div
            ref={containerRef}
            className={`relative flex justify-between gap-10 lg:gap-16 items-start w-full ${className}`}
        >
            {/* Left Column – Scrolling text steps */}
            <div className="w-full lg:w-1/2 flex flex-col gap-24 py-6">
                {content.map((item, index) => (
                    <div
                        key={item.id || item.title + index}
                        id={item.id}
                        ref={(el) => (itemRefs.current[index] = el)}
                        className={`transition-opacity duration-300 ${
                            activeCard === index ? "opacity-100" : "opacity-40"
                        }`}
                    >
                        <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                            {item.title}
                        </h3>
                        <div className="text-base text-muted-foreground leading-relaxed max-w-xl mb-6">
                            {item.description}
                        </div>
                        
                        {/* Mobile inline preview */}
                        <div className="block lg:hidden my-4 rounded-xl border border-border overflow-hidden bg-card shadow-sm aspect-[16/10]">
                            {item.content}
                        </div>
                    </div>
                ))}
            </div>

            {/* Right Column – Sticky Screenshot Container (Fixed aspect ratio 16:10 for all screenshots) */}
            <div className="hidden lg:block sticky top-28 w-1/2 shrink-0">
                <div className="w-full aspect-[16/10] rounded-2xl border border-border bg-card shadow-elevated overflow-hidden relative transition-all duration-500">
                    {content.map((item, index) => (
                        <div
                            key={index}
                            className={`absolute inset-0 w-full h-full transition-opacity duration-500 flex items-center justify-center ${
                                activeCard === index
                                    ? "opacity-100 pointer-events-auto z-10 scale-100"
                                    : "opacity-0 pointer-events-none z-0 scale-95"
                            }`}
                        >
                            {item.content}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default StickyScroll;
