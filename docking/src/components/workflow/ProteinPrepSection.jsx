import React from 'react';
import { FileText, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * Shared protein preparation section (light theme).
 */
export default function ProteinPrepSection({
    showProteinPrep,
    chains, selectedChains, setSelectedChains,
    heteroatoms, selectedHeteroatoms, setSelectedHeteroatoms,
    handleProteinPreparation,
    loading, loadingMessage, proteinPrepared,
    isBlind = false,
}) {
    if (!showProteinPrep) return null;

    return (
        <section className="rounded-2xl bg-white border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
                <FileText className="w-6 h-6 text-blue-600" />
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Protein Configuration</h2>
                    <p className="text-sm text-slate-600">Select chains and heteroatoms to keep, then prepare the protein</p>
                </div>
            </div>

            {/* Chain Selection */}
            {!isBlind && chains.length > 0 && (
                <div className="mb-6">
                    <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 block">Select Chains to Keep</label>
                    <div className="grid grid-cols-4 gap-2">
                        {chains.filter((chain) => {
                            const chainId = typeof chain === 'string' ? chain : chain.id;
                            return chainId && chainId.trim() !== '';
                        }).map((chain) => {
                            const chainId = typeof chain === 'string' ? chain : chain.id;
                            const chainAtoms = typeof chain === 'object' && chain.atoms ? ` (${chain.atoms} atoms)` : '';
                            return (
                                <label key={chainId} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${selectedChains.includes(chainId)
                                        ? 'border-blue-300 bg-blue-50'
                                        : 'border-slate-200 hover:border-blue-200 bg-white'
                                    }`}>
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
                                        className="accent-blue-600"
                                    />
                                    <span className="text-sm font-medium text-slate-900">
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
                    <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 block">Select Heteroatoms to Keep</label>
                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                        {heteroatoms.map((het) => (
                            <label key={het} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${selectedHeteroatoms.includes(het)
                                    ? 'border-blue-300 bg-blue-50'
                                    : 'border-slate-200 hover:border-blue-200 bg-white'
                                }`}>
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
                                    className="accent-blue-600"
                                />
                                <span className="text-sm font-mono text-slate-900">{het}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Prepare Protein Button */}
            <button
                onClick={handleProteinPreparation}
                disabled={loading || proteinPrepared}
                className="px-5 py-2 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
            >
                {loading && loadingMessage?.includes('Preparing protein') ? (
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
