import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

const Navbar = () => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "glass border-b border-border shadow-lg shadow-background/50" : "bg-transparent"
            }`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <Link to="/" className="flex items-center gap-0.5">
                        <span className="text-xl font-black tracking-tight text-foreground">SALI</span>
                        <span className="text-xl font-black tracking-tight text-primary">DOCK</span>
                    </Link>

                    {/* Desktop */}
                    <div className="hidden md:flex items-center gap-6">
                        <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">About Us</Link>
                        <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Documentation</Link>
                    </div>

                    {/* Mobile toggle */}
                    <button className="md:hidden text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
                        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {/* Mobile menu */}
                {mobileOpen && (
                    <div className="md:hidden pb-4 flex flex-col gap-3 border-t border-border pt-4">
                        <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileOpen(false)}>About Us</Link>
                        <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileOpen(false)}>Documentation</Link>
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
