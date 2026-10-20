import React from 'react';
import { Check } from 'lucide-react';

/**
 * Horizontal stepper for the docking workflow.
 * steps: [{ key, label }]
 */
export default function Stepper({ steps, currentIndex, completed = {}, onStepClick }) {
    return (
        <nav aria-label="Workflow progress" className="mb-8">
            <ol className="flex items-center gap-2 sm:gap-3">
                {steps.map((step, i) => {
                    const isDone = completed[step.key];
                    const isCurrent = i === currentIndex;
                    const isReachable = i <= currentIndex || isDone;

                    return (
                        <React.Fragment key={step.key}>
                            <li className="flex-1">
                                <button
                                    type="button"
                                    onClick={() => isReachable && onStepClick?.(i)}
                                    disabled={!isReachable}
                                    className={`w-full text-left rounded-2xl border px-3.5 py-2.5 transition-all duration-150 ease-out active:scale-[0.98] flex items-center gap-3 ${
                                        isCurrent
                                            ? 'border-primary/40 bg-card/85 backdrop-blur-xl shadow-sm apple-specular-edge'
                                            : isDone
                                                ? 'border-border/80 bg-card/65 backdrop-blur-md hover:border-primary/30 hover:bg-card'
                                                : 'border-border/50 bg-card/30 opacity-50 cursor-not-allowed'
                                    }`}
                                >
                                    <span
                                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-transform ${
                                            isDone
                                                ? 'bg-primary text-primary-foreground shadow-xs'
                                                : isCurrent
                                                    ? 'bg-primary text-primary-foreground shadow-xs shadow-primary/30'
                                                    : 'bg-muted/70 text-muted-foreground'
                                        }`}
                                    >
                                        {isDone ? <Check size={14} aria-hidden="true" /> : i + 1}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Step {i + 1}</span>
                                        <span className={`block text-xs sm:text-sm font-semibold truncate tracking-tight ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
                                    </span>
                                </button>
                            </li>
                            {i < steps.length - 1 && (
                                <li aria-hidden="true" className="hidden sm:block w-4 h-px bg-border" />
                            )}
                        </React.Fragment>
                    );
                })}
            </ol>
        </nav>
    );
}
