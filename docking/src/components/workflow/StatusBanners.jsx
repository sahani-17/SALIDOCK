import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * Shared error display + loading overlay banners.
 * Props: error, setError, loading, loadingMessage
 */
export default function StatusBanners({ error, setError, loading, loadingMessage }) {
    return (
        <>
            {/* Error Display */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                        <p className="text-sm font-medium text-red-900">{error}</p>
                        <button
                            onClick={() => setError(null)}
                            className="text-xs text-red-700 underline mt-1"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Loading Overlay */}
            {loading && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    <p className="text-sm font-medium text-blue-900">{loadingMessage}</p>
                </div>
            )}
        </>
    );
}
