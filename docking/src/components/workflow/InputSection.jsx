import React from 'react';
import { Upload, FileText, Atom, Dna, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * Shared input section with 3 modes: Upload Files, SMILES, AlphaFold (light theme).
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
        `flex-1 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-all ${active
            ? 'bg-blue-100 border-blue-300 text-blue-700'
            : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-blue-200'
        }`;

    const inputClass = "w-full h-10 px-3 rounded-lg bg-white border border-slate-300 text-slate-900 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all";
    const textareaClass = "w-full rounded-lg bg-white border border-slate-300 text-slate-900 text-sm p-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none font-mono";
    const btnPrimary = "px-5 py-2 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50";

    const proteinInputMethod =
        inputMode === 'upload'
            ? 'file'
            : alphafoldMode === 'uniprot'
                ? 'uniprot'
                : 'fasta';

    const combinedSmiles = smilesString || smilesInput;
    const setCombinedSmiles = (value) => {
        setSmilesString(value);
        setSmilesInput(value);
    };

    const uploadCardClass = (done) =>
        `border-2 border-dashed rounded-xl p-8 text-center transition-all ${done
            ? 'border-emerald-300 bg-emerald-50'
            : 'border-slate-300 hover:border-blue-300 bg-slate-50/40'
        }`;

    return (
        <section className="rounded-2xl bg-white border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
                <Upload size={18} className="text-blue-600" />
                <h2 className="font-bold text-slate-900">Upload Input Files</h2>
            </div>
            <p className="text-xs text-slate-600 mb-5">Select your protein and ligand files to begin the docking workflow</p>

            {!sessionReady && (
                <div className="mb-5 p-3 rounded-xl border border-blue-200 bg-blue-50 flex items-start gap-2">
                    <Loader2 size={14} className="text-blue-600 mt-0.5 animate-spin" />
                    <p className="text-xs text-slate-600">
                        Preparing your docking session. Please wait a moment — uploads will be enabled automatically once the session is created.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Protein compartment */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Dna size={16} className="text-blue-600" />
                        <h3 className="font-bold text-slate-900">Protein Receptor</h3>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <button
                            type="button"
                            className={tabClass(proteinInputMethod === 'file')}
                            onClick={() => setInputMode('upload')}
                        >
                            PDB File
                        </button>
                        <button
                            type="button"
                            className={tabClass(proteinInputMethod === 'fasta')}
                            onClick={() => {
                                setInputMode('alphafold');
                                setAlphafoldMode('sequence');
                            }}
                        >
                            FASTA
                        </button>
                        <button
                            type="button"
                            className={tabClass(proteinInputMethod === 'uniprot')}
                            onClick={() => {
                                setInputMode('alphafold');
                                setAlphafoldMode('uniprot');
                            }}
                        >
                            UniProt
                        </button>
                    </div>

                    {proteinInputMethod === 'file' && (
                        <label className={`block ${sessionReady && !loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                            <input type="file" accept=".pdb,.ent" onChange={handleProteinUpload} className="hidden" id="protein-upload" disabled={!sessionReady || loading} />
                            <div className={uploadCardClass(uploadProgress.protein)}>
                                {uploadProgress.protein ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 size={24} className="text-emerald-600" />
                                        <span className="text-sm font-medium text-slate-900">{proteinFile?.name || savedProteinFilename || 'Uploaded'}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload size={24} className="text-slate-500" />
                                        <span className="text-sm font-medium text-slate-900">
                                            {sessionReady ? 'Click to upload structure' : 'Waiting for session creation...'}
                                        </span>
                                        <span className="text-xs text-slate-600">PDB or ENT format</span>
                                    </div>
                                )}
                            </div>
                        </label>
                    )}

                    {proteinInputMethod === 'fasta' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 block">Protein Sequence (FASTA)</label>
                                <textarea
                                    value={fastaSequence}
                                    onChange={(e) => setFastaSequence(e.target.value)}
                                    placeholder={"Enter amino acid sequence (max 400 residues)\nExample: ACDEFGHIKLMNPQRSTVWY..."}
                                    className={textareaClass}
                                    rows="6"
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-slate-500 mt-1">Valid amino acids: ACDEFGHIKLMNPQRSTVWY • Maximum: 400 residues</p>
                            </div>
                            <button type="button" onClick={handleSequencePrediction} disabled={!sessionReady || !fastaSequence.trim() || loading} className={btnPrimary}>
                                <Dna size={14} className="inline mr-1.5" />Predict Structure
                            </button>
                        </div>
                    )}

                    {proteinInputMethod === 'uniprot' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 block">UniProt Accession ID</label>
                                <input
                                    type="text"
                                    value={uniprotId}
                                    onChange={(e) => setUniprotId(e.target.value.trim().toUpperCase())}
                                    placeholder="e.g., P12345"
                                    className={inputClass}
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-slate-500 mt-1">Format: 6-10 uppercase alphanumeric characters</p>
                            </div>

                            {uniprotInfo && (
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                                    <h4 className="font-semibold text-blue-700 mb-2 text-sm">Protein Information</h4>
                                    <p className="text-sm text-slate-900"><span className="text-slate-600">Name:</span> {uniprotInfo.protein_name || 'N/A'}</p>
                                    <p className="text-sm text-slate-900"><span className="text-slate-600">Organism:</span> {uniprotInfo.organism || 'N/A'}</p>
                                    <p className="text-sm text-slate-900"><span className="text-slate-600">Length:</span> {uniprotInfo.sequence_length || 0} residues</p>
                                </div>
                            )}

                            <button type="button" onClick={handleUniProtFetch} disabled={!sessionReady || !uniprotId.trim() || loading} className={btnPrimary}>
                                Fetch Structure
                            </button>
                        </div>
                    )}
                </div>

                {/* Ligand compartment */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Atom size={16} className="text-blue-600" />
                        <h3 className="font-bold text-slate-900">Ligand Molecule</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                            type="button"
                            className={tabClass(ligandInputMethod === 'file')}
                            onClick={() => setLigandInputMethod('file')}
                        >
                            SDF / MOL2
                        </button>
                        <button
                            type="button"
                            className={tabClass(ligandInputMethod === 'smiles')}
                            onClick={() => setLigandInputMethod('smiles')}
                        >
                            SMILES
                        </button>
                    </div>

                    {ligandInputMethod === 'file' && (
                        <label className={`block ${sessionReady && !loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                            <input type="file" accept=".sdf,.mol,.mol2" onChange={handleLigandUpload} className="hidden" id="ligand-upload" disabled={!sessionReady || loading} />
                            <div className={uploadCardClass(uploadProgress.ligand)}>
                                {uploadProgress.ligand ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <CheckCircle2 size={24} className="text-emerald-600" />
                                        <span className="text-sm font-medium text-slate-900">{ligandFile?.name || savedLigandFilename || 'Uploaded'}</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Upload size={24} className="text-slate-500" />
                                        <span className="text-sm font-medium text-slate-900">
                                            {sessionReady ? 'Click to upload molecule' : 'Waiting for session creation...'}
                                        </span>
                                        <span className="text-xs text-slate-600">SDF, MOL or MOL2 format</span>
                                    </div>
                                )}
                            </div>
                        </label>
                    )}

                    {ligandInputMethod === 'smiles' && (
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 block">Ligand Name</label>
                                <input type="text" value={ligandName} onChange={(e) => setLigandName(e.target.value)} placeholder="ligand" className={inputClass} disabled={!sessionId || loading} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5 block">SMILES String</label>
                                <input
                                    type="text"
                                    value={combinedSmiles}
                                    onChange={(e) => setCombinedSmiles(e.target.value)}
                                    placeholder="e.g., CC(=O)OC1=CC=CC=C1C(=O)O"
                                    className={inputClass}
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-slate-500 mt-1">Example: CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)</p>
                            </div>
                            <button type="button" onClick={handleSmilesSubmit} disabled={!sessionReady || !combinedSmiles.trim() || loading} className={btnPrimary}>
                                Generate Ligand
                            </button>
                            {uploadProgress.ligand && savedLigandFilename && (
                                <p className="text-sm text-emerald-600 mt-2">✓ Generated: {savedLigandFilename}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
