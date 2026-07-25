import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { Sidebar, SidebarBody, SidebarLink } from "./ui/sidebar";
import {
  IconHome,
  IconInfoCircle,
  IconFileText,
  IconFlask,
  IconLayoutGrid,
  IconLogin,
  IconUserPlus,
  IconLogout,
  IconUser,
} from "@tabler/icons-react";

export const Navbar = () => {
  const [open, setOpen] = useState(false);
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
  };

  const navLinks = [
    {
      label: "Home",
      href: "/",
      icon: <IconHome className="h-5 w-5 shrink-0 text-muted-foreground group-hover/sidebar:text-primary transition-colors" />,
    },
    {
      label: "About",
      href: "/about",
      icon: <IconInfoCircle className="h-5 w-5 shrink-0 text-muted-foreground group-hover/sidebar:text-primary transition-colors" />,
    },
    {
      label: "Documentation",
      href: "/docs",
      icon: <IconFileText className="h-5 w-5 shrink-0 text-muted-foreground group-hover/sidebar:text-primary transition-colors" />,
    },
    {
      label: "Single Dock",
      href: "/dock",
      icon: <IconFlask className="h-5 w-5 shrink-0 text-muted-foreground group-hover/sidebar:text-primary transition-colors" />,
    },
    {
      label: "Batch Dock",
      href: "/batch-dock",
      icon: <IconLayoutGrid className="h-5 w-5 shrink-0 text-muted-foreground group-hover/sidebar:text-primary transition-colors" />,
    },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/90 border-b border-border/60 shadow-sm backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/salidock-logo.png"
              alt="Salidock"
              className="h-8 sm:h-9 md:h-10 w-auto object-contain transition-transform hover:scale-105"
            />
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = location.pathname === link.href;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    active
                      ? "bg-primary/10 text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </Link>
              );
            })}

            {!user ? (
              <div className="flex items-center gap-3 pl-3 ml-2 border-l border-border/60">
                <Link
                  to="/login"
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="text-xs font-bold px-4 py-1.5 rounded-full bg-primary text-primary-foreground hover:brightness-110 active:scale-95 transition-all shadow-sm"
                >
                  Register
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-3 pl-3 ml-2 border-l border-border/60">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs font-bold uppercase">
                    {displayName.charAt(0)}
                  </div>
                  <span
                    className="text-xs font-semibold max-w-32 truncate text-foreground"
                    title={displayName}
                  >
                    {displayName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all flex items-center gap-1"
                >
                  <IconLogout className="w-3.5 h-3.5" />
                  Logout
                </button>
              </div>
            )}
          </div>

          {/* Mobile Sidebar Navigation Drawer */}
          <div className="md:hidden">
            <Sidebar open={open} setOpen={setOpen}>
              <SidebarBody className="justify-between gap-6">
                <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
                  <Link to="/" className="flex items-center gap-2 mb-6">
                    <img
                      src="/salidock-logo.png"
                      alt="Salidock"
                      className="h-8 w-auto object-contain"
                    />
                  </Link>
                  <div className="flex flex-col gap-1">
                    {navLinks.map((link, idx) => (
                      <SidebarLink
                        key={idx}
                        link={link}
                        onClick={() => setOpen(false)}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex flex-col gap-2">
                  {!user ? (
                    <>
                      <SidebarLink
                        link={{
                          label: "Login",
                          href: "/login",
                          icon: <IconLogin className="h-5 w-5 shrink-0 text-muted-foreground" />,
                        }}
                        onClick={() => setOpen(false)}
                      />
                      <SidebarLink
                        link={{
                          label: "Register",
                          href: "/register",
                          icon: <IconUserPlus className="h-5 w-5 shrink-0 text-primary" />,
                        }}
                        onClick={() => setOpen(false)}
                      />
                    </>
                  ) : (
                    <>
                      <SidebarLink
                        link={{
                          label: displayName,
                          href: "#",
                          icon: (
                            <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                              {displayName.charAt(0)}
                            </div>
                          ),
                        }}
                      />
                      <button
                        onClick={() => {
                          handleLogout();
                          setOpen(false);
                        }}
                        className="w-full flex items-center gap-3 py-2.5 px-2 rounded-xl text-xs font-semibold text-destructive hover:bg-destructive/10 transition-all text-left"
                      >
                        <IconLogout className="h-5 w-5 shrink-0" />
                        <span>Logout</span>
                      </button>
                    </>
                  )}
                </div>
              </SidebarBody>
            </Sidebar>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
