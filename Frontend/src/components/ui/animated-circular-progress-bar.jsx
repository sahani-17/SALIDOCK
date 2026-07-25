import React from "react";

/**
 * AnimatedCircularProgressBar (Magic UI component)
 * Renders a GPU-accelerated animated SVG circular gauge for determinate progress and smooth continuous loading.
 * Ensures continuous rotation/motion in both indeterminate and determinate modes so the user never perceives a freeze.
 */
export function AnimatedCircularProgressBar({
  max = 100,
  min = 0,
  value,
  indeterminate = false,
  gaugePrimaryColor = "hsl(var(--primary))",
  gaugeSecondaryColor = "hsl(var(--border))",
  className = "",
  label,
  sublabel,
  size = 80,
  strokeWidth = 7,
  icon,
}) {
  const radius = Math.max(1, (size - strokeWidth) / 2);
  const circumference = 2 * Math.PI * radius;

  const isIndeterminate = indeterminate || value === undefined || value === null;
  const currentPercent = isIndeterminate
    ? 60
    : Math.min(100, Math.max(0, Math.round(((value - min) / (max - min)) * 100)));

  const strokeDashoffset = circumference - (circumference * currentPercent) / 100;

  return (
    <div
      className={`relative inline-flex items-center justify-center font-sans shrink-0 pointer-events-none ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <style>{`
        @keyframes salidock-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes salidock-pulse-dash {
          0% { stroke-dasharray: 1px, ${circumference}px; stroke-dashoffset: 0; }
          50% { stroke-dasharray: ${circumference * 0.75}px, ${circumference}px; stroke-dashoffset: -${circumference * 0.25}px; }
          100% { stroke-dasharray: ${circumference * 0.75}px, ${circumference}px; stroke-dashoffset: -${circumference}px; }
        }
        .salidock-circular-spinner {
          animation: salidock-spin 1.4s linear infinite;
          will-change: transform;
        }
        .salidock-determinate-spinner {
          animation: salidock-spin 3.5s linear infinite;
          will-change: transform;
        }
        .salidock-circular-dash {
          animation: salidock-pulse-dash 1.6s ease-in-out infinite;
          transform-origin: center;
          will-change: stroke-dasharray, stroke-dashoffset;
        }
      `}</style>

      <svg
        className={`w-full h-full ${isIndeterminate ? "salidock-circular-spinner" : "salidock-determinate-spinner"}`}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset="0"
          strokeLinecap="round"
          stroke={gaugeSecondaryColor}
          fill="none"
          className="opacity-35"
        />
        {/* Primary animated progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={isIndeterminate ? undefined : strokeDashoffset}
          strokeLinecap="round"
          stroke={gaugePrimaryColor}
          fill="none"
          className={isIndeterminate ? "salidock-circular-dash" : "transition-all duration-500 ease-out"}
        />
      </svg>

      {/* Central label display — stays upright and static while outer gauge continuously spins */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 leading-none select-none pointer-events-none">
        {icon ? (
          icon
        ) : isIndeterminate ? (
          <span className="text-[9px] font-bold tracking-wider text-primary uppercase animate-pulse">
            {label || "Wait..."}
          </span>
        ) : (
          <>
            <span className="text-xs font-bold tracking-tight text-foreground font-mono-code">
              {currentPercent}%
            </span>
            {sublabel && (
              <span className="text-[8px] font-semibold text-muted-foreground font-mono-code mt-0.5">
                {sublabel}
              </span>
            )}
            {label && (
              <span className="text-[7px] uppercase font-bold text-primary tracking-widest mt-0.5">
                {label}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AnimatedCircularProgressBar;
