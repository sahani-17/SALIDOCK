import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { AnimatedCircularProgressBar } from '../ui/animated-circular-progress-bar';

export default function StatusBanners({ error, setError, loading, loadingMessage }) {
    const handleDismiss = () => {
        if (setError) setError(null);
        toast.dismiss();
    };

    return (
        <>
            {error && (
                <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start justify-between gap-3 animate-fade-in-up">
                    <div className="flex items-start gap-3 flex-1">
                        <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-destructive">{error}</p>
                            <button
                                onClick={handleDismiss}
                                className="text-xs text-destructive/80 underline mt-1 hover:text-destructive transition-colors"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="text-destructive/70 hover:text-destructive p-1 rounded-lg hover:bg-destructive/10 transition-colors shrink-0"
                        title="Dismiss error message"
                        aria-label="Dismiss error message"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {loading && (
                <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3">
                    <AnimatedCircularProgressBar size={24} strokeWidth={3.5} />
                    <p className="text-sm font-medium text-foreground">{loadingMessage}</p>
                </div>
            )}
        </>
    );
}
