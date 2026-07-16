import { forwardRef } from 'react';

/**
 * Single Button component with variants + sizes.
 * All buttons in the app should route through this to keep shapes/sizes consistent.
 *
 * Variants: primary | secondary | ghost | destructive | outline
 * Sizes:    sm | md | lg | icon
 * Shapes:   pill (default for primary) | rounded
 *
 * `as` prop lets you render it as a different element (e.g. react-router Link).
 */
const VARIANTS = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost:
    'bg-transparent text-foreground hover:bg-muted',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline:
    'border border-border bg-card text-foreground hover:bg-muted',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-7 text-base',
  icon: 'h-11 w-11 p-0',
};

const Button = forwardRef(function Button(
  {
    as: Component = 'button',
    variant = 'primary',
    size = 'md',
    shape,
    className = '',
    disabled,
    type = 'button',
    children,
    ...props
  },
  ref
) {
  const shapeCls =
    (shape ?? (variant === 'primary' ? 'pill' : 'rounded')) === 'pill'
      ? 'rounded-full'
      : 'rounded-lg';

  const isButton = Component === 'button';

  return (
    <Component
      ref={ref}
      type={isButton ? type : undefined}
      disabled={isButton ? disabled : undefined}
      className={[
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:cursor-not-allowed',
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
