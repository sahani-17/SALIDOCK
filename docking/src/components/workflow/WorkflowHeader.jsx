import React from 'react';

/**
 * Shared header for all docking workflow pages.
 * Props: title, subtitle
 */
export default function WorkflowHeader({ title, subtitle }) {
    return (
        <header className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-6 py-4">
                <div className="flex items-center justify-between">
                    <a href="/"><img src="/logo.png" alt="SaliDock" className="h-12 cursor-pointer" /></a>
                    <div className="text-right">
                        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
                        <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
                    </div>
                </div>
            </div>
        </header>
    );
}
