import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Grid3x3,
    Play,
    Wand2,
    Target,
    ArrowRight,
    Upload,
    Atom,
    Dna,
    CheckCircle2,
    Trash2,
    FileText,
    AlertCircle,
    Sparkles,
    Layers,
    Zap,
    Clock,
    ShieldCheck,
    ChevronRight,
    Activity,
    Search,
    RefreshCw,
    Trophy,
    Flame,
    Check,
    Table,
    LayoutGrid,
    RotateCcw
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import GridBoxViewer from '../components/GridBoxViewer';
import { useBatchDockingWorkflow } from '../hooks/useBatchDockingWorkflow';
import WorkflowHeader from '../components/workflow/WorkflowHeader';
import StatusBanners from '../components/workflow/StatusBanners';
import Stepper from '../components/workflow/Stepper';
import Footer from '../components/Footer';
import { AnimatedCircularProgressBar } from '../components/ui/animated-circular-progress-bar';
import NotifyMeCard from '../components/workflow/NotifyMeCard';
import { notifyJobCompletion } from '../utils/notifications';

const STEPS = [
    { key: 'input', label: 'Input' },
    { key: 'prepare', label: 'Prepare' },
    { key: 'configure', label: 'Configure' },
];

const SAMPLE_LIGANDS = [
    {
        name: 'FDA Approved Mini-Set (4 compounds)',
        smiles: `CC(=O)OC1=CC=CC=C1C(=O)O Aspirin\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C Caffeine\nCC(=O)NC1=CC=C(O)C=C1 Paracetamol\nCC(C)CC1=CC=C(C=C1)C(C)C(=O)O Ibuprofen`
    },
    {
        name: 'Kinase Inhibitors (3 compounds)',
        smiles: `CS(=O)(=O)CCNCc1ccc(-o-c2ccc3ncnc(Nc4ccc(OCc5cccc(F)c5)c(Cl)c4)c3c2)o1 Lapatinib\nCC1=C(C(=O)N2CCOCC2)C=C(NC(=O)C3=CC=C(C=C3)CN4CCN(C)CC4)C=C1 Imatinib\nC1CC1C2=CC(=NO2)C3=C(C=C(C=N3)C4=CC5=C(N=C4)N(C=C5)C6=CC=CC=C6)F Lorlatinib`
    }
];

function BatchDock() {
    const navigate = useNavigate();
    const workflow = useBatchDockingWorkflow();

    const [dockingMode, setDockingMode] = useState('cavity'); // cavity or manual
    const [selectedCavityId, setSelectedCavityId] = useState(1);
    const [cavities, setCavities] = useState([]);
    const [detectingCavities, setDetectingCavities] = useState(false);
    const [pocketViewMode, setPocketViewMode] = useState('cards'); // cards or table

    const [gridCenter, setGridCenter] = useState({ x: 0, y: 0, z: 0 });
    const [gridSize, setGridSize] = useState({ x: 20, y: 20, z: 20 });
    const [autoDetectDone, setAutoDetectDone] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [emailConfirmed, setEmailConfirmed] = useState(false);
    const [queueStatus, setQueueStatus] = useState(null);
    const [stepIndex, setStepIndex] = useState(0);

    // Interactive UI helpers
    const [moleculeSearch, setMoleculeSearch] = useState('');
    const [showAllMolecules, setShowAllMolecules] = useState(false);
    const [leaderboardFilter, setLeaderboardFilter] = useState('');

    // Poll server queue status
    const fetchQueueStatus = React.useCallback(() => {
        api.getQueueStatus()
            .then(res => setQueueStatus(res))
            .catch(() => {});
    }, []);

    React.useEffect(() => {
        fetchQueueStatus();
        const id = setInterval(fetchQueueStatus, 10000);
        return () => clearInterval(id);
    }, [fetchQueueStatus]);

    // Batch docking status polling
    const [dockingStatus, setDockingStatus] = useState(null);
    const [dockingRunning, setDockingRunning] = useState(false);

    const inputDone = Boolean(workflow.uploadProgress.protein && workflow.uploadProgress.ligands);
    const prepareDone = Boolean(
        workflow.proteinPrepared &&
        workflow.ligandPrepStatus && 
        (workflow.ligandPrepStatus.status === 'completed' || workflow.ligandPrepStatus.status === 'completed_with_errors')
    );

    const configureDone = dockingMode === 'cavity' ? cavities.length > 0 : autoDetectDone;

    const completed = useMemo(() => ({
        input: inputDone,
        prepare: prepareDone,
        configure: configureDone,
    }), [inputDone, prepareDone, configureDone]);

    // Ligand-count based progress engine
    const totalLigandsCount = dockingStatus?.total || workflow.batchLigands?.length || 1;
    const completedLigandsCount = dockingStatus?.completed || 0;

    const completedPercent = Math.round((completedLigandsCount / totalLigandsCount) * 100);
    const nextLigandPercent = Math.min(98, Math.round(((completedLigandsCount + 0.92) / totalLigandsCount) * 100));

    const [batchProgress, setBatchProgress] = useState(0);

    useEffect(() => {
        if (!dockingRunning && !dockingStatus) {
            setBatchProgress(0);
            return;
        }

        const timer = setInterval(() => {
            setBatchProgress((prev) => {
                if (prev < completedPercent) {
                    return prev + 1;
                }
                if (prev < nextLigandPercent && dockingRunning) {
                    return prev + 1;
                }
                return prev;
            });
        }, 350);

        return () => clearInterval(timer);
    }, [completedPercent, nextLigandPercent, dockingRunning, dockingStatus]);

    useEffect(() => {
        if (inputDone && stepIndex < 1) setStepIndex(1);
    }, [inputDone]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (prepareDone && stepIndex < 2) {
            setStepIndex(2);
            // Auto detect cavities immediately when entering configure step
            handleDetectCavities();
        }
    }, [prepareDone]); // eslint-disable-line react-hooks/exhaustive-deps

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

            if (notifyEmail.trim()) {
                dockingData.notify_email = notifyEmail.trim();
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

                    // Trigger browser desktop alert and audio chime
                    notifyJobCompletion({
                        title: 'SaliDock: Batch Docking Complete! 🎉',
                        body: `Batch docking completed for ${status.completed || 'all'} ligands. Click to view binding affinities.`,
                        url: `/batch-results?session=${workflow.sessionId}`,
                    });

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

    // Filtered batch ligands for molecule inspector chip cloud
    const filteredLigands = useMemo(() => {
        const list = workflow.batchLigands || [];
        if (!moleculeSearch.trim()) return list;
        const q = moleculeSearch.toLowerCase();
        return list.filter(l => (l.name || '').toLowerCase().includes(q) || (l.smiles || '').toLowerCase().includes(q));
    }, [workflow.batchLigands, moleculeSearch]);

    // Leaderboard sorted hits for active docking HUD
    const leaderboardHits = useMemo(() => {
        const results = dockingStatus?.results || [];
        const filtered = leaderboardFilter.trim()
            ? results.filter(r => (r.name || '').toLowerCase().includes(leaderboardFilter.toLowerCase()))
            : results;
        return [...filtered].sort((a, b) => {
            const affA = typeof a.affinity === 'number' ? a.affinity : 999;
            const affB = typeof b.affinity === 'number' ? b.affinity : 999;
            return affA - affB;
        });
    }, [dockingStatus?.results, leaderboardFilter]);

    const bestAffinity = useMemo(() => {
        const hits = (dockingStatus?.results || []).filter(r => typeof r.affinity === 'number');
        if (hits.length === 0) return null;
        return Math.min(...hits.map(r => r.affinity));
    }, [dockingStatus?.results]);

    const maxCavityVolume = useMemo(() => {
        if (!cavities || cavities.length === 0) return 1000;
        return Math.max(...cavities.map(c => c.volume || 100), 500);
    }, [cavities]);

    // Apple Segmented Control tab class
    const tabClass = (active) =>
        `flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-all duration-150 ease-out active:scale-[0.98] ${
            active
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 apple-specular-edge font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-card/70'
        }`;

    const inputClass = "w-full h-10 px-3.5 rounded-xl bg-card/60 backdrop-blur-md border border-border/80 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-150";
    const textareaClass = "w-full rounded-2xl bg-card/60 backdrop-blur-md border border-border/80 text-foreground text-xs p-3.5 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-150 resize-none font-mono-code";
    const btnPrimary = "px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out disabled:opacity-40 inline-flex items-center gap-2 shadow-sm shadow-primary/20 apple-specular-edge";

    return (
        <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20 selection:text-primary">
            <WorkflowHeader
                title="Batch Molecular Docking"
                subtitle="High-throughput ensemble screening of chemical compound libraries against 3D target receptor binding pockets."
            />

            <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-16">
                {/* Apple Screening Deck Metric Strip */}
                <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                    {/* Target Receptor Metric */}
                    <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-white/[0.08] dark:border-white/[0.08] p-3 shadow-xs apple-specular-edge">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
                            <Dna size={12} className="text-primary" />
                            <span>Target Receptor</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-foreground truncate max-w-[120px]">
                                {workflow.proteinFile?.name || workflow.savedProteinFilename || (workflow.uniprotId ? `UniProt: ${workflow.uniprotId}` : 'Awaiting File')}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${workflow.uploadProgress.protein ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-muted-foreground/40'}`} />
                        </div>
                    </div>

                    {/* Library Size Metric */}
                    <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-white/[0.08] dark:border-white/[0.08] p-3 shadow-xs apple-specular-edge">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
                            <Atom size={12} className="text-primary" />
                            <span>Library Deck</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-mono-code font-bold text-xs text-foreground">
                                {workflow.batchLigands?.length || 0} molecules
                            </span>
                            <span className={`w-2 h-2 rounded-full ${workflow.uploadProgress.ligands ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-muted-foreground/40'}`} />
                        </div>
                    </div>

                    {/* Preparation Status Metric */}
                    <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-white/[0.08] dark:border-white/[0.08] p-3 shadow-xs apple-specular-edge">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
                            <ShieldCheck size={12} className="text-primary" />
                            <span>Optimization</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${prepareDone ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                {prepareDone ? 'MMFF94 Ready' : 'Pending Prep'}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${prepareDone ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50' : 'bg-muted-foreground/40'}`} />
                        </div>
                    </div>

                    {/* Consensus Engine Metric */}
                    <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-white/[0.08] dark:border-white/[0.08] p-3 shadow-xs apple-specular-edge">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
                            <Sparkles size={12} className="text-primary" />
                            <span>Engine</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground truncate">
                                Vina + GNINA CNN
                            </span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                        </div>
                    </div>

                    {/* GPU Queue Latency Metric */}
                    <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-2xl bg-card/60 backdrop-blur-xl border border-white/[0.08] dark:border-white/[0.08] p-3 shadow-xs apple-specular-edge">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-1">
                            <Zap size={12} className="text-amber-500" />
                            <span>Cluster Queue</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-mono-code text-xs font-semibold text-foreground">
                                {queueStatus ? `${queueStatus.total_active || 0} active / ${queueStatus.total_queued || 0} queued` : 'Cluster Ready'}
                            </span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                        </div>
                    </div>
                </div>

                <Stepper steps={STEPS} currentIndex={stepIndex} completed={completed} onStepClick={setStepIndex} />

                <StatusBanners
                    error={workflow.error}
                    setError={workflow.setError}
                    loading={workflow.loading && !dockingRunning}
                    loadingMessage={workflow.loadingMessage}
                />

                {/* Step 1: Input */}
                {stepIndex === 0 && (
                    <div className="animate-fade-in-up space-y-6">
                        <section className="rounded-3xl bg-card/75 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-border/60">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                                        <Layers size={20} aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">Receptor & Chemical Library Input</h2>
                                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Upload single target macromolecule receptor and provide batch ligands for ensemble screening.</p>
                                    </div>
                                </div>
                                {!workflow.sessionId && (
                                    <div className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 flex items-center gap-2 self-start sm:self-auto">
                                        <AnimatedCircularProgressBar size={14} strokeWidth={2.5} />
                                        <span className="text-xs text-muted-foreground font-medium">Initializing workspace session...</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Protein Section */}
                                <div className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md p-5 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                    <Dna size={15} />
                                                </div>
                                                <h3 className="font-bold text-sm tracking-tight text-foreground">1. Target Protein Receptor</h3>
                                            </div>
                                            {workflow.uploadProgress.protein && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                    <CheckCircle2 size={11} /> Loaded
                                                </span>
                                            )}
                                        </div>

                                        {/* Apple Segmented Tab Switcher */}
                                        <div className="p-1 bg-muted/50 rounded-2xl flex gap-1 mb-4 border border-border/50">
                                            <button type="button" className={tabClass(workflow.proteinInputMethod === 'file')} onClick={() => workflow.setProteinInputMethod('file')}>PDB File</button>
                                            <button type="button" className={tabClass(workflow.proteinInputMethod === 'fasta')} onClick={() => { workflow.setProteinInputMethod('fasta'); workflow.setAlphafoldMode('sequence'); }}>FASTA</button>
                                            <button type="button" className={tabClass(workflow.proteinInputMethod === 'uniprot')} onClick={() => { workflow.setProteinInputMethod('uniprot'); workflow.setAlphafoldMode('uniprot'); }}>UniProt</button>
                                        </div>

                                        {workflow.proteinInputMethod === 'file' && (
                                            <div>
                                                <label className={`block ${workflow.sessionId && !workflow.loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                                    <input type="file" accept=".pdb,.ent" onChange={workflow.handleProteinUpload} className="hidden" id="protein-upload" disabled={!workflow.sessionId || workflow.loading} />
                                                    <div className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all duration-200 ease-out active:scale-[0.99] ${
                                                        workflow.uploadProgress.protein
                                                            ? 'border-primary/50 bg-primary/[0.04]'
                                                            : 'border-border/70 hover:border-primary/50 hover:bg-card/60 bg-card/20'
                                                    }`}>
                                                        {workflow.uploadProgress.protein ? (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                                                    <CheckCircle2 size={22} aria-hidden="true" />
                                                                </div>
                                                                <span className="text-xs sm:text-sm font-semibold text-foreground font-mono-code truncate max-w-[280px]">
                                                                    {workflow.proteinFile?.name || workflow.savedProteinFilename || 'Target Protein Uploaded'}
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground">Click to upload a different PDB structure</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="w-10 h-10 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                                                                    <Upload size={20} aria-hidden="true" />
                                                                </div>
                                                                <span className="text-xs sm:text-sm font-semibold text-foreground">Click to choose receptor structure</span>
                                                                <span className="text-[11px] text-muted-foreground">Standard PDB or ENT crystallography format</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>
                                            </div>
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
                                                    <Sparkles size={14} />
                                                    Predict Structure (ESMFold)
                                                </button>
                                            </div>
                                        )}

                                        {workflow.proteinInputMethod === 'uniprot' && (
                                            <div className="space-y-3">
                                                <input
                                                    type="text"
                                                    value={workflow.uniprotId}
                                                    onChange={(e) => workflow.setUniprotId(e.target.value.trim().toUpperCase())}
                                                    placeholder="e.g., P12345, P00533 (EGFR)"
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
                                                    <DownloadIcon size={14} />
                                                    Fetch from UniProt AlphaFold DB
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Ligands Section */}
                                <div className="rounded-2xl border border-border/80 bg-card/40 backdrop-blur-md p-5 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                    <Atom size={15} />
                                                </div>
                                                <h3 className="font-bold text-sm tracking-tight text-foreground">2. Chemical Ligands Library</h3>
                                            </div>
                                            {(workflow.batchLigands?.length || 0) > 0 && (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                                    {workflow.batchLigands?.length} Compounds Loaded
                                                </span>
                                            )}
                                        </div>

                                        {/* Apple Segmented Tab Switcher */}
                                        <div className="p-1 bg-muted/50 rounded-2xl flex gap-1 mb-4 border border-border/50">
                                            <button type="button" className={tabClass(workflow.ligandInputMethod === 'file')} onClick={() => workflow.setLigandInputMethod('file')}>Files (SDF / ZIP)</button>
                                            <button type="button" className={tabClass(workflow.ligandInputMethod === 'smiles')} onClick={() => workflow.setLigandInputMethod('smiles')}>SMILES List</button>
                                        </div>

                                        {workflow.ligandInputMethod === 'file' && (
                                            <div>
                                                <label className={`block ${workflow.sessionId && !workflow.loading ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
                                                    <input type="file" multiple accept=".sdf,.mol2,.zip" onChange={workflow.handleBatchLigandsUpload} className="hidden" id="ligand-batch-upload" disabled={!workflow.sessionId || workflow.loading} />
                                                    <div className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all duration-200 ease-out active:scale-[0.99] ${
                                                        workflow.uploadProgress.ligands
                                                            ? 'border-primary/50 bg-primary/[0.04]'
                                                            : 'border-border/70 hover:border-primary/50 hover:bg-card/60 bg-card/20'
                                                    }`}>
                                                        {workflow.uploadProgress.ligands ? (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                                                    <CheckCircle2 size={22} aria-hidden="true" />
                                                                </div>
                                                                <span className="text-xs sm:text-sm font-semibold text-foreground">
                                                                    Parsed {workflow.batchLigands?.length || 0} molecule(s) in library
                                                                </span>
                                                                <span className="text-[11px] text-muted-foreground">Click to upload another library or replace set</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <div className="w-10 h-10 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                                                                    <Upload size={20} aria-hidden="true" />
                                                                </div>
                                                                <span className="text-xs sm:text-sm font-semibold text-foreground">Upload ligand library files</span>
                                                                <span className="text-[11px] text-muted-foreground">Supports multi-mol SDF, archive ZIP, or multiple SDF/MOL2</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>
                                            </div>
                                        )}

                                        {workflow.ligandInputMethod === 'smiles' && (
                                            <div className="space-y-3">
                                                {/* Quick sample chips */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quick Datasets:</span>
                                                    {SAMPLE_LIGANDS.map((sample) => (
                                                        <button
                                                            key={sample.name}
                                                            type="button"
                                                            onClick={() => workflow.setSmilesInput(sample.smiles)}
                                                            className="text-[11px] px-2.5 py-1 rounded-full bg-card/80 border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-95 transition-all"
                                                        >
                                                            {sample.name}
                                                        </button>
                                                    ))}
                                                </div>

                                                <textarea
                                                    value={workflow.smilesInput}
                                                    onChange={(e) => workflow.setSmilesInput(e.target.value)}
                                                    placeholder={"Enter one SMILES string per line, optionally with a name:\nCC(=O)OC1=CC=CC=C1C(=O)O Aspirin\nCN1C=NC2=C1C(=O)N(C(=O)N2C)C Caffeine\nCC(=O)NC1=CC=C(O)C=C1 Paracetamol"}
                                                    className={textareaClass}
                                                    rows="5"
                                                    disabled={!workflow.sessionId || workflow.loading}
                                                />
                                                <button type="button" onClick={workflow.handleBatchSmilesSubmit} disabled={!workflow.sessionId || !workflow.smilesInput.trim() || workflow.loading} className={btnPrimary}>
                                                    <Sparkles size={14} />
                                                    Generate & Validate 3D Conformations
                                                </button>
                                            </div>
                                        )}

                                        {/* Tactile Molecule Chip Cloud Inspector */}
                                        {(workflow.batchLigands?.length || 0) > 0 && (
                                            <div className="mt-4 pt-3 border-t border-border/60">
                                                <div className="flex items-center justify-between mb-2.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <Search size={12} className="text-muted-foreground" />
                                                        <input
                                                            type="text"
                                                            value={moleculeSearch}
                                                            onChange={(e) => setMoleculeSearch(e.target.value)}
                                                            placeholder="Filter molecules..."
                                                            className="h-6 w-32 px-2 text-[11px] bg-card/50 rounded-lg border border-border/60 outline-none text-foreground placeholder:text-muted-foreground/60 focus:w-44 transition-all"
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-mono-code text-muted-foreground">
                                                        Showing {Math.min(showAllMolecules ? filteredLigands.length : 12, filteredLigands.length)} of {filteredLigands.length}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                                                    {(showAllMolecules ? filteredLigands : filteredLigands.slice(0, 12)).map((l, i) => (
                                                        <div
                                                            key={i}
                                                            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card/70 border border-border/70 hover:border-primary/40 hover:bg-card text-[11px] font-medium transition-all shadow-2xs"
                                                        >
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                            <span className="font-mono-code font-semibold text-foreground truncate max-w-[120px]">{l.name || `Mol_${i+1}`}</span>
                                                            {l.properties?.mw && (
                                                                <span className="text-[9px] text-muted-foreground/80 font-mono-code">
                                                                    {l.properties.mw.toFixed(0)} Da
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {filteredLigands.length > 12 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAllMolecules(!showAllMolecules)}
                                                        className="mt-2 text-[11px] font-semibold text-primary hover:underline inline-flex items-center gap-1"
                                                    >
                                                        {showAllMolecules ? 'Show Less' : `+ Show all ${filteredLigands.length} compounds`}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* Step 2: Prepare */}
                {stepIndex === 1 && (
                    <div className="animate-fade-in-up space-y-6">
                        {/* Receptor Prep */}
                        <section className="rounded-3xl bg-card/75 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge">
                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/60">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                                        <Dna size={20} aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">Target Receptor Preparation</h2>
                                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Select crystallographic chains and cofactors to preserve, then generate protonated PDBQT.</p>
                                    </div>
                                </div>
                                {workflow.proteinPrepared && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        <CheckCircle2 size={13} /> Prepared
                                    </span>
                                )}
                            </div>

                            {workflow.showProteinPrep && (
                                <div className="space-y-6">
                                    {/* Chain selector */}
                                    {workflow.chains && workflow.chains.length > 0 && (
                                        <div className="p-5 rounded-2xl border border-border/70 bg-card/30 backdrop-blur-md">
                                            <div className="flex items-center justify-between mb-3.5">
                                                <label className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                                                    Chains to Preserve
                                                </label>
                                                <span className="text-[11px] text-muted-foreground font-mono-code">
                                                    {workflow.selectedChains.length === 0
                                                        ? 'All chains preserved'
                                                        : `${workflow.selectedChains.length} / ${workflow.chains.length} selected`}
                                                </span>
                                            </div>
                                            {(() => {
                                                const suggestedChain = workflow.chains.length > 1
                                                    ? workflow.chains.reduce((best, c) => (c.atoms ?? 0) > (best.atoms ?? 0) ? c : best, workflow.chains[0])
                                                    : null;
                                                const suggestedId = suggestedChain?.id ?? suggestedChain;
                                                return (
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                                                        {workflow.chains.map((chain) => {
                                                            const id = chain.id ?? chain;
                                                            const atoms = chain.atoms;
                                                            const name = chain.name
                                                                ? chain.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                                                                : null;
                                                            const active = workflow.selectedChains.includes(id);
                                                            const isSuggested = workflow.chains.length > 1 && id === suggestedId;
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
                                                                    className={`flex flex-col items-start gap-1 p-3 rounded-2xl border font-semibold text-xs transition-all duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed ${
                                                                        active
                                                                            ? 'border-primary/60 bg-primary/[0.08] text-primary shadow-xs ring-1 ring-primary/20 apple-specular-edge'
                                                                            : isSuggested
                                                                                ? 'border-emerald-500/40 bg-emerald-500/[0.04] hover:border-emerald-500/60 text-foreground'
                                                                                : 'border-border/70 hover:border-primary/30 bg-card/60 text-foreground'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between w-full">
                                                                        <span className="font-mono-code font-bold text-sm">Chain {id}</span>
                                                                        {isSuggested && (
                                                                            <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full leading-none shadow-xs">
                                                                                Suggested
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {name && (
                                                                        <span className="text-[10px] font-medium text-foreground/80 leading-tight max-w-[140px] truncate" title={name}>{name}</span>
                                                                    )}
                                                                    {atoms !== undefined && (
                                                                        <span className="text-[10px] font-mono-code text-muted-foreground">{atoms} atoms</span>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
                                            <p className="text-[11px] text-muted-foreground mt-2.5 italic">
                                                Leave unselected to keep all chains intact.
                                            </p>
                                        </div>
                                    )}

                                    {/* Heteroatom selector */}
                                    <div className="p-5 rounded-2xl border border-border/70 bg-card/30 backdrop-blur-md">
                                        <label className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground mb-2.5 block">Cofactors & Heteroatoms to Retain</label>
                                        {workflow.heteroatoms.length > 0 ? (
                                            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-1">
                                                {workflow.heteroatoms.map((h) => {
                                                    const active = workflow.selectedHeteroatoms.includes(h);
                                                    return (
                                                        <button
                                                            key={h}
                                                            type="button"
                                                            disabled={workflow.proteinPrepared}
                                                            onClick={() => workflow.setSelectedHeteroatoms(active ? workflow.selectedHeteroatoms.filter(x => x !== h) : [...workflow.selectedHeteroatoms, h])}
                                                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150 ease-out active:scale-[0.98] disabled:cursor-not-allowed ${
                                                                active
                                                                    ? 'bg-primary text-primary-foreground border-primary shadow-xs apple-specular-edge'
                                                                    : 'bg-card/70 border-border/70 hover:border-primary/40 text-foreground'
                                                            }`}
                                                        >
                                                            {h}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground italic">No crystallographic heteroatoms detected in receptor.</p>
                                        )}
                                    </div>

                                    <button
                                        onClick={workflow.handleProteinPreparation}
                                        disabled={workflow.loading || workflow.proteinPrepared}
                                        className={btnPrimary}
                                    >
                                        {workflow.proteinPrepared ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
                                        {workflow.proteinPrepared ? 'Receptor Structure Prepared' : 'Prepare Protein Receptor'}
                                    </button>
                                </div>
                            )}
                        </section>

                        {/* Ligands Prep */}
                        <section className="rounded-3xl bg-card/75 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge">
                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/60">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                                        <Atom size={20} aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">Optimize Chemical Library (MMFF94)</h2>
                                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Energy minimize 3D geometries, resolve stereocenters, and calculate Gasteiger partial charges.</p>
                                    </div>
                                </div>
                                {prepareDone && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        <CheckCircle2 size={13} /> Optimized
                                    </span>
                                )}
                            </div>

                            <div className="space-y-5">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card/40 border border-border/70 p-4 rounded-2xl backdrop-blur-md">
                                    <div className="space-y-0.5">
                                        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Loaded Library Compounds</span>
                                        <div className="font-mono-code font-bold text-base text-foreground">
                                            {workflow.batchLigands?.length || 0} molecules ready for minimization
                                        </div>
                                    </div>
                                    <button
                                        onClick={workflow.handlePrepareBatchLigands}
                                        disabled={workflow.loading || prepareDone}
                                        className={btnPrimary}
                                    >
                                        {prepareDone ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
                                        {prepareDone ? 'Batch Optimization Complete' : 'Run Batch Optimization'}
                                    </button>
                                </div>

                                {workflow.ligandPrepStatus && (
                                    <div className="space-y-3.5 border border-border/70 bg-card/30 p-5 rounded-2xl backdrop-blur-md">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold uppercase tracking-wider text-muted-foreground">Force Field Optimization</span>
                                            <span className="font-mono-code font-bold text-primary">
                                                {workflow.ligandPrepStatus.completed} / {workflow.ligandPrepStatus.total} compounds
                                            </span>
                                        </div>

                                        <div className="w-full bg-border/60 rounded-full h-2 overflow-hidden">
                                            <div 
                                                className="bg-primary h-2 rounded-full transition-all duration-300 ease-out apple-specular-edge"
                                                style={{ width: `${(workflow.ligandPrepStatus.completed / workflow.ligandPrepStatus.total) * 100}%` }}
                                            />
                                        </div>

                                        {workflow.ligandPrepStatus.current_ligand && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                                                <RefreshCw size={12} className="animate-spin text-primary" />
                                                <span>Minimizing 3D conformation for: <strong className="font-mono-code text-foreground">{workflow.ligandPrepStatus.current_ligand}</strong></span>
                                            </div>
                                        )}

                                        <div className="mt-3 max-h-36 overflow-y-auto text-xs space-y-1.5 divide-y divide-border/30 pr-1">
                                            {workflow.ligandPrepStatus.details.map((d, i) => (
                                                <div key={i} className="flex justify-between items-center pt-1.5">
                                                    <span className="font-mono-code text-foreground">{d.name}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.status === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                                                        {d.status === 'success' ? 'CONVERGED' : 'FAILED'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {/* Step 3: Configure Pocket */}
                {stepIndex === 2 && (
                    <div className="animate-fade-in-up space-y-6">
                        <section className="rounded-3xl bg-card/75 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge">
                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/60">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                                        <Grid3x3 size={20} aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">Target Pocket Configuration</h2>
                                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Select a high-confidence consensus binding cavity or specify manual active-site coordinates.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Mode switcher cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
                                {[
                                    { key: 'cavity', icon: Wand2, label: 'Consensus Cavity Site', desc: 'wRRF consensus of fpocket, P2Rank & PUResNet detects active pockets.' },
                                    { key: 'manual', icon: Target, label: 'Active-Site Grid Box', desc: 'Specify custom [X, Y, Z] center and dimension coordinates for custom targeting.' },
                                ].map((m) => {
                                    const Icon = m.icon;
                                    const active = dockingMode === m.key;
                                    return (
                                        <button
                                            key={m.key}
                                            onClick={() => setDockingMode(m.key)}
                                            className={`p-4 sm:p-5 rounded-2xl border transition-all duration-150 ease-out active:scale-[0.98] text-left flex gap-3.5 select-none ${
                                                active
                                                    ? 'border-primary/60 bg-card/90 backdrop-blur-xl shadow-md apple-specular-edge ring-1 ring-primary/25'
                                                    : 'border-border/70 hover:border-primary/30 bg-card/40 backdrop-blur-md'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform ${active ? 'bg-primary text-primary-foreground shadow-xs shadow-primary/30' : 'bg-muted/70 text-muted-foreground'}`}>
                                                <Icon size={18} aria-hidden="true" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-foreground text-sm mb-1 tracking-tight">{m.label}</h3>
                                                <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Cavity Mode */}
                            {dockingMode === 'cavity' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Detected Binding Pockets:</span>
                                            <span className="text-xs font-mono-code font-bold text-foreground">{cavities.length} pockets found</span>
                                        </div>
                                        {cavities.length > 0 && (
                                            <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border/60">
                                                <button
                                                    type="button"
                                                    onClick={() => setPocketViewMode('cards')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                                                        pocketViewMode === 'cards' ? 'bg-card text-foreground shadow-2xs font-bold' : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    <LayoutGrid size={13} /> Cards
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPocketViewMode('table')}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                                                        pocketViewMode === 'table' ? 'bg-card text-foreground shadow-2xs font-bold' : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    <Table size={13} /> Table
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {detectingCavities ? (
                                        <div className="flex flex-col items-center py-10 text-muted-foreground gap-3.5 bg-card/30 border border-border/70 rounded-2xl">
                                            <AnimatedCircularProgressBar label="Predicting" size={72} strokeWidth={6} />
                                            <div className="text-center">
                                                <p className="text-xs font-semibold text-foreground">Consensus Cavity Detection In Progress</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">Scoring protein surface via fpocket, P2Rank, and deep-learning PUResNet...</p>
                                            </div>
                                        </div>
                                    ) : cavities.length > 0 ? (
                                        pocketViewMode === 'cards' ? (
                                            /* Apple Visual Pocket Deck */
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                                {cavities.map((cav, idx) => {
                                                    const isSelected = selectedCavityId === cav.cavity_id;
                                                    const volRatio = Math.min(100, Math.round(((cav.volume || 100) / maxCavityVolume) * 100));
                                                    return (
                                                        <div
                                                            key={cav.cavity_id}
                                                            onClick={() => setSelectedCavityId(cav.cavity_id)}
                                                            className={`cursor-pointer rounded-2xl p-4.5 border transition-all duration-150 ease-out active:scale-[0.98] select-none flex flex-col justify-between ${
                                                                isSelected
                                                                    ? 'border-primary/60 bg-card/90 shadow-md ring-1 ring-primary/30 apple-specular-edge'
                                                                    : 'border-border/70 bg-card/40 hover:bg-card/70 hover:border-primary/30'
                                                            }`}
                                                        >
                                                            <div>
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                                                            {cav.cavity_id}
                                                                        </span>
                                                                        <span className="font-bold text-sm text-foreground">Pocket {cav.cavity_id}</span>
                                                                    </div>
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                        cav.confidence === 'HIGH'
                                                                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-2xs'
                                                                            : cav.confidence === 'MEDIUM'
                                                                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                                                                : 'bg-muted text-muted-foreground'
                                                                    }`}>
                                                                        {cav.confidence || 'NORMAL'}
                                                                    </span>
                                                                </div>

                                                                {/* Volume bar */}
                                                                <div className="space-y-1 mb-3">
                                                                    <div className="flex justify-between items-center text-[11px]">
                                                                        <span className="text-muted-foreground">Cavity Volume:</span>
                                                                        <span className="font-mono-code font-bold text-foreground">{cav.volume?.toFixed(1) || '0.0'} Å³</span>
                                                                    </div>
                                                                    <div className="w-full bg-border/50 rounded-full h-1.5 overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full transition-all duration-300 ${isSelected ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                                                                            style={{ width: `${volRatio}%` }}
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* Center coordinates */}
                                                                <div className="bg-muted/40 rounded-xl p-2 text-[10px] font-mono-code text-muted-foreground space-y-0.5 mb-3">
                                                                    <div className="flex justify-between">
                                                                        <span>Center [X, Y, Z]:</span>
                                                                        <span className="text-foreground">
                                                                            [{cav.center.map(n => n.toFixed(1)).join(', ')}]
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center justify-between pt-2 border-t border-border/40">
                                                                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                                                                    {idx === 0 ? '★ Top Consensus Hit' : `Rank #${idx + 1}`}
                                                                </span>
                                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-primary-foreground shadow-xs' : 'border-border'}`}>
                                                                    {isSelected && <Check size={11} strokeWidth={3} />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            /* Upgraded Table View */
                                            <div className="overflow-x-auto border border-border/80 rounded-2xl bg-card/30 backdrop-blur-md">
                                                <table className="w-full text-left border-collapse text-xs">
                                                    <thead>
                                                        <tr className="border-b border-border/70 bg-muted/30 text-muted-foreground uppercase font-bold tracking-wider text-[10px]">
                                                            <th className="p-3.5">Rank</th>
                                                            <th className="p-3.5">Confidence</th>
                                                            <th className="p-3.5">Volume (Å³)</th>
                                                            <th className="p-3.5">Center [X, Y, Z]</th>
                                                            <th className="p-3.5 text-right">Target</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border/40">
                                                        {cavities.map((cav) => (
                                                            <tr 
                                                                key={cav.cavity_id}
                                                                onClick={() => setSelectedCavityId(cav.cavity_id)}
                                                                className={`cursor-pointer transition-colors ${selectedCavityId === cav.cavity_id ? 'bg-primary/[0.08]' : 'hover:bg-muted/30'}`}
                                                            >
                                                                <td className="p-3.5 font-bold text-foreground">Pocket {cav.cavity_id}</td>
                                                                <td className="p-3.5">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cav.confidence === 'HIGH' ? 'bg-emerald-500/10 text-emerald-500' : cav.confidence === 'MEDIUM' ? 'bg-amber-500/10 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                                                                        {cav.confidence}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3.5 font-mono-code">{cav.volume?.toFixed(1) || '0.0'}</td>
                                                                <td className="p-3.5 font-mono-code">[{cav.center.map(n => n.toFixed(1)).join(', ')}]</td>
                                                                <td className="p-3.5 text-right">
                                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ml-auto ${selectedCavityId === cav.cavity_id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                                                                        {selectedCavityId === cav.cavity_id && <Check size={10} strokeWidth={3} />}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )
                                    ) : (
                                        <div className="flex flex-col items-center py-8 text-muted-foreground space-y-3 bg-card/30 rounded-2xl border border-border/70">
                                            <AlertCircle size={22} className="text-amber-500" />
                                            <p className="text-xs">No cavities detected or prep required. Click to run surface cavity detection.</p>
                                            <button onClick={handleDetectCavities} className={btnPrimary}>
                                                <Wand2 size={14} /> Run Consensus Cavity Detection
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Manual Grid Mode */}
                            {dockingMode === 'manual' && (
                                <div className="space-y-4">
                                    <div className="p-5 rounded-2xl border border-border/70 bg-card/30 backdrop-blur-md">
                                        <div className="flex items-center justify-between mb-3.5">
                                            <label className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Grid Center Coordinates (Å)</label>
                                            <button
                                                onClick={handleAutoDetectCenter}
                                                className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all"
                                            >
                                                Auto-Detect Receptor Center
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {['x', 'y', 'z'].map((axis) => (
                                                <div key={axis}>
                                                    <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold tracking-wider">{axis}-axis</label>
                                                    <input
                                                        type="number" step="0.1" value={gridCenter[axis]}
                                                        onChange={(e) => { setGridCenter({ ...gridCenter, [axis]: parseFloat(e.target.value) || 0 }); setAutoDetectDone(true); }}
                                                        className={inputClass}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-5 rounded-2xl border border-border/70 bg-card/30 backdrop-blur-md">
                                        <label className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3.5 block">Search Box Dimensions (Å)</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {['x', 'y', 'z'].map((axis) => (
                                                <div key={axis}>
                                                    <label className="text-[11px] text-muted-foreground mb-1 block uppercase font-bold tracking-wider">{axis}-span</label>
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

                            {/* 3D Grid Box Viewer */}
                            {workflow.uploadProgress.protein && (configureDone || dockingMode === 'cavity') && (
                                <div className="mt-6 border-t border-border/60 pt-6">
                                    <div className="flex items-center justify-between mb-3.5">
                                        <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">3D Active Site & Search Box Preview</h4>
                                        <span className="font-mono-code text-[11px] text-muted-foreground">
                                            {activeSize.x} × {activeSize.y} × {activeSize.z} Å
                                        </span>
                                    </div>
                                    <div className="rounded-2xl overflow-hidden border border-border/70 shadow-elevated">
                                        <GridBoxViewer sessionId={workflow.sessionId} gridCenter={activeCenter} gridSize={activeSize} />
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Real-time Streaming Execution HUD & Leaderboard */}
                        {dockingRunning || dockingStatus ? (
                            <section className="rounded-3xl bg-card/85 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge space-y-6">
                                <div className="flex items-center justify-between pb-5 border-b border-border/60">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                            <Activity size={20} className="animate-pulse" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-base text-foreground tracking-tight">Active Batch Simulation HUD</h3>
                                            <p className="text-xs text-muted-foreground">Streaming GPU docking executions and real-time binding affinities.</p>
                                        </div>
                                    </div>
                                    {bestAffinity !== null && (
                                        <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-bold text-xs flex items-center gap-1.5">
                                            <Trophy size={14} />
                                            <span>Best Hit: {bestAffinity.toFixed(2)} kcal/mol</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                                    <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-card/40 border border-border/60">
                                        <AnimatedCircularProgressBar
                                            value={batchProgress}
                                            sublabel={`${completedLigandsCount}/${totalLigandsCount}`}
                                            label="Docked"
                                            size={95}
                                            strokeWidth={8}
                                            gaugePrimaryColor="hsl(var(--primary))"
                                            gaugeSecondaryColor="hsl(var(--border))"
                                        />
                                        <p className="text-xs font-semibold text-muted-foreground mt-3">
                                            {dockingRunning ? 'Simulating Conformers...' : 'Batch Completed'}
                                        </p>
                                    </div>

                                    <div className="md:col-span-2 space-y-3.5">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold uppercase tracking-wider text-muted-foreground">Consensus Throughput</span>
                                            <span className="font-mono-code font-bold text-primary">
                                                {completedLigandsCount} of {totalLigandsCount} molecules completed ({batchProgress}%)
                                            </span>
                                        </div>

                                        <div className="w-full bg-border/60 rounded-full h-2.5 overflow-hidden">
                                            <div 
                                                className="bg-primary h-full rounded-full transition-all duration-300 ease-out apple-specular-edge shadow-xs"
                                                style={{ width: `${batchProgress}%` }}
                                            />
                                        </div>

                                        {/* Leaderboard Table / Feed */}
                                        <div className="mt-4 pt-4 border-t border-border/60">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Flame size={15} className="text-amber-500" />
                                                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">Top Ranked Hits</span>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={leaderboardFilter}
                                                    onChange={(e) => setLeaderboardFilter(e.target.value)}
                                                    placeholder="Filter hits..."
                                                    className="h-6 w-28 px-2 text-[11px] bg-card/50 rounded-lg border border-border/60 outline-none text-foreground placeholder:text-muted-foreground/60 focus:w-40 transition-all"
                                                />
                                            </div>

                                            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                                                {leaderboardHits.length > 0 ? (
                                                    leaderboardHits.map((res, i) => {
                                                        const isTop3 = i < 3 && res.status === 'completed';
                                                        return (
                                                            <div
                                                                key={i}
                                                                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                                                                    isTop3
                                                                        ? 'bg-primary/[0.04] border-primary/30 shadow-2xs'
                                                                        : 'bg-card/40 border-border/60'
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2 truncate">
                                                                    <span className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                                                                        i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'
                                                                    }`}>
                                                                        #{i + 1}
                                                                    </span>
                                                                    <span className="font-mono-code font-semibold text-foreground truncate max-w-[180px]">
                                                                        {res.name}
                                                                    </span>
                                                                </div>

                                                                <div className="flex items-center gap-3">
                                                                    {res.status === 'completed' && typeof res.affinity === 'number' && (
                                                                        <span className="font-mono-code font-bold text-emerald-500 text-xs">
                                                                            {res.affinity.toFixed(2)} kcal/mol
                                                                        </span>
                                                                    )}
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${res.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}>
                                                                        {res.status === 'completed' ? 'Success' : 'Failed'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <p className="text-xs text-muted-foreground text-center py-4 italic">Awaiting initial completed conformers from cluster...</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <NotifyMeCard
                                    notifyEmail={notifyEmail}
                                    setNotifyEmail={setNotifyEmail}
                                    emailConfirmed={emailConfirmed}
                                    setEmailConfirmed={setEmailConfirmed}
                                    queueStatus={queueStatus}
                                    isRunning={true}
                                    jobType="batch"
                                />
                            </section>
                        ) : (
                            <div className="space-y-4">
                                <NotifyMeCard
                                    notifyEmail={notifyEmail}
                                    setNotifyEmail={setNotifyEmail}
                                    emailConfirmed={emailConfirmed}
                                    setEmailConfirmed={setEmailConfirmed}
                                    queueStatus={queueStatus}
                                    isRunning={false}
                                    jobType="batch"
                                />
                            </div>
                        )}
                    </div>
                )}
                {/* Workflow Step Navigation Action Bar */}
                <div className="mt-8 p-4 sm:p-5 rounded-3xl bg-card/80 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] shadow-elevated apple-specular-edge flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-xs sm:text-sm truncate">
                        {stepIndex > 0 ? (
                            <button
                                type="button"
                                onClick={() => setStepIndex(stepIndex - 1)}
                                disabled={workflow.loading || dockingRunning}
                                className="px-5 py-2.5 rounded-full border border-border/80 bg-card/60 backdrop-blur-md text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-[0.97] font-semibold text-xs sm:text-sm transition-all duration-150 disabled:opacity-40"
                            >
                                Back
                            </button>
                        ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse ml-2" />
                        )}
                        <span className="text-muted-foreground font-medium hidden sm:inline">
                            {stepIndex === 0 && (inputDone ? 'Receptor & Ligands ready' : 'Provide target receptor & chemical library')}
                            {stepIndex === 1 && (prepareDone ? 'Optimization complete' : 'Prepare protein & optimize library')}
                            {stepIndex === 2 && (configureDone ? 'Pocket targeting configured' : 'Select active site target')}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {stepIndex < 2 ? (
                            <button
                                type="button"
                                onClick={() => setStepIndex(stepIndex + 1)}
                                disabled={(stepIndex === 0 && !inputDone) || (stepIndex === 1 && !prepareDone) || workflow.loading}
                                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out disabled:opacity-40 shadow-sm shadow-primary/20 apple-specular-edge inline-flex items-center gap-2"
                            >
                                <span>Continue</span>
                                <ArrowRight size={14} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleRunBatchDocking}
                                disabled={!configureDone || workflow.loading || dockingRunning}
                                className="px-7 py-3 rounded-full bg-primary text-primary-foreground font-bold text-xs sm:text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out disabled:opacity-40 inline-flex items-center gap-2 shadow-md shadow-primary/25 apple-specular-edge"
                            >
                                <Play size={15} fill="currentColor" aria-hidden="true" />
                                <span>{dockingRunning ? 'Simulation Running...' : 'Run Batch Docking'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}

// Download icon helper
function DownloadIcon(props) {
    return (
        <svg {...props} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

export default BatchDock;

