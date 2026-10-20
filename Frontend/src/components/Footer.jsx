import React from 'react';

const Footer = () => (
    <footer className="w-full relative z-40 bg-card/60 backdrop-blur-2xl border-t border-border/50 mt-auto transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                    <img src="/salidock-logo.png" alt="Salidock" className="h-5 w-auto object-contain opacity-90 navbar-logo" />
                    <span className="text-[11px] text-muted-foreground">© 2026 SaliDock. All rights reserved.</span>
                </div>
                <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
                    <a href="/about" className="hover:text-foreground transition-colors">About</a>
                    <span className="text-border/60">•</span>
                    <a href="/docs" className="hover:text-foreground transition-colors">Documentation</a>
                </div>
            </div>
        </div>
    </footer>
);

export default Footer;
