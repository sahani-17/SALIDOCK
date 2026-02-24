import React from 'react';
import { Upload, FileText, Atom, Dna, CheckCircle2 } from 'lucide-react';

/**
 * Shared input section with 3 modes: Upload Files, SMILES, AlphaFold.
 * Contains complete UI for protein/ligand upload, SMILES input, and AlphaFold prediction.
 */
export default function InputSection({
    // Input mode
    inputMode, setInputMode,
    // Protein upload
    proteinFile, handleProteinUpload,
    // Ligand upload
    ligandFile, handleLigandUpload,
    // SMILES
    smilesInput, setSmilesInput,
    smilesString, setSmilesString,
    ligandName, setLigandName,
    ligandInputMethod, setLigandInputMethod,
    handleSmilesSubmit,
    // AlphaFold
    alphafoldMode, setAlphafoldMode,
    fastaSequence, setFastaSequence,
    uniprotId, setUniprotId,
    uniprotInfo,
    handleSequencePrediction,
    handleUniProtFetch,
    // Upload progress
    uploadProgress,
    savedLigandFilename,
    // Loading
    sessionId, loading,
}) {
    return (
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
                <Upload className="w-6 h-6 text-gray-700" />
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Upload Input Files</h2>
                    <p className="text-sm text-gray-600">Select your protein and ligand files to begin the docking workflow</p>
                </div>
            </div>

            {/* Input Mode Selection */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Input Mode</label>
                <div className="grid grid-cols-3 gap-3">
                    <button
                        onClick={() => setInputMode('upload')}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${inputMode === 'upload'
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        <Upload className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">Upload Files</span>
                    </button>
                    <button
                        onClick={() => setInputMode('smiles')}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${inputMode === 'smiles'
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        <Atom className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">SMILES Input</span>
                    </button>
                    <button
                        onClick={() => setInputMode('alphafold')}
                        className={`px-4 py-3 rounded-lg border-2 transition-all ${inputMode === 'alphafold'
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        <Dna className="w-5 h-5 mx-auto mb-1" />
                        <span className="text-xs font-medium">AlphaFold</span>
                    </button>
                </div>
            </div>

            {/* Upload Files Mode */}
            {inputMode === 'upload' && (
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Protein Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Protein Structure {uploadProgress.protein && <CheckCircle2 className="inline w-4 h-4 text-green-600 ml-1" />}
                        </label>
                        <div className="relative">
                            <input
                                type="file"
                                accept=".pdb,.ent"
                                onChange={handleProteinUpload}
                                className="hidden"
                                id="protein-upload"
                                disabled={!sessionId || loading}
                            />
                            <label
                                htmlFor="protein-upload"
                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                            >
                                <FileText className="w-8 h-8 text-gray-400 mb-2" />
                                <span className="text-sm text-gray-600">
                                    {proteinFile ? proteinFile.name : 'Click to upload protein file'}
                                </span>
                                <span className="text-xs text-gray-500 mt-1">PDB or ENT format</span>
                            </label>
                        </div>
                    </div>

                    {/* Ligand Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Ligand Molecule {uploadProgress.ligand && <CheckCircle2 className="inline w-4 h-4 text-green-600 ml-1" />}
                        </label>
                        <div className="relative">
                            <input
                                type="file"
                                accept=".sdf,.mol,.mol2,.pdb"
                                onChange={handleLigandUpload}
                                className="hidden"
                                id="ligand-upload"
                                disabled={!sessionId || loading}
                            />
                            <label
                                htmlFor="ligand-upload"
                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                            >
                                <Atom className="w-8 h-8 text-gray-400 mb-2" />
                                <span className="text-sm text-gray-600">
                                    {ligandFile ? ligandFile.name : 'Click to upload ligand file'}
                                </span>
                                <span className="text-xs text-gray-500 mt-1">SDF, MOL, MOL2, or PDB format</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* SMILES Mode */}
            {inputMode === 'smiles' && (
                <div className="grid md:grid-cols-2 gap-6">
                    {/* Protein Upload */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Protein Structure {uploadProgress.protein && <CheckCircle2 className="inline w-4 h-4 text-green-600 ml-1" />}
                        </label>
                        <div className="relative">
                            <input
                                type="file"
                                accept=".pdb,.ent"
                                onChange={handleProteinUpload}
                                className="hidden"
                                id="protein-upload-smiles"
                                disabled={!sessionId || loading}
                            />
                            <label
                                htmlFor="protein-upload-smiles"
                                className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                            >
                                <FileText className="w-8 h-8 text-gray-400 mb-2" />
                                <span className="text-sm text-gray-600">
                                    {proteinFile ? proteinFile.name : 'Click to upload protein file'}
                                </span>
                                <span className="text-xs text-gray-500 mt-1">PDB or ENT format</span>
                            </label>
                        </div>
                    </div>

                    {/* SMILES Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Ligand Name</label>
                        <input
                            type="text"
                            value={ligandName}
                            onChange={(e) => setLigandName(e.target.value)}
                            placeholder="ligand"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-4"
                            disabled={!sessionId || loading}
                        />

                        <label className="block text-sm font-medium text-gray-700 mb-2">SMILES String</label>
                        <input
                            type="text"
                            value={smilesInput}
                            onChange={(e) => setSmilesInput(e.target.value)}
                            placeholder="e.g., CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            disabled={!sessionId || loading}
                        />
                        <p className="text-xs text-gray-500 mt-2">Example: CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)</p>

                        <button
                            onClick={handleSmilesSubmit}
                            disabled={!smilesInput.trim() || loading}
                            className="mt-4 w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                            Generate
                        </button>
                    </div>
                </div>
            )}

            {/* AlphaFold Mode */}
            {inputMode === 'alphafold' && (
                <div className="grid grid-cols-2 gap-6">
                    {/* Left Column: Protein Input */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Protein Structure</h3>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-3">AlphaFold Input Method</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setAlphafoldMode('sequence')}
                                    className={`px-4 py-3 rounded-lg border-2 transition-all ${alphafoldMode === 'sequence'
                                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <span className="text-sm font-medium">FASTA Sequence</span>
                                    <p className="text-xs mt-1 opacity-75">ESMFold prediction</p>
                                </button>
                                <button
                                    onClick={() => setAlphafoldMode('uniprot')}
                                    className={`px-4 py-3 rounded-lg border-2 transition-all ${alphafoldMode === 'uniprot'
                                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <span className="text-sm font-medium">UniProt ID</span>
                                    <p className="text-xs mt-1 opacity-75">AlphaFold database</p>
                                </button>
                            </div>
                        </div>

                        {alphafoldMode === 'sequence' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Protein Sequence (FASTA)
                                </label>
                                <textarea
                                    value={fastaSequence}
                                    onChange={(e) => setFastaSequence(e.target.value)}
                                    placeholder={"Enter amino acid sequence (max 400 residues)\nExample: ACDEFGHIKLMNPQRSTVWY..."}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                    rows="6"
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Valid amino acids: ACDEFGHIKLMNPQRSTVWY • Maximum length: 400 residues
                                </p>
                                <button
                                    onClick={handleSequencePrediction}
                                    disabled={!fastaSequence.trim() || loading}
                                    className="mt-4 w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Predict Structure
                                </button>
                            </div>
                        )}

                        {alphafoldMode === 'uniprot' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    UniProt Accession ID
                                </label>
                                <input
                                    type="text"
                                    value={uniprotId}
                                    onChange={(e) => setUniprotId(e.target.value.trim().toUpperCase())}
                                    placeholder="e.g., P12345, A0A0C5B5G6, Q9Y6K9"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    disabled={!sessionId || loading}
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Format: 6-10 uppercase alphanumeric characters, starting with a letter
                                </p>

                                {uniprotInfo && (
                                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <h4 className="font-semibold text-blue-900 mb-2">Protein Information</h4>
                                        <p className="text-sm text-gray-700">
                                            <span className="font-medium">Name:</span> {uniprotInfo.protein_name || 'N/A'}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            <span className="font-medium">Organism:</span> {uniprotInfo.organism || 'N/A'}
                                        </p>
                                        <p className="text-sm text-gray-700">
                                            <span className="font-medium">Length:</span> {uniprotInfo.sequence_length || 0} residues
                                        </p>
                                    </div>
                                )}

                                <button
                                    onClick={handleUniProtFetch}
                                    disabled={!uniprotId.trim() || loading}
                                    className="mt-4 w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Fetch Structure
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Ligand Input */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Ligand Structure</h3>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-3">Ligand Input Method</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setLigandInputMethod('file')}
                                    className={`px-4 py-3 rounded-lg border-2 transition-all ${ligandInputMethod === 'file'
                                        ? 'border-green-500 bg-green-50 text-green-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <span className="text-sm font-medium">Upload File</span>
                                    <p className="text-xs mt-1 opacity-75">SDF/MOL/MOL2/PDB</p>
                                </button>
                                <button
                                    onClick={() => setLigandInputMethod('smiles')}
                                    className={`px-4 py-3 rounded-lg border-2 transition-all ${ligandInputMethod === 'smiles'
                                        ? 'border-green-500 bg-green-50 text-green-900'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <span className="text-sm font-medium">SMILES String</span>
                                    <p className="text-xs mt-1 opacity-75">Generate from text</p>
                                </button>
                            </div>
                        </div>

                        {ligandInputMethod === 'file' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Upload Ligand File {uploadProgress.ligand && <CheckCircle2 className="inline w-4 h-4 text-green-600 ml-1" />}
                                </label>
                                <input
                                    type="file"
                                    accept=".sdf,.mol,.mol2,.pdb"
                                    onChange={handleLigandUpload}
                                    disabled={!sessionId || loading}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                                />
                                {uploadProgress.ligand && savedLigandFilename && (
                                    <p className="text-sm text-green-600 mt-2">
                                        ✓ Uploaded: {savedLigandFilename}
                                    </p>
                                )}
                            </div>
                        )}

                        {ligandInputMethod === 'smiles' && (
                            <div>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Ligand Name
                                    </label>
                                    <input
                                        type="text"
                                        value={ligandName}
                                        onChange={(e) => setLigandName(e.target.value)}
                                        placeholder="ligand"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        disabled={!sessionId || loading}
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        SMILES String
                                    </label>
                                    <input
                                        type="text"
                                        value={smilesString}
                                        onChange={(e) => setSmilesString(e.target.value)}
                                        placeholder="e.g., CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)"
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                        disabled={!sessionId || loading}
                                    />
                                    <p className="text-xs text-gray-500 mt-2">Example: CC(=O)OC1=CC=CC=C1C(=O)O (aspirin)</p>
                                </div>
                                <button
                                    onClick={handleSmilesSubmit}
                                    disabled={!smilesString.trim() || loading}
                                    className="w-full px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    Generate Ligand
                                </button>
                                {uploadProgress.ligand && savedLigandFilename && (
                                    <p className="text-sm text-green-600 mt-2">
                                        ✓ Generated: {savedLigandFilename}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
