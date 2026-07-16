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
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-semibold text-foreground transition-all hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="truncate text-foreground">{selected?.label || value}</span>
        <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-border bg-popover shadow-elevated">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full px-3.5 py-2 text-left text-xs transition-colors ${
                opt.value === value ? 'bg-primary/10 font-bold text-primary' : 'text-foreground hover:bg-muted'
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
