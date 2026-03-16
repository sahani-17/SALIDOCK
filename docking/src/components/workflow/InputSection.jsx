import React from 'react';
import { Upload, FileText, Atom, Dna, CheckCircle2 } from 'lucide-react';

/**
 * Shared input section with 3 modes: Upload Files, SMILES, AlphaFold (dark theme).
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
    savedLigandFilename,
    sessionId, loading,
}) {
    const tabClass = (active) =>
        `px-4 py-2 text-sm font-semibold rounded-lg transition-all ${active
            ? 'bg-primary/20 border border-primary/40 text-primary'
            : 'bg-transparent border border-primary/10 text-muted-foreground hover:text-foreground hover:border-primary/20'
        }`;

    const inputClass = "w-full h-10 px-3 rounded-lg bg-background border border-primary/15 text-foreground text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all";
    const textareaClass = "w-full rounded-lg bg-background border border-primary/15 text-foreground text-sm p-3 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all resize-none font-mono";
    const btnPrimary = "px-5 py-2 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50";

    return (
        <section className="rounded-2xl bg-card border border-primary/10 p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
                <Upload size={18} className="text-primary" />
                <h2 className="font-bold text-foreground">Upload Input Files</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-5">Select your protein and ligand files to begin the docking workflow</p>

            {/* Mode tabs */}
            <div className="flex gap-2 mb-6">
                {['upload', 'smiles', 'alphafold'].map((m) => (
                    <button key={m} className={tabClass(inputMode === m)} onClick={() => setInputMode(m)}>
                        {m === 'upload' ? 'Upload Files' : m === 'smiles' ? 'SMILES Input' : 'AlphaFold'}
                    </button>
                ))}
            </div>

            {/* Upload Files Mode */}
            {inputMode === 'upload' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        { label: 'Protein Structure', hint: 'PDB or ENT format', accept: '.pdb,.ent', file: proteinFile, handler: handleProteinUpload, id: 'protein-upload', progress: uploadProgress.protein },
                        { label: 'Ligand Molecule', hint: 'SDF, MOL, MOL2 or PDB format', accept: '.sdf,.mol,.mol2,.pdb', file: ligandFile, handler: handleLigandUpload, id: 'ligand-upload', progress: uploadProgress.ligand },
                    ].map((z) => (
                        <label key={z.label} className="block cursor-pointer">
                            <input type="file" accept={z.accept} onChange={z.handler} className="hidden" id={z.id} disabled={!sessionId || loading} />
                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${z.progress ? 'border-success/40 bg-success/5' : 'border-primary/20 hover:border-primary/40'}`}>
                                {z.progress ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 size={24} className="text-success" />
                                        <span className="text-sm font-medium text-foreground">{z.file?.name || 'Uploaded'}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload size={24} className="text-muted-foreground" />
                                        <span className="text-sm font-medium text-foreground">Click to upload {z.label.toLowerCase()}</span>
                                        <span className="text-xs text-muted-foreground">{z.hint}</span>
                                    </div>
                                )}
                            </div>
                        </label>
                    ))}
                </div>
            )}

            {/* SMILES Mode */}
            {inputMode === 'smiles' && (
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Protein Upload */}
                    <label className="block cursor-pointer">
                        <input type="file" accept=".pdb,.ent" onChange={handleProteinUpload} className="hidden" id="protein-upload-smiles" disabled={!sessionId || loading} />
                        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${uploadProgress.protein ? 'border-success/40 bg-success/5' : 'border-primary/20 hover:border-primary/40'}`}>
                            {uploadProgress.protein ? (
                                <div className="flex flex-col items-center gap-2">
                                    <CheckCircle2 size={24} className="text-success" />
                                    <span className="text-sm font-medium text-foreground">{proteinFile?.name || 'Uploaded'}</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <FileText size={24} className="text-muted-foreground" />
                                    <span className="text-sm font-medium text-foreground">Click to upload protein file</span>
                                    <span className="text-xs text-muted-foreground">PDB or ENT format</span>
                                </div>
                            )}
                        </div>
                    </label>

                    {/* SMILES Input */}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">Ligand Name</label>
                            <input type="text" value={ligandName} onChange={(e) => setLigandName(e.target.value)} placeholder="ligand" className={inputClass} disabled={!sessionId || loading} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">SMILES String</label>
                            <input type="text" value={smilesInput} onChange={(e) => setSmilesInput(e.target.value)} placeholder="e.g., CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)" className={inputClass} disabled={!sessionId || loading} />
                            <p className="text-xs text-muted-foreground mt-1">Example: CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)</p>
                        </div>
                        <button onClick={handleSmilesSubmit} disabled={!smilesInput.trim() || loading} className={btnPrimary}>
                            Generate 3D Structure
                        </button>
                    </div>
                </div>
            )}

            {/* AlphaFold Mode */}
            {inputMode === 'alphafold' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left: Protein Input */}
                    <div>
                        <h3 className="text-base font-bold text-foreground mb-4">Protein Structure</h3>
                        <div className="flex gap-2 mb-4">
                            {['sequence', 'uniprot'].map((m) => (
                                <button key={m} className={tabClass(alphafoldMode === m)} onClick={() => setAlphafoldMode(m)}>
                                    {m === 'sequence' ? 'FASTA Sequence' : 'UniProt ID'}
                                </button>
                            ))}
                        </div>

                        {alphafoldMode === 'sequence' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">Protein Sequence (FASTA)</label>
                                    <textarea
                                        value={fastaSequence}
                                        onChange={(e) => setFastaSequence(e.target.value)}
                                        placeholder={"Enter amino acid sequence (max 400 residues)\nExample: ACDEFGHIKLMNPQRSTVWY..."}
                                        className={textareaClass}
                                        rows="6"
                                        disabled={!sessionId || loading}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Valid amino acids: ACDEFGHIKLMNPQRSTVWY • Maximum: 400 residues</p>
                                </div>
                                <button onClick={handleSequencePrediction} disabled={!fastaSequence.trim() || loading} className={btnPrimary}>
                                    <Dna size={14} className="inline mr-1.5" />Predict Structure
                                </button>
                            </div>
                        )}

                        {alphafoldMode === 'uniprot' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">UniProt Accession ID</label>
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
                                    <div className="p-4 bg-primary/5 border border-primary/15 rounded-xl">
                                        <h4 className="font-semibold text-primary mb-2 text-sm">Protein Information</h4>
                                        <p className="text-sm text-foreground"><span className="text-muted-foreground">Name:</span> {uniprotInfo.protein_name || 'N/A'}</p>
                                        <p className="text-sm text-foreground"><span className="text-muted-foreground">Organism:</span> {uniprotInfo.organism || 'N/A'}</p>
                                        <p className="text-sm text-foreground"><span className="text-muted-foreground">Length:</span> {uniprotInfo.sequence_length || 0} residues</p>
                                    </div>
                                )}

                                <button onClick={handleUniProtFetch} disabled={!uniprotId.trim() || loading} className={btnPrimary}>
                                    Fetch Structure
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right: Ligand Input */}
                    <div>
                        <h3 className="text-base font-bold text-foreground mb-4">Ligand Structure</h3>
                        <div className="flex gap-2 mb-4">
                            <button className={tabClass(ligandInputMethod === 'file')} onClick={() => setLigandInputMethod('file')}>Upload File</button>
                            <button className={tabClass(ligandInputMethod === 'smiles')} onClick={() => setLigandInputMethod('smiles')}>SMILES String</button>
                        </div>

                        {ligandInputMethod === 'file' && (
                            <label className="block cursor-pointer">
                                <input type="file" accept=".sdf,.mol,.mol2,.pdb" onChange={handleLigandUpload} className="hidden" disabled={!sessionId || loading} />
                                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${uploadProgress.ligand ? 'border-success/40 bg-success/5' : 'border-primary/20 hover:border-primary/40'}`}>
                                    {uploadProgress.ligand ? (
                                        <div className="flex flex-col items-center gap-2">
                                            <CheckCircle2 size={24} className="text-success" />
                                            <span className="text-sm font-medium text-foreground">{savedLigandFilename || 'Uploaded'}</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2">
                                            <Atom size={24} className="text-muted-foreground" />
                                            <span className="text-sm font-medium text-foreground">Click to upload ligand file</span>
                                            <span className="text-xs text-muted-foreground">SDF, MOL, MOL2 or PDB</span>
                                        </div>
                                    )}
                                </div>
                            </label>
                        )}

                        {ligandInputMethod === 'smiles' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">Ligand Name</label>
                                    <input type="text" value={ligandName} onChange={(e) => setLigandName(e.target.value)} placeholder="ligand" className={inputClass} disabled={!sessionId || loading} />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">SMILES String</label>
                                    <input type="text" value={smilesString} onChange={(e) => setSmilesString(e.target.value)} placeholder="e.g., CC(=O)OC1=CC=CC=C1C(=O)O" className={inputClass} disabled={!sessionId || loading} />
                                    <p className="text-xs text-muted-foreground mt-1">Example: CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)</p>
                                </div>
                                <button onClick={handleSmilesSubmit} disabled={!smilesString.trim() || loading} className={btnPrimary}>
                                    Generate Ligand
                                </button>
                                {uploadProgress.ligand && savedLigandFilename && (
                                    <p className="text-sm text-success mt-2">✓ Generated: {savedLigandFilename}</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
