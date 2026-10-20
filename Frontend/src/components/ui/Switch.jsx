import React from 'react';
import { motion } from 'framer-motion';

/**
 * Apple iOS Style Physical Toggle Switch
 * 
 * Features:
 * - Fluid spring-animated sliding knob
 * - Tactile pointer-down depression
 * - Accessible keyboard & ARIA attributes
 *
 * @param {boolean} checked
 * @param {(checked: boolean) => void} onChange
 * @param {string} [label]
 * @param {boolean} [disabled]
 * @param {string} [className]
 */
export default function Switch({
  checked = false,
  onChange,
  label,
  disabled = false,
  className = '',
  id,
}) {
  const switchId = id || (label ? `switch-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  const toggle = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <label
      htmlFor={switchId}
      className={`inline-flex items-center gap-2.5 cursor-pointer select-none text-xs sm:text-sm font-medium ${
        disabled ? 'opacity-40 pointer-events-none cursor-not-allowed' : ''
      } ${className}`}
    >
      <div
        id={switchId}
        role="switch"
        tabIndex={disabled ? -1 : 0}
        aria-checked={checked}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/40'
        }`}
      >
        <motion.span
          layout
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 32,
          }}
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md border border-black/5 transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
      {label && <span className="text-foreground/90">{label}</span>}
    </label>
  );
}
