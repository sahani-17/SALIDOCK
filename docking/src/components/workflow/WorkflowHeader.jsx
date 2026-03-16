import React from 'react';
import Navbar from '../Navbar';

/**
 * Shared header for all docking workflow pages (dark theme).
 */
export default function WorkflowHeader({ title, subtitle }) {
    return (
        <>
            <Navbar />
            <div className="pt-24 pb-0 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-black text-foreground">{title}</h1>
                    <p className="text-muted-foreground mt-1">{subtitle}</p>
                </div>
            </div>
        </>
    );
}
