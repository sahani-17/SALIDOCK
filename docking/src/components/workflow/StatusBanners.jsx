import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * Shared error display + loading overlay banners (dark theme).
 */
export default function StatusBanners({ error, setError, loading, loadingMessage }) {
    return (
        <>
            {error && (
                <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-destructive">{error}</p>
                        <button
                            onClick={() => setError(null)}
                            className="text-xs text-destructive/70 underline mt-1"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {loading && (
                <div className="mb-6 p-4 bg-info/10 border border-info/20 rounded-lg flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-info animate-spin" />
                    <p className="text-sm font-medium text-info">{loadingMessage}</p>
                </div>
            )}
        </>
    );
}
