import { forwardRef, useRef, useCallback } from 'react';

/**
 * Button with built-in MagicUI ripple effect on click.
 *
 * Variants: primary | secondary | ghost | destructive | outline
 * Sizes:    sm | md | lg | icon
 * Shapes:   pill (default for primary) | rounded
 *
 * `as` prop lets you render it as a different element (e.g. react-router Link).
 * `rippleColor` overrides the ripple colour (default: light blue).
 * `disableRipple` skips the effect (e.g. icon-only buttons).
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
    rippleColor = '#ADD8E6',
    disableRipple = false,
    onClick,
    ...props
  },
  ref
) {
  const innerRef = useRef(null);

  const shapeCls =
    (shape ?? (variant === 'primary' ? 'pill' : 'rounded')) === 'pill'
      ? 'rounded-full'
      : 'rounded-lg';

  const isButton = Component === 'button';

  const handleClick = useCallback(
    (e) => {
      if (!disableRipple) {
        const btn = (ref?.current ?? innerRef.current);
        if (btn) {
          const rect = btn.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const size = Math.max(rect.width, rect.height) * 2;

          const ripple = document.createElement('span');
          ripple.style.cssText = `
            position:absolute;
            border-radius:50%;
            pointer-events:none;
            width:${size}px;
            height:${size}px;
            top:${y - size / 2}px;
            left:${x - size / 2}px;
            background:${rippleColor};
            opacity:0.35;
            transform:scale(0);
            animation:salidock-ripple 0.6s ease-out forwards;
          `;
          btn.appendChild(ripple);
          ripple.addEventListener('animationend', () => ripple.remove());
        }
      }
      onClick?.(e);
    },
    [disableRipple, rippleColor, onClick, ref]
  );

  return (
    <>
      {/* Inject keyframes once — harmless if duplicated */}
      <style>{`
        @keyframes salidock-ripple {
          to { transform: scale(1); opacity: 0; }
        }
      `}</style>
      <Component
        ref={ref ?? innerRef}
        type={isButton ? type : undefined}
        disabled={isButton ? disabled : undefined}
        onClick={handleClick}
        className={[
          'relative overflow-hidden',
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
    </>
  );
});

export default Button;
