import React from 'react';
import { Upload, Atom, Dna, CheckCircle2, Sparkles, Layers, RefreshCw } from 'lucide-react';
import { AnimatedCircularProgressBar } from '../ui/animated-circular-progress-bar';
import SegmentedControl from '../ui/SegmentedControl';

const QUICK_PROTEINS = [
    { label: '1HSG (HIV-1 Protease)', id: 'P03366', pdb: '1HSG' },
    { label: '6LU7 (SARS-CoV-2 Mpro)', id: 'P0DTD1', pdb: '6LU7' },
    { label: '1M17 (EGFR Kinase)', id: 'P00533', pdb: '1M17' },
];

const QUICK_LIGANDS = [
    { name: 'Aspirin', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
    { name: 'Caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' },
    { name: 'Imatinib', smiles: 'CC1=C(C(=O)N2CCOCC2)C=C(NC(=O)C3=CC=C(C=C3)CN4CCN(C)CC4)C=C1' },
];

/**
 * Shared input section: PDB / FASTA / UniProt for protein, SDF / SMILES for ligand.
 */
export default function InputSection({
    inputMode, setInputMode,
    proteinFile, handleProteinUpload,
    ligandFile, handleLigandUpload,
    smilesInput, setSmilesInput,
    smilesString, setSmilesString,
    ligandName, setLigandName,
    ligandInputMethod, setLigandInputMethod,
    handleSmilesSubmit,
    alphafoldMode, setAlphafoldMode,
    fastaSequence, setFastaSequence,
    uniprotId, setUniprotId,
    uniprotInfo,
    handleSequencePrediction,
    handleUniProtFetch,
    uploadProgress,
    savedProteinFilename,
    savedLigandFilename,
    sessionId, loading,
}) {
    const sessionReady = Boolean(sessionId);

    const inputClass = "w-full h-10 px-3.5 rounded-xl bg-card/60 backdrop-blur-md border border-border/80 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-150";
    const textareaClass = "w-full rounded-2xl bg-card/60 backdrop-blur-md border border-border/80 text-foreground text-xs p-3.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-150 resize-none font-mono-code";
    const btnPrimary = "px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out disabled:opacity-40 shadow-sm shadow-primary/20 apple-specular-edge inline-flex items-center gap-2";

    const proteinInputMethod =
        inputMode === 'upload' ? 'file' : alphafoldMode === 'uniprot' ? 'uniprot' : 'fasta';

    const combinedSmiles = smilesString || smilesInput;
    const setCombinedSmiles = (value) => { setSmilesString(value); setSmilesInput(value); };

    return (
        <section className="rounded-3xl bg-card/75 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-border/60">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                        <Layers size={20} aria-hidden="true" />
                    </div>
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">Target Receptor & Chemical Ligand Intake</h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Select a macromolecular protein structure and target small molecule for molecular docking.</p>
                    </div>
                </div>

                {!sessionReady && (
                    <div className="px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/5 flex items-center gap-2 self-start sm:self-auto">
                        <AnimatedCircularProgressBar size={14} strokeWidth={2.5} />
                        <span className="text-xs font-medium text-foreground">
                            Initializing workspace session...
                        </span>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Protein */}
                <div className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md p-5 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    <Dna size={15} />
                                </div>
                                <h3 className="font-bold text-sm tracking-tight text-foreground">1. Target Protein Receptor</h3>
                            </div>
                            {uploadProgress.protein && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    <CheckCircle2 size={11} /> Loaded
                                </span>
                            )}
                        </div>

                        <SegmentedControl
                            id="protein-method"
                            value={proteinInputMethod}
                            onChange={(val) => {
                                if (val === 'file') setInputMode('upload');
                                else if (val === 'fasta') { setInputMode('alphafold'); setAlphafoldMode('sequence'); }
                                else if (val === 'uniprot') { setInputMode('alphafold'); setAlphafoldMode('uniprot'); }
                            }}
                            options={[
                                { value: 'file', label: 'PDB File' },
                                { value: 'fasta', label: 'FASTA' },
                                { value: 'uniprot', label: 'UniProt' },
                            ]}
                            className="w-full mb-4"
                        />

                        {proteinInputMethod === 'file' && (
                            <div>
                                <label className={`block ${sessionReady && !loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                    <input type="file" accept=".pdb,.ent" onChange={handleProteinUpload} className="hidden" id="protein-upload" disabled={!sessionReady || loading} />
                                    <div className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all duration-200 ease-out active:scale-[0.99] ${
                                        uploadProgress.protein
                                            ? 'border-primary/50 bg-primary/[0.04]'
                                            : 'border-border/70 hover:border-primary/50 hover:bg-card/60 bg-card/20'
                                    }`}>
                                        {uploadProgress.protein ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                                    <CheckCircle2 size={22} aria-hidden="true" />
                                                </div>
                                                <span className="text-xs sm:text-sm font-semibold text-foreground font-mono-code truncate max-w-[280px]">
                                                    {proteinFile?.name || savedProteinFilename || 'Target Structure Uploaded'}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground">Click to upload a different PDB structure</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-10 h-10 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                                                    <Upload size={20} aria-hidden="true" />
                                                </div>
                                                <span className="text-xs sm:text-sm font-semibold text-foreground">
                                                    {sessionReady ? 'Click to choose receptor structure' : 'Waiting for session…'}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground">Standard PDB or ENT crystallography format</span>
                                            </div>
                                        )}
                                    </div>
                                </label>
                            </div>
                        )}

                        {proteinInputMethod === 'fasta' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1.5 block">Protein Sequence (FASTA)</label>
                                    <textarea
                                        value={fastaSequence}
                                        onChange={(e) => setFastaSequence(e.target.value)}
                                        placeholder={"Enter amino acid sequence (max 400 residues)\nExample: ACDEFGHIKLMNPQRSTVWY..."}
                                        className={textareaClass}
                                        rows="5"
                                        disabled={!sessionId || loading}
                                    />
                                    <p className="text-[11px] text-muted-foreground mt-1">Valid 20 standard amino acids · Max 400 residues (ESMFold)</p>
                                </div>
                                <button type="button" onClick={handleSequencePrediction} disabled={!sessionReady || !fastaSequence.trim() || loading} className={btnPrimary}>
                                    <Sparkles size={14} aria-hidden="true" />
                                    Predict Structure
                                </button>
                            </div>
                        )}

                        {proteinInputMethod === 'uniprot' && (
                            <div className="space-y-3">
                                <div>
                                    {/* Quick benchmark chips */}
                                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Benchmarks:</span>
                                        {QUICK_PROTEINS.map((p) => (
                                            <button
                                                key={p.pdb}
                                                type="button"
                                                onClick={() => { setUniprotId(p.id); }}
                                                className="text-[11px] px-2.5 py-0.5 rounded-full bg-card/80 border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-95 transition-all"
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>

                                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1.5 block">UniProt Accession ID</label>
                                    <input
                                        type="text"
                                        value={uniprotId}
                                        onChange={(e) => setUniprotId(e.target.value.trim().toUpperCase())}
                                        placeholder="e.g., P00533 (EGFR), P03366 (HIV-1 Protease)"
                                        className={inputClass}
                                        disabled={!sessionId || loading}
                                    />
                                    <p className="text-[11px] text-muted-foreground mt-1">Directly resolves predicted 3D coordinates from the AlphaFold DB</p>
                                </div>

                                {uniprotInfo && (
                                    <div className="p-3.5 bg-primary/5 border border-primary/20 rounded-2xl text-xs space-y-1">
                                        <h4 className="font-bold text-primary mb-1">UniProt Metadata</h4>
                                        <p className="text-foreground"><span className="text-muted-foreground font-semibold">Protein:</span> {uniprotInfo.protein_name || 'N/A'}</p>
                                        <p className="text-foreground"><span className="text-muted-foreground font-semibold">Organism:</span> {uniprotInfo.organism || 'N/A'}</p>
                                        <p className="text-foreground"><span className="text-muted-foreground font-semibold">Length:</span> {uniprotInfo.sequence_length || 0} residues</p>
                                    </div>
                                )}

                                <button type="button" onClick={handleUniProtFetch} disabled={!sessionReady || !uniprotId.trim() || loading} className={btnPrimary}>
                                    <Sparkles size={14} aria-hidden="true" />
                                    Fetch from AlphaFold DB
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Ligand */}
                <div className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md p-5 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                    <Atom size={15} />
                                </div>
                                <h3 className="font-bold text-sm tracking-tight text-foreground">2. Ligand Molecule</h3>
                            </div>
                            {uploadProgress.ligand && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                    <CheckCircle2 size={11} /> Loaded
                                </span>
                            )}
                        </div>

                        <SegmentedControl
                            id="ligand-method"
                            value={ligandInputMethod}
                            onChange={setLigandInputMethod}
                            options={[
                                { value: 'file', label: 'SDF / MOL2' },
                                { value: 'smiles', label: 'SMILES String' },
                            ]}
                            className="w-full mb-4"
                        />

                        {ligandInputMethod === 'file' && (
                            <div>
                                <label className={`block ${sessionReady && !loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                    <input type="file" accept=".sdf,.mol,.mol2" onChange={handleLigandUpload} className="hidden" id="ligand-upload" disabled={!sessionReady || loading} />
                                    <div className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all duration-200 ease-out active:scale-[0.99] ${
                                        uploadProgress.ligand
                                            ? 'border-primary/50 bg-primary/[0.04]'
                                            : 'border-border/70 hover:border-primary/50 hover:bg-card/60 bg-card/20'
                                    }`}>
                                        {uploadProgress.ligand ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                                    <CheckCircle2 size={22} aria-hidden="true" />
                                                </div>
                                                <span className="text-xs sm:text-sm font-semibold text-foreground font-mono-code truncate max-w-[280px]">
                                                    {ligandFile?.name || savedLigandFilename || 'Ligand Molecule Uploaded'}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground">Click to replace chemical structure file</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-10 h-10 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                                                    <Upload size={20} aria-hidden="true" />
                                                </div>
                                                <span className="text-xs sm:text-sm font-semibold text-foreground">
                                                    {sessionReady ? 'Click to upload molecule' : 'Waiting for session…'}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground">Supports SDF, MOL or MOL2 with 3D coordinates</span>
                                            </div>
                                        )}
                                    </div>
                                </label>
                            </div>
                        )}

                        {ligandInputMethod === 'smiles' && (
                            <div className="space-y-3">
                                {/* Quick ligand chips */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick Compounds:</span>
                                    {QUICK_LIGANDS.map((item) => (
                                        <button
                                            key={item.name}
                                            type="button"
                                            onClick={() => { setLigandName(item.name.toLowerCase()); setCombinedSmiles(item.smiles); }}
                                            className="text-[11px] px-2.5 py-0.5 rounded-full bg-card/80 border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-95 transition-all"
                                        >
                                            {item.name}
                                        </button>
                                    ))}
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1 block">Compound Name</label>
                                    <input type="text" value={ligandName} onChange={(e) => setLigandName(e.target.value)} placeholder="e.g. aspirin" className={inputClass} disabled={!sessionId || loading} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1 block">SMILES Representation</label>
                                    <input
                                        type="text"
                                        value={combinedSmiles}
                                        onChange={(e) => setCombinedSmiles(e.target.value)}
                                        placeholder="e.g., CC(=O)OC1=CC=CC=C1C(=O)O"
                                        className={inputClass}
                                        disabled={!sessionId || loading}
                                    />
                                    <p className="text-[11px] text-muted-foreground mt-1 font-mono-code">Generates initial 3D MMFF94 conformer automatically</p>
                                </div>
                                <button type="button" onClick={handleSmilesSubmit} disabled={!sessionReady || !combinedSmiles.trim() || loading} className={btnPrimary}>
                                    <Sparkles size={14} />
                                    Generate 3D Structure
                                </button>
                                {uploadProgress.ligand && savedLigandFilename && (
                                    <p className="text-xs text-primary font-semibold flex items-center gap-1 mt-1">
                                        <CheckCircle2 size={13} /> Generated: {savedLigandFilename}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
