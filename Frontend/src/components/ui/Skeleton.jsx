/**
 * Skeleton — grey pulse placeholder used for loading surfaces.
 * Uses design-system tokens: bg-muted with animate-pulse.
 */
export default function Skeleton({ className = '', ...props }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-muted/60 ${className}`}
      {...props}
    />
  );
}
