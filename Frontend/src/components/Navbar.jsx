import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import {
  Home,
  Info,
  FileText,
  FlaskConical,
  LayoutGrid,
  LogIn,
  UserPlus,
  LogOut,
  User,
  Menu,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Theme Toggle ────────────────────────────────────────────────────────────
const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Read from localStorage or system preference on mount
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else if (stored === "light") {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    } else {
      // system preference
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

// ─── NavLink ─────────────────────────────────────────────────────────────────
const NavLink = ({ to, icon: Icon, label, active }) => (
  <Link
    to={to}
    style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    className={`group flex items-center gap-1.5 text-xs font-bold tracking-wide transition-colors whitespace-nowrap ${
      active
        ? "text-primary"
        : "text-muted-foreground hover:text-foreground"
    }`}
  >
    <Icon
      className={`w-3.5 h-3.5 transition-opacity ${
        active ? "opacity-100" : "opacity-70 group-hover:opacity-100"
      }`}
    />
    <span>{label}</span>
  </Link>
);

// ─── Main Navbar ──────────────────────────────────────────────────────────────
export const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const location = useLocation();

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

  const navItemsLeft = [
    { label: "Home",          to: "/",         icon: Home },
    { label: "About",         to: "/about",    icon: Info },
    { label: "Documentation", to: "/docs",     icon: FileText },
  ];

  const navItemsRight = [
    { label: "Single Dock", to: "/dock",       icon: FlaskConical },
    { label: "Batch Dock",  to: "/batch-dock", icon: LayoutGrid },
  ];

  const allNavItems = [...navItemsLeft, ...navItemsRight];

  return (
    <>
      {/* ── Fixed Notch Header ── */}
      <header className="fixed top-0 inset-x-0 z-50 h-16 flex px-0">

        {/* Left Side Bar — Logo lives here, full h-16 to match notch height */}
        <div className="flex-1 h-16 bg-background z-20 relative min-w-0 flex items-center pl-5">
          <svg className="absolute bottom-0 left-0 w-full h-10 pointer-events-none" preserveAspectRatio="none">
            <line x1="0" y1="39.5" x2="100%" y2="39.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-foreground" />
            <line x1="0" y1="36.5" x2="100%" y2="36.5" stroke="currentColor" strokeOpacity={0.04} strokeWidth={0.5} className="text-foreground" />
          </svg>
          {/* Logo — left of the notch, vertically centred */}
          <Link
            to="/"
            className="relative z-10 flex items-center shrink-0 hover:opacity-80 transition-opacity"
          >
            <img
              src="/salidock-logo.png"
              alt="Salidock"
              className="h-9 w-auto object-contain hover:scale-105 transition-transform navbar-logo"
            />
          </Link>
        </div>

        {/* Notch Container */}
        <div className="flex h-16 relative z-10 shrink-0 -ml-px">

          {/* Left Corner */}
          <div className="w-[50px] h-full relative shrink-0">
            <div
              className="absolute inset-0 bg-card border-b border-border"
              style={{ clipPath: "path('M0 0 H50 V64 C25 64 25 40 0 40 Z')" }}
            />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 50 64">
              <path d="M0 39.5 C25 39.5 25 63.5 50 63.5" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} className="text-foreground" />
            </svg>
          </div>

          {/* Center Content */}
          <div className="flex-1 h-full relative min-w-0 -ml-px">
            {/* Background */}
            <div className="absolute inset-0 bg-card border-b border-border">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                <line x1="0" y1="63.5" x2="100%" y2="63.5" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} className="text-foreground" />
              </svg>
            </div>

            {/* Content */}
            <div className="relative w-full h-full flex items-center justify-between px-4 md:px-8">

              {/* Desktop Left Nav */}
              <nav className="hidden md:flex gap-6 shrink-0">
                {navItemsLeft.map((item) => (
                  <NavLink
                    key={item.label}
                    {...item}
                    active={location.pathname === item.to}
                  />
                ))}
              </nav>

              {/* Mobile: Hamburger */}
              <button
                className="md:hidden p-1 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>



              {/* Desktop Right Nav + Auth */}
              <nav className="hidden md:flex gap-6 items-center shrink-0">
                <div className="w-px h-4 bg-border/60 mx-1 shrink-0" aria-hidden="true" />
                {navItemsRight.map((item) => (
                  <NavLink
                    key={item.label}
                    {...item}
                    active={location.pathname === item.to}
                  />
                ))}

                <div className="flex gap-3 pl-4 border-l border-border/60 shrink-0 items-center" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  <ThemeToggle />

                  {!user ? (
                    <>
                      <Link
                        to="/login"
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                      >
                        Login
                      </Link>
                      <Link
                        to="/register"
                        className="px-3 py-1.5 text-xs font-bold text-primary-foreground bg-primary rounded-full hover:brightness-110 active:scale-95 transition-all shadow-sm whitespace-nowrap"
                      >
                        Register
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold uppercase">
                          {displayName.charAt(0)}
                        </div>
                        <span className="text-xs font-semibold max-w-28 truncate text-foreground" title={displayName}>
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
                    </>
                  )}
                </div>
              </nav>

              {/* Mobile Right: Theme Toggle */}
              <div className="md:hidden flex items-center gap-2">
                <ThemeToggle />
              </div>

            </div>
          </div>

          {/* Right Corner */}
          <div className="w-[50px] h-full relative shrink-0 -ml-px">
            <div
              className="absolute inset-0 bg-card border-b border-border"
              style={{ clipPath: "path('M0 0 H50 V40 C25 40 25 64 0 64 Z')" }}
            />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 50 64">
              <path d="M0 63.5 C25 63.5 25 39.5 50 39.5" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} className="text-foreground" />
            </svg>
          </div>

        </div>

        {/* Right Side Bar */}
        <div className="flex-1 h-10 bg-background z-20 relative min-w-0 -ml-px">
          <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <line x1="0" y1="39.5" x2="100%" y2="39.5" stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5} className="text-foreground" />
            <line x1="0" y1="36.5" x2="100%" y2="36.5" stroke="currentColor" strokeOpacity={0.04} strokeWidth={0.5} className="text-foreground" />
          </svg>
        </div>

      </header>

      {/* ── Mobile Menu Overlay ── */}
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
              {allNavItems.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground/80 hover:bg-muted/60"
                    }`}
                  >
                    <item.icon className="w-4 h-4 opacity-80" />
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
                    <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
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
    </>
  );
};

export default Navbar;
