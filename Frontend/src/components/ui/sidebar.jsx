import React, { useState, createContext, useContext } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";

const SidebarContext = createContext(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}) => {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate = true,
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...props} />
    </>
  );
};

export const DesktopSidebar = ({
  className = "",
  children,
  ...props
}) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={`hidden md:flex flex-col bg-card border-r border-border h-full px-4 py-4 shrink-0 transition-colors ${className}`}
      animate={{
        width: animate ? (open ? "260px" : "68px") : "260px",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className = "",
  children,
  ...props
}) => {
  const { open, setOpen } = useSidebar();
  return (
    <div
      className={`flex md:hidden items-center justify-between bg-card border-b border-border w-full px-4 py-3 shrink-0 ${className}`}
      {...props}
    >
      <div className="flex justify-between items-center w-full z-20">
        <Link to="/" className="flex items-center gap-2">
          <img src="/salidock-logo.png" alt="Salidock" className="h-7 w-auto object-contain" />
        </Link>
        <button
          className="text-foreground p-1 rounded-lg hover:bg-muted"
          onClick={() => setOpen(!open)}
          aria-label="Toggle Navigation Sidebar"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 bg-card z-50 flex flex-col justify-between p-6"
          >
            <div
              className="absolute top-4 right-4 text-foreground cursor-pointer p-2 rounded-full hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              <X size={24} />
            </div>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const SidebarLink = ({ link, className = "", onClick, ...props }) => {
  const { open, animate } = useSidebar();

  const isExternal = link.href?.startsWith("http");
  const Component = isExternal ? "a" : Link;
  const linkProps = isExternal ? { href: link.href, target: "_blank", rel: "noreferrer" } : { to: link.href };

  return (
    <Component
      {...linkProps}
      onClick={onClick}
      className={`flex items-center gap-3 group/sidebar py-2.5 px-2 rounded-xl hover:bg-muted/70 transition-all ${className}`}
      {...props}
    >
      <div className="shrink-0 flex items-center justify-center text-muted-foreground group-hover/sidebar:text-primary transition-colors">
        {link.icon}
      </div>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-xs font-semibold text-foreground group-hover/sidebar:text-primary whitespace-nowrap transition-colors overflow-hidden"
      >
        {link.label}
      </motion.span>
    </Component>
  );
};

export default Sidebar;
