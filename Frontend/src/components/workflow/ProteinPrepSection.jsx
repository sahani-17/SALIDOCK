import React from 'react';
import { FileText, CheckCircle2, Loader2 } from 'lucide-react';

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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {chains.map((chain) => {
                            const id = chain.id ?? chain;
                            const atoms = chain.atoms;
                            const active = selectedChains.includes(id);
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => toggleChain(id)}
                                    disabled={proteinPrepared}
                                    className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border font-semibold text-sm transition-all disabled:cursor-not-allowed ${
                                        active
                                            ? 'border-primary/50 bg-primary/8 text-primary ring-1 ring-primary/20'
                                            : 'border-border hover:border-primary/30 bg-card text-foreground'
                                    }`}
                                >
                                    <span className="font-mono-code font-bold">Chain {id}</span>
                                    {atoms !== undefined && (
                                        <span className="text-[11px] font-normal text-muted-foreground">{atoms} atoms</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 italic">
                        Leave all unselected to preserve all chains. Only checked chains will be written to the prepared PDBQT.
                    </p>
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
                    <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Preparing…</>
                ) : proteinPrepared ? (
                    <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Protein Prepared</>
                ) : (
                    'Prepare Protein'
                )}
            </button>
        </section>
    );
}
