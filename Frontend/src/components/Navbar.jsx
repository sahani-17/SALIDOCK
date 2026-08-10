import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { animate, motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Info,
  FileText,
  FlaskConical,
  LayoutGrid,
  LogIn,
  UserPlus,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
} from "lucide-react";

// ─── Theme Toggle ────────────────────────────────────────────────────────────
const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else if (stored === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDark(prefersDark);
      document.documentElement.classList.toggle("dark", prefersDark);
    }
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-foreground/10 transition-colors text-muted-foreground hover:text-foreground"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};

// ─── Main Spotlight Navbar ───────────────────────────────────────────────────
export const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const displayName =
    user?.user_metadata?.username ||
    user?.user_metadata?.full_name ||
    user?.email ||
    "User";

  const handleLogout = async () => {
    const { error } = await signOut();
    if (error) {
      toast.error(error.message || "Failed to logout");
      return;
    }
    toast.success("Logged out successfully");
    setIsMobileMenuOpen(false);
  };

  const items = [
    { label: "Home", href: "/", icon: Home },
    { label: "About", href: "/about", icon: Info },
    { label: "Documentation", href: "/docs", icon: FileText },
    { label: "Single Dock", href: "/dock", icon: FlaskConical },
    { label: "Batch Dock", href: "/batch-dock", icon: LayoutGrid },
  ];

  // Find active index based on current URL path
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.href === location.pathname)
  );

  const navRef = useRef(null);
  const [hoverX, setHoverX] = useState(null);

  // Refs for light positions to animate imperatively
  const spotlightX = useRef(0);
  const ambienceX = useRef(0);

  // Handle MouseMove & MouseLeave for dynamic spotlight
  useEffect(() => {
    if (!navRef.current) return;
    const nav = navRef.current;

    const handleMouseMove = (e) => {
      const rect = nav.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setHoverX(x);
      spotlightX.current = x;
      nav.style.setProperty("--spotlight-x", `${x}px`);
    };

    const handleMouseLeave = () => {
      setHoverX(null);
      const activeItem = nav.querySelector(`[data-index="${activeIndex}"]`);
      if (activeItem) {
        const navRect = nav.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();
        const targetX = itemRect.left - navRect.left + itemRect.width / 2;

        animate(spotlightX.current, targetX, {
          type: "spring",
          stiffness: 200,
          damping: 20,
          onUpdate: (v) => {
            spotlightX.current = v;
            nav.style.setProperty("--spotlight-x", `${v}px`);
          },
        });
      }
    };

    nav.addEventListener("mousemove", handleMouseMove);
    nav.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      nav.removeEventListener("mousemove", handleMouseMove);
      nav.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [activeIndex]);

  // Handle Active Item Ambience Movement
  useEffect(() => {
    if (!navRef.current) return;
    const nav = navRef.current;
    const activeItem = nav.querySelector(`[data-index="${activeIndex}"]`);

    if (activeItem) {
      const navRect = nav.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const targetX = itemRect.left - navRect.left + itemRect.width / 2;

      animate(ambienceX.current, targetX, {
        type: "spring",
        stiffness: 200,
        damping: 20,
        onUpdate: (v) => {
          ambienceX.current = v;
          nav.style.setProperty("--ambience-x", `${v}px`);
        },
      });
    }
  }, [activeIndex]);

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 h-16 flex items-center justify-between px-4 md:px-8 bg-background/80 backdrop-blur-md border-b border-border/50">
        
        {/* Left Side: Brand Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 shrink-0 hover:opacity-90 transition-opacity"
        >
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-sm relative">
            <img
              src="/salidock-logo.png"
              alt="SaliDock Logo"
              className="absolute top-0 left-0 w-full object-cover object-top"
              style={{ height: "180%" }}
            />
          </div>
          <div className="flex flex-col leading-none gap-0.5">
            <span
              className="font-bold tracking-wide"
              style={{
                fontFamily: "'Rajdhani', 'DM Sans', system-ui, sans-serif",
                fontSize: "1.25rem",
                lineHeight: 1,
              }}
            >
              <span className="text-foreground dark:text-white">Sali</span>
              <span className="text-primary">Dock</span>
            </span>
            <span
              className="tracking-widest uppercase text-muted-foreground"
              style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: "7px",
                letterSpacing: "0.08em",
              }}
            >
              (Structure·Affinity·Ligand Interaction)
            </span>
          </div>
        </Link>

        {/* Center: Desktop Spotlight Navbar */}
        <div className="hidden md:flex items-center justify-center">
          <nav
            ref={navRef}
            className="spotlight-nav relative h-11 rounded-full transition-all duration-300 overflow-hidden border border-border/60 bg-card/60 backdrop-blur-lg shadow-sm"
          >
            {/* Nav Items List */}
            <ul className="relative flex items-center h-full px-2 gap-1 z-[10]">
              {items.map((item, idx) => {
                const Icon = item.icon;
                const isActive = activeIndex === idx;
                return (
                  <li key={idx} className="relative h-full flex items-center justify-center">
                    <Link
                      to={item.href}
                      data-index={idx}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-colors duration-200 rounded-full ${
                        isActive
                          ? "text-primary dark:text-white font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? "opacity-100" : "opacity-70"}`} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Moving Spotlight (Mouse Follower) */}
            <div
              className="pointer-events-none absolute bottom-0 left-0 w-full h-full z-[1] opacity-0 transition-opacity duration-300"
              style={{
                opacity: hoverX !== null ? 1 : 0,
                background: `
                  radial-gradient(
                    120px circle at var(--spotlight-x, 0px) 100%, 
                    var(--spotlight-color, rgba(0,0,0,0.08)) 0%, 
                    transparent 50%
                  )
                `,
              }}
            />

            {/* Active Item Ambience (Stays on Active) */}
            <div
              className="pointer-events-none absolute bottom-0 left-0 w-full h-[2px] z-[2]"
              style={{
                background: `
                  radial-gradient(
                    60px circle at var(--ambience-x, 0px) 0%, 
                    var(--ambience-color, rgba(99,102,241,1)) 0%, 
                    transparent 100%
                  )
                `,
              }}
            />
          </nav>
        </div>

        {/* Right Side: Theme Toggle & User Auth */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />

          {!user ? (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="px-3.5 py-1.5 text-xs font-bold text-primary-foreground bg-primary rounded-full hover:brightness-110 active:scale-95 transition-all shadow-sm"
              >
                Register
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold uppercase">
                  {displayName.charAt(0)}
                </div>
                <span
                  className="text-xs font-semibold max-w-28 truncate text-foreground"
                  title={displayName}
                >
                  {displayName}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger & Controls */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <button
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-x-0 top-16 z-40 bg-card/95 backdrop-blur-md border-b border-border/60 p-4 md:hidden shadow-lg"
          >
            <nav className="flex flex-col gap-1">
              {items.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground/80 hover:bg-muted/60"
                    }`}
                  >
                    <Icon className="w-4 h-4 opacity-80" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                );
              })}

              <div className="h-px bg-border/60 my-2" />

              {!user ? (
                <>
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-foreground/80 hover:bg-muted/60 transition-colors"
                  >
                    <LogIn className="w-4 h-4 opacity-80" />
                    <span className="text-sm font-medium">Login</span>
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm mt-1 hover:brightness-110 transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    Register
                  </Link>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-sm font-bold uppercase">
                      {displayName.charAt(0)}
                    </div>
                    <span className="text-sm font-semibold text-foreground truncate">
                      {displayName}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spotlight Dynamic Styling */}
      <style>{`
        .spotlight-nav {
          --spotlight-color: rgba(0, 0, 0, 0.08);
          --ambience-color: rgba(99, 102, 241, 0.9);
        }
        .dark .spotlight-nav {
          --spotlight-color: rgba(255, 255, 255, 0.15);
          --ambience-color: rgba(255, 255, 255, 1);
        }
      `}</style>
    </>
  );
};

export default Navbar;
