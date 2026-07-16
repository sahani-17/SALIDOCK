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

    return (
        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Protein Configuration</h2>
                    <p className="text-sm text-muted-foreground">Select chains and heteroatoms to keep, then prepare the protein</p>
                </div>
            </div>

            {!isBlind && chains.length > 0 && (
                <div className="mb-6">
                    <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3 block">Select Chains to Keep</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {chains.filter((chain) => {
                            const chainId = typeof chain === 'string' ? chain : chain.id;
                            return chainId && chainId.trim() !== '';
                        }).map((chain) => {
                            const chainId = typeof chain === 'string' ? chain : chain.id;
                            const chainAtoms = typeof chain === 'object' && chain.atoms ? ` · ${chain.atoms} atoms` : '';
                            return (
                                <label key={chainId} className={chipClass(selectedChains.includes(chainId))}>
                                    <input
                                        type="checkbox"
                                        checked={selectedChains.includes(chainId)}
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedChains([...selectedChains, chainId]);
                                            else setSelectedChains(selectedChains.filter(c => c !== chainId));
                                        }}
                                        className="accent-primary"
                                    />
                                    <span className="text-sm font-medium text-foreground">
                                        Chain {chainId}<span className="text-muted-foreground">{chainAtoms}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {heteroatoms.length > 0 && (
                <div className="mb-6">
                    <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3 block">Select Heteroatoms to Keep</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                        {heteroatoms.map((het) => (
                            <label key={het} className={chipClass(selectedHeteroatoms.includes(het))}>
                                <input
                                    type="checkbox"
                                    checked={selectedHeteroatoms.includes(het)}
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
