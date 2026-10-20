import { forwardRef } from 'react';

/**
 * Apple-grade tactile Button.
 * 
 * Features:
 * - Instant active compression on pointer-down (scale: 0.975) with zero latency
 * - Chamfered specular light catching edge
 * - Optical letter-spacing and typography
 * - Frosted glass support for secondary and outline variants
 *
 * Variants: primary | secondary | ghost | destructive | outline
 * Sizes:    sm | md | lg | icon
 * Shapes:   pill (default) | rounded
 */
const VARIANTS = {
  primary:
    'bg-primary text-primary-foreground hover:brightness-105 shadow-sm shadow-primary/20 apple-specular-edge border border-primary/20',
  secondary:
    'bg-card/75 backdrop-blur-md text-foreground hover:bg-card border border-border/80 shadow-sm',
  ghost:
    'bg-transparent text-foreground hover:bg-muted/70 active:bg-muted',
  destructive:
    'bg-destructive text-destructive-foreground hover:brightness-105 shadow-sm border border-destructive/20',
  outline:
    'border border-border/90 bg-card/60 backdrop-blur-md text-foreground hover:bg-card hover:border-primary/40 shadow-sm',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs tracking-[-0.01em] gap-1.5',
  md: 'h-10 px-4 text-sm tracking-[-0.01em] gap-2',
  lg: 'h-11 px-6 text-[15px] font-semibold tracking-[-0.015em] gap-2.5',
  icon: 'h-9 w-9 p-0',
};

const Button = forwardRef(function Button(
  {
    as: Component = 'button',
    variant = 'primary',
    size = 'md',
    shape = 'pill',
    className = '',
    disabled,
    type = 'button',
    children,
    ...props
  },
  ref
) {
  const shapeCls = shape === 'pill' ? 'rounded-full' : 'rounded-xl';
  const isButton = Component === 'button';

  return (
    <Component
      ref={ref}
      type={isButton ? type : undefined}
      disabled={isButton ? disabled : undefined}
      className={[
        'inline-flex items-center justify-center font-medium select-none',
        'transition-all duration-150 ease-out',
        'active:scale-[0.975] active:brightness-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        shapeCls,
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </Component>
  );
});

export default Button;
