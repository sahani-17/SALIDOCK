const Footer = ({ lightTheme = false }) => (
    <footer className={lightTheme ? "bg-slate-50 border-t border-slate-200" : "bg-card/50 border-t border-border backdrop-blur-sm"}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                <p className={lightTheme ? "text-xs text-slate-500" : "text-xs text-muted-foreground"}>© 2026 SaliDock. All rights reserved.</p>
                {/* <div className="flex items-center gap-4">
                    <a href="#" className="text-xs text-muted-foreground hover:text-primary transition-colors">Privacy</a>
                    <a href="#" className="text-xs text-muted-foreground hover:text-primary transition-colors">Terms</a>
                </div> */}
            </div>
        </div>
    </footer>
);

export default Footer;
