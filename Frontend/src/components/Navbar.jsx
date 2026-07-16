import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const { user, signOut } = useAuth();
    const displayName = user?.user_metadata?.username || user?.user_metadata?.full_name || user?.email;

    const handleLogout = async () => {
        const { error } = await signOut();
        if (error) {
            toast.error(error.message || "Failed to logout");
            return;
        }
        toast.success("Logged out successfully");
        setMobileOpen(false);
    };

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const navBackground = scrolled
        ? "bg-background/85 border-b border-border shadow-elevated backdrop-blur-md"
        : "bg-background/60 border-b border-transparent backdrop-blur-sm";

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${navBackground}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <Link to="/" className="flex items-center">
                        <img src="/salidock-logo.png" alt="Salidock" className="h-8 md:h-9 w-auto object-contain" />
                    </Link>

                    <div className="hidden md:flex items-center gap-6">
                        <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link>
                        <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Documentation</Link>
                        {!user ? (
                            <>
                                <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Login</Link>
                                <Link to="/register" className="text-sm px-3.5 py-2 rounded-full bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all">
                                    Register
                                </Link>
                            </>
                        ) : (
                            <>
                                
                                <span className="text-xs max-w-40 truncate text-muted-foreground">{displayName}</span>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="text-sm px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
                                >
                                    Logout
                                </button>
                            </>
                        )}
                    </div>

                    <button className="md:hidden text-foreground" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
                        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {mobileOpen && (
                    <div className="md:hidden pb-4 flex flex-col gap-3 border-t border-border pt-4">
                        <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(false)}>About</Link>
                        <Link to="/docs" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(false)}>Documentation</Link>
                        {!user ? (
                            <>
                                <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(false)}>Login</Link>
                                <Link to="/register" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(false)}>Register</Link>
                            </>
                        ) : (
                            <>
                                
                                <button type="button" className="text-left text-sm text-muted-foreground hover:text-foreground" onClick={handleLogout}>Logout</button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
