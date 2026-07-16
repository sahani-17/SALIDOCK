const Footer = () => (
    <footer className="bg-card border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <img src="/salidock-logo.png" alt="" className="h-5 w-auto opacity-70" aria-hidden="true" />
                    <p className="text-xs text-muted-foreground">© 2026 Salidock. All rights reserved.</p>
                </div>
                <div className="flex items-center gap-5 text-xs text-muted-foreground">
                    <a href="/about" className="hover:text-foreground transition-colors">About</a>
                    <a href="/docs" className="hover:text-foreground transition-colors">Documentation</a>
                </div>
            </div>
        </div>
    </footer>
);

export default Footer;
