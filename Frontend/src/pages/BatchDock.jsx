import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, Play, Loader2, Wand2, Target, ArrowRight, Upload, Atom, Dna, CheckCircle2, Trash2, FileText, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import GridBoxViewer from '../components/GridBoxViewer';
import { useBatchDockingWorkflow } from '../hooks/useBatchDockingWorkflow';
import WorkflowHeader from '../components/workflow/WorkflowHeader';
import StatusBanners from '../components/workflow/StatusBanners';
import Stepper from '../components/workflow/Stepper';
import Footer from '../components/Footer';

const STEPS = [
    { key: 'input', label: 'Input' },
    { key: 'prepare', label: 'Prepare' },
    { key: 'configure', label: 'Configure' },
];

function BatchDock() {
    const navigate = useNavigate();
    const workflow = useBatchDockingWorkflow();

    const [dockingMode, setDockingMode] = useState('cavity'); // cavity or manual
    const [selectedCavityId, setSelectedCavityId] = useState(1);
    const [cavities, setCavities] = useState([]);
    const [detectingCavities, setDetectingCavities] = useState(false);

    const [gridCenter, setGridCenter] = useState({ x: 0, y: 0, z: 0 });
    const [gridSize, setGridSize] = useState({ x: 20, y: 20, z: 20 });
    const [autoDetectDone, setAutoDetectDone] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);

    // Batch docking status polling
    const [dockingStatus, setDockingStatus] = useState(null);
    const [dockingRunning, setDockingRunning] = useState(false);

    const inputDone = workflow.uploadProgress.protein && workflow.uploadProgress.ligands;
    const prepareDone = workflow.proteinPrepared && workflow.ligandPrepStatus && 
                        (workflow.ligandPrepStatus.status === 'completed' || workflow.ligandPrepStatus.status === 'completed_with_errors');

    const configureDone = dockingMode === 'cavity' ? cavities.length > 0 : autoDetectDone;

    const completed = useMemo(() => ({
        input: inputDone,
        prepare: prepareDone,
        configure: configureDone,
    }), [inputDone, prepareDone, configureDone]);

    // Auto-advance stepper as gates open
    useEffect(() => {
        if (inputDone && stepIndex < 1) setStepIndex(1);
    }, [inputDone]);

    useEffect(() => {
        if (prepareDone && stepIndex < 2) {
            setStepIndex(2);
            // Auto detect cavities immediately when entering configure step
            handleDetectCavities();
        }
    }, [prepareDone]);

    const handleDetectCavities = async () => {
        setDetectingCavities(true);
        try {
            const response = await api.detectCavities(workflow.sessionId);
            const cavs = response.cavities || [];
            setCavities(cavs);
            if (cavs.length > 0) {
                setSelectedCavityId(cavs[0].cavity_id);
            }
        } catch (err) {
            console.error('Failed to detect cavities:', err);
            toast.error('Failed to detect binding sites on protein surface');
        } finally {
            setDetectingCavities(false);
        }
    };

    const handleAutoDetectCenter = async () => {
        workflow.setLoading(true);
        workflow.setLoadingMessage('Calculating protein center...');
        try {
            const response = await api.getProteinCenter(workflow.sessionId);
            setGridCenter({ x: response.centerX, y: response.centerY, z: response.centerZ });
            setAutoDetectDone(true);
            toast.success('Protein center detected');
        } catch (err) {
            workflow.setError('Failed to auto-detect protein center: ' + (err.message || err));
        } finally {
            workflow.setLoading(false);
            workflow.setLoadingMessage('');
        }
    };

    const handleRunBatchDocking = async () => {
        setDockingRunning(true);
        try {
            const dockingData = { dockingMode };
            if (dockingMode === 'cavity') {
                dockingData.cavityId = selectedCavityId;
            } else {
                await api.calculateGrid(workflow.sessionId, {
                    mode: 'manual',
                    center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z,
                    size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z,
                });
                dockingData.center_x = gridCenter.x;
                dockingData.center_y = gridCenter.y;
                dockingData.center_z = gridCenter.z;
                dockingData.size_x = gridSize.x;
                dockingData.size_y = gridSize.y;
                dockingData.size_z = gridSize.z;
            }

            await api.runBatchDocking(workflow.sessionId, dockingData);
            toast.success('Batch docking simulation started');
            pollDockingStatus();
        } catch (err) {
            toast.error(err.message || 'Failed to start batch docking');
            setDockingRunning(false);
        }
    };

    const pollDockingStatus = () => {
        const interval = setInterval(async () => {
            try {
                const status = await api.getBatchDockStatus(workflow.sessionId);
                setDockingStatus(status);
                
                if (status.status === 'completed' || status.status === 'completed_with_errors') {
                    clearInterval(interval);
                    setDockingRunning(false);
                    toast.success('Batch docking completed!');
                    navigate(`/batch-results?session=${workflow.sessionId}`);
                }
            } catch (err) {
                console.error('Error polling batch dock status:', err);
            }
        }, 2000);
    };

    // Calculate grid center from selected cavity for GridBoxViewer preview
    const activeCavityInfo = useMemo(() => {
        if (dockingMode === 'cavity' && cavities.length > 0) {
            const cav = cavities.find(c => c.cavity_id === selectedCavityId);
            if (cav) {
                return {
                    center: { x: cav.center[0], y: cav.center[1], z: cav.center[2] },
                    size: cav.size ? { x: cav.size[0], y: cav.size[1], z: cav.size[2] } : { x: 20, y: 20, z: 20 }
                };
            }
        }
        return null;
    }, [dockingMode, cavities, selectedCavityId]);

    const activeCenter = activeCavityInfo ? activeCavityInfo.center : gridCenter;
    const activeSize = activeCavityInfo ? activeCavityInfo.size : gridSize;

    const tabClass = (active) =>
        `flex-1 px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border transition-all ${
            active
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
        }`;

    const inputClass = "w-full h-10 px-3 rounded-lg bg-card border border-border text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all";
    const textareaClass = "w-full rounded-lg bg-card border border-border text-foreground text-sm p-3 focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all resize-none font-mono-code";
    const btnPrimary = "px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5";
    const uploadCardClass = (done) =>
        `border-2 border-dashed rounded-xl p-8 text-center transition-all ${
            done
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-primary/40 bg-background'
        }`;

    return (
        <div className="min-h-screen bg-background flex flex-col pt-16">
            <WorkflowHeader
                eyebrow="Workflow"
                title="Batch Molecular Docking"
                subtitle="Dock multiple chemical ligands against a single target protein receptor pocket."
            />

            <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-16">
                <Stepper steps={STEPS} currentIndex={stepIndex} completed={completed} onStepClick={setStepIndex} />

                <StatusBanners
                    error={workflow.error}
                    setError={workflow.setError}
                    loading={workflow.loading && !dockingRunning}
                    loadingMessage={workflow.loadingMessage}
                />

                {/* Step 1: Input */}
                {stepIndex === 0 && (
                    <div className="animate-fade-in-up">
                        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Upload size={18} className="text-primary" aria-hidden="true" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Upload Target Receptor & Ligands</h2>
                                    <p className="text-sm text-muted-foreground">Select one protein receptor and upload multiple ligands (via multi-mol SDF, ZIP, or SMILES list).</p>
                                </div>
                            </div>

                            {!workflow.sessionId && (
                                <div className="mb-5 p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-2">
                                    <Loader2 size={14} className="text-primary mt-0.5 animate-spin" aria-hidden="true" />
                                    <p className="text-xs text-muted-foreground">Preparing docking session...</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Protein */}
                                <div className="rounded-2xl border border-border bg-background/60 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Dna size={16} className="text-primary" aria-hidden="true" />
                                        <h3 className="font-semibold text-foreground">1. Target Protein Receptor</h3>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <button type="button" className={tabClass(workflow.proteinInputMethod === 'file')} onClick={() => workflow.setProteinInputMethod('file')}>PDB File</button>
                                        <button type="button" className={tabClass(workflow.proteinInputMethod === 'fasta')} onClick={() => { workflow.setProteinInputMethod('fasta'); workflow.setAlphafoldMode('sequence'); }}>FASTA</button>
                                        <button type="button" className={tabClass(workflow.proteinInputMethod === 'uniprot')} onClick={() => { workflow.setProteinInputMethod('uniprot'); workflow.setAlphafoldMode('uniprot'); }}>UniProt</button>
                                    </div>

                                    {workflow.proteinInputMethod === 'file' && (
                                        <label className={`block ${workflow.sessionId && !workflow.loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                            <input type="file" accept=".pdb,.ent" onChange={workflow.handleProteinUpload} className="hidden" id="protein-upload" disabled={!workflow.sessionId || workflow.loading} />
                                            <div className={uploadCardClass(workflow.uploadProgress.protein)}>
                                                {workflow.uploadProgress.protein ? (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <CheckCircle2 size={24} className="text-primary" aria-hidden="true" />
                                                        <span className="text-sm font-medium text-foreground">{workflow.proteinFile?.name || workflow.savedProteinFilename || 'Uploaded'}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2">
                                                        <Upload size={24} className="text-muted-foreground" aria-hidden="true" />
                                                        <span className="text-sm font-medium text-foreground">Click to upload receptor structure</span>
                                                        <span className="text-xs text-muted-foreground">PDB or ENT format</span>
                                                    </div>
                                                )}
                                            </div>
                                        </label>
                                    )}

                                    {workflow.proteinInputMethod === 'fasta' && (
                                        <div className="space-y-3">
                                            <textarea
                                                value={workflow.fastaSequence}
                                                onChange={(e) => workflow.setFastaSequence(e.target.value)}
                                                placeholder={"Enter amino acid sequence (max 400 residues)\nExample: ACDEFGHIKLMNPQRSTVWY..."}
                                                className={textareaClass}
                                                rows="6"
                                                disabled={!workflow.sessionId || workflow.loading}
                                            />
                                            <button type="button" onClick={workflow.handleSequencePrediction} disabled={!workflow.sessionId || !workflow.fastaSequence.trim() || workflow.loading} className={btnPrimary}>
                                                Predict Structure
                                            </button>
                                        </div>
                                    )}

                                    {workflow.proteinInputMethod === 'uniprot' && (
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                value={workflow.uniprotId}
                                                onChange={(e) => workflow.setUniprotId(e.target.value.trim().toUpperCase())}
                                                placeholder="e.g., P12345"
                                                className={inputClass}
                                                disabled={!workflow.sessionId || workflow.loading}
                                            />
                                            {workflow.uniprotInfo && (
                                                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs space-y-1">
                                                    <p><span className="font-semibold text-muted-foreground">Name:</span> {workflow.uniprotInfo.protein_name}</p>
                                                    <p><span className="font-semibold text-muted-foreground">Length:</span> {workflow.uniprotInfo.sequence_length} residues</p>
                                                </div>
                                            )}
                                            <button type="button" onClick={workflow.handleUniProtFetch} disabled={!workflow.sessionId || !workflow.uniprotId.trim() || workflow.loading} className={btnPrimary}>
                                                Fetch Structure
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Ligands */}
                                <div className="rounded-2xl border border-border bg-background/60 p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Atom size={16} className="text-primary" aria-hidden="true" />
                                        <h3 className="font-semibold text-foreground">2. Batch Ligands Library</h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 mb-4">
                                        <button type="button" className={tabClass(workflow.ligandInputMethod === 'file')} onClick={() => workflow.setLigandInputMethod('file')}>Files (SDF / ZIP)</button>
                                        <button type="button" className={tabClass(workflow.ligandInputMethod === 'smiles')} onClick={() => workflow.setLigandInputMethod('smiles')}>SMILES List</button>
                                    </div>

                                    {workflow.ligandInputMethod === 'file' && (
                                        <div>
                                            <label className={`block ${workflow.sessionId && !workflow.loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                                <input type="file" multiple accept=".sdf,.mol2,.zip" onChange={workflow.handleBatchLigandsUpload} className="hidden" id="ligand-batch-upload" disabled={!workflow.sessionId || workflow.loading} />
                                                <div className={uploadCardClass(workflow.uploadProgress.ligands)}>
                                                    {workflow.uploadProgress.ligands ? (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <CheckCircle2 size={24} className="text-primary" aria-hidden="true" />
                                                            <span className="text-sm font-medium text-foreground">
                                                                Uploaded {workflow.batchLigands.length} ligand(s)
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-2">
                                                            <Upload size={24} className="text-muted-foreground" aria-hidden="true" />
                                                            <span className="text-sm font-medium text-foreground">Upload ligand files</span>
                                                            <span className="text-xs text-muted-foreground">Select multiple SDF/MOL2 files, a multi-mol SDF, or a ZIP folder</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </label>
                                            {workflow.batchLigands.length > 0 && (
                                                <div className="mt-3 max-h-32 overflow-y-auto border border-border bg-card rounded-xl p-2.5 text-xs space-y-1">
                                                    {workflow.batchLigands.slice(0, 10).map((l, i) => (
                                                        <div key={i} className="flex justify-between text-muted-foreground font-mono-code truncate">
                                                            <span>{i+1}. {l.name}</span>
                                                            <span>{l.properties?.mw ? `${l.properties.mw.toFixed(1)} Da` : ''}</span>
                                                        </div>
                                                    ))}
                                                    {workflow.batchLigands.length > 10 && (
                                                        <p className="text-[10px] text-muted-foreground italic text-center pt-1 border-t border-border">...and {workflow.batchLigands.length - 10} more molecules</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {workflow.ligandInputMethod === 'smiles' && (
                                        <div className="space-y-3">
                                            <textarea
                                                value={workflow.smilesInput}
                                                onChange={(e) => workflow.setSmilesInput(e.target.value)}
                                                placeholder={"Enter one SMILES string per line, optionally with a name:\nCC(=O)OC1=CC=CC=C1C(=O)O Aspirin\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C Caffeine"}
                                                className={textareaClass}
                                                rows="6"
                                                disabled={!workflow.sessionId || workflow.loading}
                                            />
                                            <button type="button" onClick={workflow.handleBatchSmilesSubmit} disabled={!workflow.sessionId || !workflow.smilesInput.trim() || workflow.loading} className={btnPrimary}>
                                                Generate & Validate Ligands
                                            </button>
                                            {workflow.batchLigands.length > 0 && (
                                                <p className="text-xs text-primary font-semibold">✓ Generated and saved {workflow.batchLigands.length} ligands from SMILES list</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setStepIndex(1)}
                                disabled={!inputDone}
                                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                Continue <ArrowRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: Prepare */}
                {stepIndex === 1 && (
                    <div className="animate-fade-in-up">
                        {/* Receptor Prep */}
                        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Dna size={18} className="text-primary" aria-hidden="true" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Target Receptor Preparation</h2>
                                    <p className="text-sm text-muted-foreground">Select chains and cofactors to preserve, then generate the prepared receptor PDBQT.</p>
                                </div>
                            </div>

                            {workflow.showProteinPrep && (
                                <div className="space-y-5 mt-4">
                                    {/* Chain selector */}
                                    {workflow.chains && workflow.chains.length > 0 && (
                                        <div className="p-4 rounded-xl border border-border bg-background">
                                            <div className="flex items-center justify-between mb-3">
                                                <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                                    Chains to Preserve
                                                </label>
                                                <span className="text-[11px] text-muted-foreground">
                                                    {workflow.selectedChains.length === 0
                                                        ? 'All chains kept'
                                                        : `${workflow.selectedChains.length} / ${workflow.chains.length} selected`}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                                {workflow.chains.map((chain) => {
                                                    const id = chain.id ?? chain;
                                                    const atoms = chain.atoms;
                                                    const active = workflow.selectedChains.includes(id);
                                                    return (
                                                        <button
                                                            key={id}
                                                            type="button"
                                                            disabled={workflow.proteinPrepared}
                                                            onClick={() => workflow.setSelectedChains(
                                                                active
                                                                    ? workflow.selectedChains.filter(c => c !== id)
                                                                    : [...workflow.selectedChains, id]
                                                            )}
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
                                                Leave all unselected to preserve all chains.
                                            </p>
                                        </div>
                                    )}

                                    {/* Heteroatom selector */}
                                    <div className="p-4 rounded-xl border border-border bg-background">
                                        <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2 block">Cofactors / Heteroatoms to Keep</label>
                                        {workflow.heteroatoms.length > 0 ? (
                                            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1">
                                                {workflow.heteroatoms.map((h) => {
                                                    const active = workflow.selectedHeteroatoms.includes(h);
                                                    return (
                                                        <button
                                                            key={h} type="button"
                                                            disabled={workflow.proteinPrepared}
                                                            onClick={() => workflow.setSelectedHeteroatoms(active ? workflow.selectedHeteroatoms.filter(x => x !== h) : [...workflow.selectedHeteroatoms, h])}
                                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:cursor-not-allowed ${active ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border hover:border-primary/45'}`}
                                                        >
                                                            {h}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground italic">No heteroatoms detected in receptor.</p>
                                        )}
                                    </div>

                                    <button
                                        onClick={workflow.handleProteinPreparation}
                                        disabled={workflow.loading || workflow.proteinPrepared}
                                        className={btnPrimary}
                                    >
                                        {workflow.proteinPrepared ? '✓ Receptor Prepared' : 'Prepare Protein Structure'}
                                    </button>
                                </div>
                            )}
                        </section>

                        {/* Ligands Prep */}
                        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Atom size={18} className="text-primary" aria-hidden="true" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Optimize Ligands Library</h2>
                                    <p className="text-sm text-muted-foreground">Perform 3D geometry optimization (MMFF94 force field) and add charges to all batch ligands.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center bg-background border border-border p-3.5 rounded-xl text-sm">
                                    <span className="text-muted-foreground">Molecules loaded in library: <span className="font-semibold text-foreground font-mono-code">{workflow.batchLigands.length}</span></span>
                                    <button
                                        onClick={workflow.handlePrepareBatchLigands}
                                        disabled={workflow.loading || prepareDone}
                                        className={btnPrimary}
                                    >
                                        {prepareDone ? '✓ Optimization Complete' : 'Run Batch Optimization'}
                                    </button>
                                </div>

                                {workflow.ligandPrepStatus && (
                                    <div className="space-y-2 border border-border bg-background p-4 rounded-xl">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-semibold uppercase tracking-wider text-muted-foreground">Optimization Progress</span>
                                            <span className="font-mono-code">{workflow.ligandPrepStatus.completed} / {workflow.ligandPrepStatus.total} optimized</span>
                                        </div>

                                        <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                                            <div 
                                                className="bg-primary h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${(workflow.ligandPrepStatus.completed / workflow.ligandPrepStatus.total) * 100}%` }}
                                            />
                                        </div>

                                        {workflow.ligandPrepStatus.current_ligand && (
                                            <p className="text-[11px] text-muted-foreground animate-pulse">Optimizing structural geometry for: <span className="font-mono-code text-foreground">{workflow.ligandPrepStatus.current_ligand}</span></p>
                                        )}

                                        <div className="mt-3 max-h-28 overflow-y-auto text-xs space-y-1 divide-y divide-border/30">
                                            {workflow.ligandPrepStatus.details.map((d, i) => (
                                                <div key={i} className="flex justify-between items-center pt-1">
                                                    <span className="font-mono-code text-muted-foreground">{d.name}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.status === 'success' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                                                        {d.status === 'success' ? 'OK' : 'FAILED'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        <div className="flex justify-between">
                            <button onClick={() => setStepIndex(0)} className="px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 font-semibold text-sm transition-all">Back</button>
                            <button
                                onClick={() => setStepIndex(2)}
                                disabled={!prepareDone}
                                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                Continue <ArrowRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Configure Pocket */}
                {stepIndex === 2 && (
                    <div className="animate-fade-in-up">
                        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Grid3x3 size={18} className="text-primary" aria-hidden="true" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Target Pocket Configuration</h2>
                                    <p className="text-sm text-muted-foreground">Choose a specific consensus binding cavity or specify manual coordinates. All library ligands will bind to this site.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                {[
                                    { key: 'cavity', icon: Wand2, label: 'Consensus Cavity Site', desc: 'Weighted wRRF consensus detects binding pockets. Select a cavity to target.' },
                                    { key: 'manual', icon: Target, label: 'Active-Site Grid Box', desc: 'Specify custom center and dimension box coordinates for manual targeting.' },
                                ].map((m) => {
                                    const Icon = m.icon;
                                    const active = dockingMode === m.key;
                                    return (
                                        <button
                                            key={m.key}
                                            onClick={() => setDockingMode(m.key)}
                                            className={`p-4 rounded-xl border transition-all text-left flex gap-3 ${
                                                active
                                                    ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                                                    : 'border-border hover:border-primary/30 bg-background'
                                            }`}
                                        >
                                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                <Icon size={16} aria-hidden="true" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-foreground text-sm mb-1">{m.label}</h3>
                                                <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {dockingMode === 'cavity' && (
                                <div className="space-y-4">
                                    {detectingCavities ? (
                                        <div className="flex flex-col items-center py-6 text-muted-foreground space-y-2">
                                            <Loader2 size={24} className="animate-spin text-primary" />
                                            <p className="text-xs">Detecting surface cavities using fpocket + P2Rank + PUResNet...</p>
                                        </div>
                                    ) : cavities.length > 0 ? (
                                        <div className="overflow-x-auto border border-border rounded-xl bg-background">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                    <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase font-semibold tracking-wider">
                                                        <th className="p-3">Rank</th>
                                                        <th className="p-3">Confidence</th>
                                                        <th className="p-3">Volume (Å³)</th>
                                                        <th className="p-3">Center [X, Y, Z]</th>
                                                        <th className="p-3 text-right">Select</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border">
                                                    {cavities.map((cav) => (
                                                        <tr 
                                                            key={cav.cavity_id}
                                                            onClick={() => setSelectedCavityId(cav.cavity_id)}
                                                            className={`cursor-pointer transition-colors ${selectedCavityId === cav.cavity_id ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                                                        >
                                                            <td className="p-3 font-semibold text-foreground">Pocket {cav.cavity_id}</td>
                                                            <td className="p-3">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cav.confidence === 'HIGH' ? 'bg-primary/10 text-primary' : cav.confidence === 'MEDIUM' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                                                                    {cav.confidence}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 font-mono-code">{cav.volume?.toFixed(1) || '0.0'}</td>
                                                            <td className="p-3 font-mono-code">[{cav.center.map(n => n.toFixed(1)).join(', ')}]</td>
                                                            <td className="p-3 text-right">
                                                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ml-auto ${selectedCavityId === cav.cavity_id ? 'border-primary bg-primary' : 'border-border'}`}>
                                                                    {selectedCavityId === cav.cavity_id && <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center py-6 text-muted-foreground space-y-2">
                                            <AlertCircle size={20} className="text-amber-500" />
                                            <p className="text-xs">No cavities detected or prep required. Attempting detection...</p>
                                            <button onClick={handleDetectCavities} className="px-4 py-1.5 rounded-lg bg-primary/10 text-primary font-bold text-xs">Run Cavity Detection</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {dockingMode === 'manual' && (
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Grid Center (Å)</label>
                                            <button
                                                onClick={handleAutoDetectCenter}
                                                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                                            >
                                                Auto-Detect
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {['x', 'y', 'z'].map((axis) => (
                                                <div key={axis}>
                                                    <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-semibold tracking-widest">{axis}</label>
                                                    <input
                                                        type="number" step="0.1" value={gridCenter[axis]}
                                                        onChange={(e) => { setGridCenter({ ...gridCenter, [axis]: parseFloat(e.target.value) || 0 }); setAutoDetectDone(true); }}
                                                        className={inputClass}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3 block">Grid Size (Å)</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {['x', 'y', 'z'].map((axis) => (
                                                <div key={axis}>
                                                    <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-semibold tracking-widest">{axis}</label>
                                                    <input
                                                        type="number" step="1" value={gridSize[axis]}
                                                        onChange={(e) => setGridSize({ ...gridSize, [axis]: parseInt(e.target.value) || 20 })}
                                                        className={inputClass}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {workflow.uploadProgress.protein && (configureDone || dockingMode === 'cavity') && (
                                <div className="mt-6 border-t border-border pt-5">
                                    <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">Grid Box Preview</h4>
                                    <GridBoxViewer sessionId={workflow.sessionId} gridCenter={activeCenter} gridSize={activeSize} />
                                </div>
                            )}
                        </section>

                        <div className="mt-6 border-t border-border pt-5">
                            {!dockingRunning && !dockingStatus ? (
                                <div className="flex justify-between">
                                    <button onClick={() => setStepIndex(1)} className="px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 font-semibold text-sm transition-all" disabled={workflow.loading}>Back</button>
                                    <button
                                        onClick={handleRunBatchDocking}
                                        disabled={!configureDone || workflow.loading}
                                        className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                                    >
                                        <Play size={16} aria-hidden="true" />
                                        Run Docking Simulation
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4 border border-border bg-background p-4 rounded-xl">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">Docking Progress</span>
                                        <span className="font-mono-code font-bold">
                                            {dockingStatus?.completed || 0} / {dockingStatus?.total || workflow.batchLigands.length} docked
                                        </span>
                                    </div>

                                    <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                                        <div 
                                            className="bg-primary h-2 rounded-full transition-all duration-300 animate-pulse"
                                            style={{ width: `${((dockingStatus?.completed || 0) / (dockingStatus?.total || workflow.batchLigands.length)) * 100}%` }}
                                        />
                                    </div>

                                    <div className="mt-4 max-h-60 overflow-y-auto text-xs space-y-1.5 divide-y divide-border/40">
                                        {dockingStatus?.results?.map((res, i) => (
                                            <div key={i} className="flex justify-between items-center pt-1.5">
                                                <span className="font-mono-code font-semibold text-muted-foreground">{res.name}</span>
                                                <div className="flex items-center gap-2">
                                                    {res.status === 'completed' && (
                                                        <span className="text-xs font-bold text-primary font-mono-code">{res.affinity.toFixed(2)} kcal/mol</span>
                                                    )}
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${res.status === 'completed' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                                                        {res.status === 'completed' ? 'Success' : 'Failed'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {dockingRunning && (!dockingStatus || dockingStatus.results?.length < workflow.batchLigands.length) && (
                                            <div className="flex items-center gap-2 pt-2 text-muted-foreground text-xs italic animate-pulse">
                                                <Loader2 size={12} className="animate-spin text-primary" />
                                                <span>Running calculations on compute pool...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}


            </div>

            <Footer />
        </div>
    );
}

export default BatchDock;
