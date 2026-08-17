import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Bot,
  Layers,
  FlaskConical
} from "lucide-react";

/**
 * AppSidebar — Radix-styled collapsible sidebar navigation component for Documentation and About pages.
 */
export const AppSidebar = ({
  groups = [],
  activeSection = "",
  onSectionClick = () => {},
  actionButton = null,
  headerTitle = "SaliDock Platform",
  headerSubtitle = "Structure-Based Screening",
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});

  const toggleExpand = (title) => {
    setExpandedItems((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-40 pt-20 flex flex-col bg-card border-r border-border/80 transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Sidebar Header */}
      <div className="p-3 border-b border-border/60 flex items-center justify-between shrink-0">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 px-2 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              <FlaskConical className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-foreground truncate">{headerTitle}</span>
              <span className="text-[10px] text-muted-foreground truncate">{headerSubtitle}</span>
            </div>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors ml-auto"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Sidebar Content Scroll Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-4">
        {groups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {!isCollapsed && group.label && (
              <h4 className="px-3 text-[10px] font-bold tracking-widest text-muted-foreground uppercase py-1">
                {group.label}
              </h4>
            )}
            <div className="space-y-0.5">
              {group.items?.map((item) => {
                const Icon = item.icon || Layers;
                const isActive = activeSection === item.id;
                const isExpanded = !!expandedItems[item.title];
                const hasSubItems = item.subItems && item.subItems.length > 0;

                return (
                  <div key={item.title} className="group/item">
                    <button
                      onClick={() => {
                        if (item.id) onSectionClick(item.id);
                        if (hasSubItems) toggleExpand(item.title);
                      }}
                      title={isCollapsed ? item.title : undefined}
                      className={`relative flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                        isActive
                          ? "text-primary bg-primary/10 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      } ${isCollapsed ? "justify-center" : ""}`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
                      )}
                      <Icon
                        size={17}
                        strokeWidth={isActive ? 2.5 : 2}
                        className={`shrink-0 ${isActive ? "text-primary" : "text-muted-foreground group-hover/item:text-foreground"}`}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="truncate flex-1 text-left">{item.title}</span>
                          {hasSubItems && (
                            <ChevronRight
                              size={14}
                              className={`shrink-0 text-muted-foreground transition-transform duration-200 ${
                                isExpanded ? "rotate-90 text-foreground" : ""
                              }`}
                            />
                          )}
                        </>
                      )}
                    </button>

                    {/* Sub-items list */}
                    {!isCollapsed && hasSubItems && isExpanded && (
                      <div className="ml-7 mt-0.5 pl-2 border-l border-border/60 space-y-0.5">
                        {item.subItems.map((sub) => {
                          const isSubActive = activeSection === sub.id;
                          return (
                            <button
                              key={sub.title}
                              onClick={() => sub.id && onSectionClick(sub.id)}
                              className={`block w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                                isSubActive
                                  ? "text-primary font-bold bg-primary/5"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                              }`}
                            >
                              {sub.title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sidebar Footer */}
      {!isCollapsed && actionButton && (
        <div className="p-3 border-t border-border/60 bg-muted/20 shrink-0">
          <button
            onClick={actionButton.onClick}
            className="w-full py-2 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all shadow-glow flex items-center justify-center gap-2"
          >
            <Sparkles size={14} />
            {actionButton.label}
          </button>
        </div>
      )}
    </aside>
  );
};

export default AppSidebar;
