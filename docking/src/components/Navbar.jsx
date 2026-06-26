import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

const Navbar = ({ lightTheme = false }) => {
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
        ? lightTheme
            ? "bg-white/95 border-b border-slate-200 shadow-sm backdrop-blur-md"
            : "glass border-b border-border shadow-lg shadow-background/50"
        : lightTheme
            ? "bg-slate-50/95 border-b border-slate-200"
            : "bg-transparent";

    const linkClass = lightTheme
        ? "text-sm text-slate-600 hover:text-slate-900 transition-colors duration-200"
        : "text-sm text-muted-foreground hover:text-foreground transition-colors duration-200";

    const registerClass = lightTheme
        ? "text-sm px-3.5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors"
        : "text-sm px-3.5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all";

    const mobileLinkClass = lightTheme
        ? "text-sm text-slate-600 hover:text-slate-900 transition-colors"
        : "text-sm text-muted-foreground hover:text-foreground transition-colors";

    return (
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${navBackground}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <Link to="/" className="flex items-center">
                        <img src="/logo.png" alt="Salidock" className="h-10 w-auto object-contain" />
                    </Link>

                    <div className="hidden md:flex items-center gap-6">
                        <Link to="/about" className={linkClass}>About Us</Link>
                        <Link to="/docs" className={linkClass}>Documentation</Link>
                        {!user ? (
                            <>
                                <Link to="/login" className={linkClass}>Login</Link>
                                <Link to="/register" className={registerClass}>Register</Link>
                            </>
                        ) : (
                            <>
                                <Link to="/feedback" className={linkClass}>Feedback</Link>
                                <span className={`text-xs max-w-40 truncate ${lightTheme ? "text-slate-500" : "text-muted-foreground"}`}>{displayName}</span>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className={`text-sm px-3 py-1.5 rounded-md border transition-all ${lightTheme
                                        ? "border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400"
                                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                                        }`}
                                >
                                    Logout
                                </button>
                            </>
                        )}
                    </div>

                    <button className={`md:hidden ${lightTheme ? "text-slate-800" : "text-foreground"}`} onClick={() => setMobileOpen(!mobileOpen)}>
                        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {mobileOpen && (
                    <div className={`md:hidden pb-4 flex flex-col gap-3 border-t pt-4 ${lightTheme ? "border-slate-200" : "border-border"}`}>
                        <Link to="/about" className={mobileLinkClass} onClick={() => setMobileOpen(false)}>About Us</Link>
                        <Link to="/docs" className={mobileLinkClass} onClick={() => setMobileOpen(false)}>Documentation</Link>
                        {!user ? (
                            <>
                                <Link to="/login" className={mobileLinkClass} onClick={() => setMobileOpen(false)}>Login</Link>
                                <Link to="/register" className={mobileLinkClass} onClick={() => setMobileOpen(false)}>Register</Link>
                            </>
                        ) : (
                            <>
                                <Link to="/feedback" className={mobileLinkClass} onClick={() => setMobileOpen(false)}>Feedback</Link>
                                <button type="button" className={`text-left ${mobileLinkClass}`} onClick={handleLogout}>Logout</button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
