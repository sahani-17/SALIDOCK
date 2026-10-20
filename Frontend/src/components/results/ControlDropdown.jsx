import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export default function ControlDropdown({ label, value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative min-w-[160px]">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-card/80 backdrop-blur-md px-3.5 py-2 text-left text-xs font-semibold text-foreground transition-all duration-150 active:scale-[0.98] hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 apple-specular-edge shadow-xs"
      >
        <span className="mr-1 text-[9px] uppercase tracking-[0.08em] font-bold text-muted-foreground">{label}</span>
        <span className="truncate text-foreground font-medium">{selected?.label || value}</span>
        <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform duration-200 ease-out ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 min-w-full overflow-hidden rounded-xl border border-border/80 bg-popover/90 backdrop-blur-2xl shadow-xl apple-specular-edge p-1 animate-fade-in">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full px-3 py-1.5 rounded-lg text-left text-xs transition-colors ${
                opt.value === value ? 'bg-primary/10 font-bold text-primary' : 'text-foreground hover:bg-muted/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
