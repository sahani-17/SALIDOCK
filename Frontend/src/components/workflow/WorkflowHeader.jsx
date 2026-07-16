import React from 'react';
import Navbar from '../Navbar';

/**
 * Shared header for docking workflow pages.
 */
export default function WorkflowHeader({ title, subtitle, eyebrow }) {
    return (
        <>
            <Navbar />
            <div className="pt-24 pb-0 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    {eyebrow && (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary mb-2">{eyebrow}</p>
                    )}
                    <h1 className="font-display text-4xl md:text-5xl text-foreground leading-tight">{title}</h1>
                    {subtitle && <p className="text-muted-foreground mt-2 max-w-2xl">{subtitle}</p>}
                </div>
            </div>
        </>
    );
}
