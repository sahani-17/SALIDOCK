import React from 'react';
import { FileText, CheckCircle2 } from 'lucide-react';
import { AnimatedCircularProgressBar } from '../ui/animated-circular-progress-bar';

export default function ProteinPrepSection({
    showProteinPrep,
    chains, selectedChains, setSelectedChains,
    heteroatoms, selectedHeteroatoms, setSelectedHeteroatoms,
    handleProteinPreparation,
    loading, loadingMessage, proteinPrepared,
    isBlind = false,
}) {
    if (!showProteinPrep) return null;

    const chipClass = (active) =>
        `flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
            active
                ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:border-primary/30 bg-card'
        }`;

    const toggleChain = (chainId) => {
        if (selectedChains.includes(chainId)) {
            setSelectedChains(selectedChains.filter(c => c !== chainId));
        } else {
            setSelectedChains([...selectedChains, chainId]);
        }
    };

    return (
        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Protein Configuration</h2>
                    <p className="text-sm text-muted-foreground">Select chains and heteroatoms to keep, then prepare the protein</p>
                </div>
            </div>

            {/* Chain Selector */}
            {chains && chains.length > 0 && (
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                            Select Chains to Preserve
                        </label>
                        <span className="text-[11px] text-muted-foreground">
                            {selectedChains.length === 0
                                ? 'All chains kept (none selected)'
                                : `${selectedChains.length} of ${chains.length} selected`}
                        </span>
                    </div>
                    {(() => {
                        // Find the chain with the most atoms — that's the suggested target receptor
                        const suggestedChain = chains.length > 1
                            ? chains.reduce((best, c) => (c.atoms ?? 0) > (best.atoms ?? 0) ? c : best, chains[0])
                            : null;
                        const suggestedId = suggestedChain?.id ?? suggestedChain;
                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                {chains.map((chain) => {
                                    const id = chain.id ?? chain;
                                    const atoms = chain.atoms;
                                    const rawName = chain.name || '';
                                    const nameSource = chain.name_source || 'unknown';
                                    // Title-case the name for display
                                    const name = rawName
                                        ? rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                                        : null;
                                    // Hide uninformative fallback on single-chain files
                                    const showName = name && !(chains.length === 1 && nameSource === 'unknown');
                                    // Inferred names (not from COMPND) shown in italic/muted
                                    const nameIsConfident = nameSource === 'compnd';
                                    const active = selectedChains.includes(id);
                                    const isSuggested = chains.length > 1 && id === suggestedId;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => toggleChain(id)}
                                            disabled={proteinPrepared}
                                            className={`relative flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border font-semibold text-sm transition-all disabled:cursor-not-allowed ${
                                                active
                                                    ? 'border-primary/50 bg-primary/8 text-primary ring-1 ring-primary/20'
                                                    : isSuggested
                                                        ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60 text-foreground'
                                                        : 'border-border hover:border-primary/30 bg-card text-foreground'
                                            }`}
                                        >
                                            <span className="font-mono-code font-bold">Chain {id}</span>
                                            {showName && (
                                                <span
                                                    className={`text-[10px] leading-tight max-w-[120px] truncate ${
                                                        nameIsConfident
                                                            ? 'font-medium text-foreground/70'
                                                            : 'font-normal italic text-muted-foreground'
                                                    }`}
                                                    title={`${name}${!nameIsConfident ? ` (inferred from ${nameSource})` : ''}`}
                                                >
                                                    {name}
                                                </span>
                                            )}
                                            {atoms !== undefined && (
                                                <span className="text-[10px] font-normal text-muted-foreground">{atoms} atoms</span>
                                            )}
                                            {isSuggested && (
                                                <span className="absolute -top-2 -right-1 text-[9px] font-bold uppercase tracking-wide bg-emerald-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                                                    Suggested
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })()}
                    <p className="text-[11px] text-muted-foreground mt-2 italic">
                        Leave all unselected to preserve all chains. Only checked chains will be written to the prepared PDBQT.
                    </p>
                    {chains.length > 1 && (
                        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                            </svg>
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                                Multiple chains detected. PDB files often contain crystallographic copies, fusion proteins (e.g. T4 Lysozyme), or complex partners alongside the target. The <strong>Suggested</strong> chain is the largest by atom count — verify it matches your intended docking target using the RCSB PDB page before proceeding.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Heteroatom Selector */}
            {heteroatoms.length > 0 && (
                <div className="mb-6">
                    <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3 block">Select Heteroatoms / Cofactors to Keep</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                        {heteroatoms.map((het) => (
                            <label key={het} className={chipClass(selectedHeteroatoms.includes(het))}>
                                <input
                                    type="checkbox"
                                    checked={selectedHeteroatoms.includes(het)}
                                    disabled={proteinPrepared}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedHeteroatoms([...selectedHeteroatoms, het]);
                                        else setSelectedHeteroatoms(selectedHeteroatoms.filter(h => h !== het));
                                    }}
                                    className="accent-primary"
                                />
                                <span className="text-sm font-mono-code text-foreground">{het}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <button
                onClick={handleProteinPreparation}
                disabled={loading || proteinPrepared}
                className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
            >
                {loading && loadingMessage?.includes('Preparing protein') ? (
                    <><AnimatedCircularProgressBar size={16} strokeWidth={3} /> Preparing…</>
                ) : proteinPrepared ? (
                    <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Protein Prepared</>
                ) : (
                    'Prepare Protein'
                )}
            </button>
        </section>
    );
}
