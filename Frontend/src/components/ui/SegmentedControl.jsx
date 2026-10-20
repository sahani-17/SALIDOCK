import React from 'react';
import { motion } from 'framer-motion';

/**
 * Apple iOS / macOS Style Segmented Control
 * 
 * Uses Framer Motion's layout spring for a seamless physical sliding capsule
 * between options.
 *
 * @param {Array<{ value: string|number, label: React.ReactNode, icon?: React.ComponentType }>} options
 * @param {string|number} value - currently selected value
 * @param {(val: string|number) => void} onChange
 * @param {string} [className]
 * @param {string} [size='md'] - 'sm' | 'md'
 * @param {boolean} [disabled]
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  className = '',
  size = 'md',
  disabled = false,
  id = 'segmented-control',
}) {
  const sizeClasses = {
    sm: 'p-0.5 text-xs h-7',
    md: 'p-1 text-xs sm:text-sm h-9',
  };

  const itemPadding = {
    sm: 'px-2.5 py-0.5',
    md: 'px-3 py-1',
  };

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`relative inline-flex items-center rounded-xl bg-muted/60 backdrop-blur-md border border-border/60 p-1 shadow-inner select-none ${sizeClasses[size]} ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 font-medium transition-colors duration-150 rounded-lg text-center ${itemPadding[size]} ${
              isSelected
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground/80'
            }`}
          >
            {isSelected && (
              <motion.div
                layoutId={`active-segment-${id}`}
                className="absolute inset-0 z-[-1] rounded-lg bg-card shadow-sm border border-border/80 apple-specular-edge"
                transition={{
                  type: 'spring',
                  stiffness: 450,
                  damping: 35,
                }}
              />
            )}
            {Icon && <Icon size={size === 'sm' ? 13 : 15} className="shrink-0" />}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
