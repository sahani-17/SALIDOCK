import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

export default function StatusBanners({ error, setError, loading, loadingMessage }) {
    return (
        <>
            {error && (
                <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-destructive">{error}</p>
                        <button
                            onClick={() => setError(null)}
                            className="text-xs text-destructive/80 underline mt-1 hover:text-destructive"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {loading && (
                <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    <p className="text-sm font-medium text-foreground">{loadingMessage}</p>
                </div>
            )}
        </>
    );
}
