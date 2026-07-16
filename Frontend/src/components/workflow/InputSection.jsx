import React from 'react';
import { Upload, Atom, Dna, CheckCircle2, Loader2 } from 'lucide-react';

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

    const tabClass = (active) =>
        `flex-1 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-all ${
            active
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
        }`;

    const inputClass = "w-full h-10 px-3 rounded-lg bg-card border border-border text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all";
    const textareaClass = "w-full rounded-lg bg-card border border-border text-foreground text-sm p-3 focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all resize-none font-mono-code";
    const btnPrimary = "px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5";

    const proteinInputMethod =
        inputMode === 'upload' ? 'file' : alphafoldMode === 'uniprot' ? 'uniprot' : 'fasta';

    const combinedSmiles = smilesString || smilesInput;
    const setCombinedSmiles = (value) => { setSmilesString(value); setSmilesInput(value); };

    const uploadCardClass = (done) =>
        `border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            done
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-primary/40 bg-background'
        }`;

    return (
        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Upload size={18} className="text-primary" aria-hidden="true" />
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Upload Input Files</h2>
                    <p className="text-sm text-muted-foreground">Select your protein and ligand to begin the docking workflow</p>
                </div>
            </div>

            {!sessionReady && (
                <div className="mb-5 p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-2">
                    <Loader2 size={14} className="text-primary mt-0.5 animate-spin" aria-hidden="true" />
                    <p className="text-xs text-muted-foreground">
                        Preparing your docking session. Uploads unlock once the session is created.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Protein */}
                <div className="rounded-2xl border border-border bg-background/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Dna size={16} className="text-primary" aria-hidden="true" />
                        <h3 className="font-semibold text-foreground">Protein Receptor</h3>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <button type="button" className={tabClass(proteinInputMethod === 'file')} onClick={() => setInputMode('upload')}>PDB File</button>
                        <button type="button" className={tabClass(proteinInputMethod === 'fasta')} onClick={() => { setInputMode('alphafold'); setAlphafoldMode('sequence'); }}>FASTA</button>
                        <button type="button" className={tabClass(proteinInputMethod === 'uniprot')} onClick={() => { setInputMode('alphafold'); setAlphafoldMode('uniprot'); }}>UniProt</button>
                    </div>

                    {proteinInputMethod === 'file' && (
                        <label className={`block ${sessionReady && !loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                            <input type="file" accept=".pdb,.ent" onChange={handleProteinUpload} className="hidden" id="protein-upload" disabled={!sessionReady || loading} />
                            <div className={uploadCardClass(uploadProgress.protein)}>
                                {uploadProgress.protein ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 size={24} className="text-primary" aria-hidden="true" />
                                        <span className="text-sm font-medium text-foreground">{proteinFile?.name || savedProteinFilename || 'Uploaded'}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload size={24} className="text-muted-foreground" aria-hidden="true" />
                                        <span className="text-sm font-medium text-foreground">
                                            {sessionReady ? 'Click to upload structure' : 'Waiting for session…'}
                                        </span>
                                        <span className="text-xs text-muted-foreground">PDB or ENT format</span>
                                    </div>
                                )}
                            </div>
                        </label>
                    )}

                    {proteinInputMethod === 'fasta' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5 block">Protein Sequence (FASTA)</label>
                                <textarea
                                    value={fastaSequence}
                                    onChange={(e) => setFastaSequence(e.target.value)}
                                    placeholder={"Enter amino acid sequence (max 400 residues)\nExample: ACDEFGHIKLMNPQRSTVWY..."}
                                    className={textareaClass}
                                    rows="6"
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Valid amino acids: ACDEFGHIKLMNPQRSTVWY · Max 400 residues</p>
                            </div>
                            <button type="button" onClick={handleSequencePrediction} disabled={!sessionReady || !fastaSequence.trim() || loading} className={btnPrimary}>
                                <Dna size={14} aria-hidden="true" />Predict Structure
                            </button>
                        </div>
                    )}

                    {proteinInputMethod === 'uniprot' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5 block">UniProt Accession ID</label>
                                <input
                                    type="text"
                                    value={uniprotId}
                                    onChange={(e) => setUniprotId(e.target.value.trim().toUpperCase())}
                                    placeholder="e.g., P12345"
                                    className={inputClass}
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Format: 6-10 uppercase alphanumeric characters</p>
                            </div>

                            {uniprotInfo && (
                                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                                    <h4 className="font-semibold text-primary mb-2 text-sm">Protein Information</h4>
                                    <p className="text-sm text-foreground"><span className="text-muted-foreground">Name:</span> {uniprotInfo.protein_name || 'N/A'}</p>
                                    <p className="text-sm text-foreground"><span className="text-muted-foreground">Organism:</span> {uniprotInfo.organism || 'N/A'}</p>
                                    <p className="text-sm text-foreground"><span className="text-muted-foreground">Length:</span> {uniprotInfo.sequence_length || 0} residues</p>
                                </div>
                            )}

                            <button type="button" onClick={handleUniProtFetch} disabled={!sessionReady || !uniprotId.trim() || loading} className={btnPrimary}>
                                Fetch Structure
                            </button>
                        </div>
                    )}
                </div>

                {/* Ligand */}
                <div className="rounded-2xl border border-border bg-background/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Atom size={16} className="text-primary" aria-hidden="true" />
                        <h3 className="font-semibold text-foreground">Ligand Molecule</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button type="button" className={tabClass(ligandInputMethod === 'file')} onClick={() => setLigandInputMethod('file')}>SDF / MOL2</button>
                        <button type="button" className={tabClass(ligandInputMethod === 'smiles')} onClick={() => setLigandInputMethod('smiles')}>SMILES</button>
                    </div>

                    {ligandInputMethod === 'file' && (
                        <label className={`block ${sessionReady && !loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                            <input type="file" accept=".sdf,.mol,.mol2" onChange={handleLigandUpload} className="hidden" id="ligand-upload" disabled={!sessionReady || loading} />
                            <div className={uploadCardClass(uploadProgress.ligand)}>
                                {uploadProgress.ligand ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 size={24} className="text-primary" aria-hidden="true" />
                                        <span className="text-sm font-medium text-foreground">{ligandFile?.name || savedLigandFilename || 'Uploaded'}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload size={24} className="text-muted-foreground" aria-hidden="true" />
                                        <span className="text-sm font-medium text-foreground">
                                            {sessionReady ? 'Click to upload molecule' : 'Waiting for session…'}
                                        </span>
                                        <span className="text-xs text-muted-foreground">SDF, MOL or MOL2 format</span>
                                    </div>
                                )}
                            </div>
                        </label>
                    )}

                    {ligandInputMethod === 'smiles' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5 block">Ligand Name</label>
                                <input type="text" value={ligandName} onChange={(e) => setLigandName(e.target.value)} placeholder="ligand" className={inputClass} disabled={!sessionId || loading} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1.5 block">SMILES String</label>
                                <input
                                    type="text"
                                    value={combinedSmiles}
                                    onChange={(e) => setCombinedSmiles(e.target.value)}
                                    placeholder="e.g., CC(=O)OC1=CC=CC=C1C(=O)O"
                                    className={inputClass}
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-muted-foreground mt-1">Example: aspirin — CC(=O)OC1=CC=CC=C1C(=O)O</p>
                            </div>
                            <button type="button" onClick={handleSmilesSubmit} disabled={!sessionReady || !combinedSmiles.trim() || loading} className={btnPrimary}>
                                Generate Ligand
                            </button>
                            {uploadProgress.ligand && savedLigandFilename && (
                                <p className="text-sm text-primary mt-2">✓ Generated: {savedLigandFilename}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
