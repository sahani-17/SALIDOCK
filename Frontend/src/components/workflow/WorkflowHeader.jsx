import React from 'react';
import Navbar from '../Navbar';

/**
 * Shared header for docking workflow pages.
 */
export default function WorkflowHeader({ title, subtitle }) {
    return (
        <>
            <Navbar />
            <div className="pt-24 pb-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-8 text-center flex flex-col items-center">
                    <h1 className="font-medium text-4xl md:text-5xl text-foreground leading-tight text-center">{title}</h1>
                    {subtitle && <p className="text-muted-foreground mt-2 max-w-2xl text-center mx-auto">{subtitle}</p>}
                </div>
            </div>
        </>
    );
}
