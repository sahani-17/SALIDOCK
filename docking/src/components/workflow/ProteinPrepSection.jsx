import React from 'react';
import { FileText, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * Shared protein preparation section.
 * Shows chain selection, heteroatom selection, and a Prepare button after protein upload.
 */
export default function ProteinPrepSection({
    showProteinPrep,
    chains, selectedChains, setSelectedChains,
    heteroatoms, selectedHeteroatoms, setSelectedHeteroatoms,
    handleProteinPreparation,
    loading, proteinPrepared,
}) {
    if (!showProteinPrep) return null;

    return (
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
                <FileText className="w-6 h-6 text-gray-700" />
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Protein Configuration</h2>
                    <p className="text-sm text-gray-600">Select chains and heteroatoms to keep, then prepare the protein</p>
                </div>
            </div>

            {/* Chain Selection */}
            {chains.length > 0 && (
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Select Chains to Keep</label>
                    <div className="grid grid-cols-4 gap-2">
                        {chains.filter((chain) => {
                            // Only show chains with valid chain IDs (A, B, C, etc.)
                            const chainId = typeof chain === 'string' ? chain : chain.id;
                            return chainId && chainId.trim() !== '';
                        }).map((chain) => {
                            const chainId = typeof chain === 'string' ? chain : chain.id;
                            const chainAtoms = typeof chain === 'object' && chain.atoms ? ` (${chain.atoms} atoms)` : '';
                            return (
                                <label key={chainId} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedChains.includes(chainId)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedChains([...selectedChains, chainId]);
                                            } else {
                                                setSelectedChains(selectedChains.filter(c => c !== chainId));
                                            }
                                        }}
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                    />
                                    <span className="text-sm font-medium text-gray-900">
                                        Chain {chainId}{chainAtoms}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Heteroatom Selection */}
            {heteroatoms.length > 0 && (
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Select Heteroatoms to Keep</label>
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                        {heteroatoms.map((het) => (
                            <label key={het} className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedHeteroatoms.includes(het)}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedHeteroatoms([...selectedHeteroatoms, het]);
                                        } else {
                                            setSelectedHeteroatoms(selectedHeteroatoms.filter(h => h !== het));
                                        }
                                    }}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm font-mono text-gray-900">{het}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Prepare Protein Button */}
            <button
                onClick={handleProteinPreparation}
                disabled={loading || proteinPrepared}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg transition-colors text-sm font-semibold ${proteinPrepared
                        ? 'bg-green-100 text-green-800 border border-green-300 cursor-default'
                        : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed'
                    }`}
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Preparing...
                    </>
                ) : proteinPrepared ? (
                    <>
                        <CheckCircle2 className="w-4 h-4" />
                        Protein Prepared
                    </>
                ) : (
                    'Prepare Protein'
                )}
            </button>
        </section>
    );
}
