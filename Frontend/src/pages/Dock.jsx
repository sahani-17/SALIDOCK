import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Grid3x3,
    Play,
    Wand2,
    Target,
    ArrowRight,
    Layers,
    Activity,
    CheckCircle2,
    ChevronRight,
    RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import GridBoxViewer from '../components/GridBoxViewer';
import { useDockingWorkflow } from '../hooks/useDockingWorkflow';
import WorkflowHeader from '../components/workflow/WorkflowHeader';
import StatusBanners from '../components/workflow/StatusBanners';
import InputSection from '../components/workflow/InputSection';
import ProteinPrepSection from '../components/workflow/ProteinPrepSection';
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

function Dock() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialMode = searchParams.get('mode') === 'active' ? 'manual' : 'auto';
    const [dockingMode, setDockingMode] = useState(initialMode);

    const workflow = useDockingWorkflow({ isBlind: dockingMode === 'auto' });

    const [gridCenter, setGridCenter] = useState({ x: 0, y: 0, z: 0 });
    const [gridSize, setGridSize] = useState({ x: 20, y: 20, z: 20 });
    const [autoDetectDone, setAutoDetectDone] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [emailConfirmed, setEmailConfirmed] = useState(false);
    const [queueStatus, setQueueStatus] = useState(null);
    const [stepIndex, setStepIndex] = useState(0);

    // Poll queue status every 10s so the ETA label stays fresh
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

    // Protein done = can proceed to Step 2 (prepare)
    // Ligand done = required to actually run docking (Step 3)
    const proteinDone = Boolean(workflow.uploadProgress?.protein);
    const ligandDone  = Boolean(workflow.uploadProgress?.ligand);
    const inputDone   = proteinDone && ligandDone;
    const configureDone = dockingMode === 'auto' ? true : autoDetectDone;

    const completed = useMemo(() => ({
        input: inputDone,
        prepare: workflow.proteinPrepared,
        configure: workflow.proteinPrepared && configureDone,
    }), [inputDone, workflow.proteinPrepared, configureDone]);

    // Clear error and dismiss toasts when step changes or page unmounts
    React.useEffect(() => {
        workflow.setError(null);
        toast.dismiss();
    }, [stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        return () => {
            toast.dismiss();
        };
    }, []);

    // Auto-advance stepper as gates open
    React.useEffect(() => {
        if (inputDone && stepIndex < 1) setStepIndex(1);
    }, [inputDone]); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        if (workflow.proteinPrepared && stepIndex < 2) setStepIndex(2);
    }, [workflow.proteinPrepared]); // eslint-disable-line react-hooks/exhaustive-deps

    const [targetProgress, setTargetProgress] = useState(0);
    const [progressDuration, setProgressDuration] = useState(1000);
    const [dockProgress, setDockProgress] = useState(0);

    const isRunning = workflow.loading && /Detecting|docking|Running|Calculating|Sampling/i.test(workflow.loadingMessage);

    // Time-proportional smooth progress increment engine
    useEffect(() => {
        if (!isRunning) {
            if (dockProgress !== 0 && !workflow.loading) {
                setDockProgress(0);
                setTargetProgress(0);
            }
            return;
        }

        const distance = Math.max(1, targetProgress - dockProgress);
        const tickInterval = Math.max(40, Math.round(progressDuration / distance));

        const timer = setInterval(() => {
            setDockProgress((prev) => {
                if (prev < targetProgress) {
                    return prev + 1;
                } else if (prev < 95 && isRunning) {
                    return prev + 1;
                }
                return prev;
            });
        }, tickInterval);

        return () => clearInterval(timer);
    }, [targetProgress, progressDuration, isRunning, workflow.loading, dockProgress]);

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

    const handleRunDocking = async () => {
        workflow.setLoading(true);
        setDockProgress(1);
        try {
            let dockingData = {};
            if (dockingMode === 'auto') {
                workflow.setLoadingMessage('Detecting binding sites (surface cavities & pocket mapping)...');
                setTargetProgress(20);
                setProgressDuration(22000);

                const response = await api.detectCavities(workflow.sessionId);
                const cavities = response.cavities || [];
                if (cavities.length === 0) throw new Error('No cavities detected on the protein surface');
                dockingData.cavity_indices = cavities.map(c => c.cavity_id);

                workflow.setLoadingMessage(`Running docking on ${cavities.length} detected cavities...`);
            } else {
                workflow.setLoadingMessage('Calculating grid parameters & cavity bounds...');
                setTargetProgress(20);
                setProgressDuration(5000);

                await api.calculateGrid(workflow.sessionId, {
                    mode: 'manual',
                    center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z,
                    size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z,
                });
                workflow.setLoadingMessage('Running docking on target cavity...');
                dockingData = { center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z, size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z };
            }

            setTargetProgress(95);
            setProgressDuration(35000);

            if (notifyEmail.trim()) {
                dockingData.notify_email = notifyEmail.trim();
            }

            await api.runDocking(workflow.sessionId, dockingData);

            setTargetProgress(100);
            setProgressDuration(400);
            await new Promise(r => setTimeout(r, 450));

            notifyJobCompletion({
                title: 'SaliDock: Molecular Docking Complete! 🎉',
                body: 'Your receptor-ligand docking simulation and CNN rescoring have completed.',
                url: `/results?session=${workflow.sessionId}`,
            });

            navigate(`/results?session=${workflow.sessionId}`);
        } catch (err) {
            workflow.setError(err.message || 'Failed to run docking');
            toast.error(err.message || 'Docking failed');
            setTargetProgress(0);
            setDockProgress(0);
        } finally {
            workflow.setLoading(false);
            workflow.setLoadingMessage('');
        }
    };

    const inputClass = "w-full h-10 px-3.5 rounded-xl bg-card/60 backdrop-blur-md border border-border/80 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all duration-150";

    return (
        <div className="min-h-screen bg-background flex flex-col selection:bg-primary/20 selection:text-primary">
            <WorkflowHeader
                title="Molecular Docking"
                subtitle="Complete computational pipeline from macromolecular receptor input to 3D binding complex predictions."
            />

            <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-16">
                <Stepper steps={STEPS} currentIndex={stepIndex} completed={completed} onStepClick={setStepIndex} />

                <StatusBanners
                    error={workflow.error}
                    setError={workflow.setError}
                    loading={workflow.loading && !isRunning}
                    loadingMessage={workflow.loadingMessage}
                />

                {/* Step 1: Input */}
                {stepIndex === 0 && (
                    <div className="animate-fade-in-up">
                        <InputSection {...workflow} />
                    </div>
                )}

                {/* Step 2: Prepare */}
                {stepIndex === 1 && (
                    <div className="animate-fade-in-up space-y-6">
                        <ProteinPrepSection
                            showProteinPrep={workflow.showProteinPrep}
                            chains={workflow.chains}
                            selectedChains={workflow.selectedChains}
                            setSelectedChains={workflow.setSelectedChains}
                            heteroatoms={workflow.heteroatoms}
                            selectedHeteroatoms={workflow.selectedHeteroatoms}
                            setSelectedHeteroatoms={workflow.setSelectedHeteroatoms}
                            handleProteinPreparation={workflow.handleProteinPreparation}
                            loading={workflow.loading}
                            loadingMessage={workflow.loadingMessage}
                            proteinPrepared={workflow.proteinPrepared}
                            isBlind={dockingMode === 'auto'}
                        />
                    </div>
                )}

                {/* Step 3: Configure */}
                {stepIndex === 2 && (
                    <div className="animate-fade-in-up space-y-6">
                        <section className="rounded-3xl bg-card/75 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge">
                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/60">
                                <div className="flex items-center gap-3.5">
                                    <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                                        <Grid3x3 size={20} aria-hidden="true" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">Active Site & Docking Targeting</h2>
                                        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Choose between automated multi-cavity consensus targeting or a custom 3D grid search box.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
                                {[
                                    { key: 'auto', icon: Wand2, label: 'Auto-Blind Docking', desc: 'Weighted wRRF consensus detects the top binding cavities across the surface and docks simultaneously.' },
                                    { key: 'manual', icon: Target, label: 'Active-Site Docking', desc: 'Specify custom [X, Y, Z] grid center and search volume dimensions for targeted active-site docking.' },
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

                            {dockingMode === 'auto' && (
                                <div className="p-5 rounded-2xl border border-border/70 bg-card/30 backdrop-blur-md space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={16} className="text-primary" />
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Automated Consensus Pipeline</h4>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        When you initiate docking, the receptor structure will be evaluated by three orthogonal binding site algorithms (<span className="text-foreground font-semibold">fpocket, P2Rank, PUResNet</span>). Weighted Reciprocal Rank Fusion ranks the pockets, and all identified cavities are simultaneously docked and scored with the 3D CNN.
                                    </p>
                                </div>
                            )}

                            {dockingMode === 'manual' && (
                                <div className="space-y-4">
                                    <div className="p-5 rounded-2xl border border-border/70 bg-card/30 backdrop-blur-md">
                                        <div className="flex items-center justify-between mb-3.5">
                                            <label className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Grid Center Coordinates (Å)</label>
                                            <button
                                                onClick={handleAutoDetectCenter}
                                                disabled={workflow.loading || !workflow.uploadProgress.protein}
                                                className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all disabled:opacity-50"
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

                                    {workflow.uploadProgress.protein && autoDetectDone && (
                                        <div className="mt-6 border-t border-border/60 pt-6">
                                            <div className="flex items-center justify-between mb-3.5">
                                                <h4 className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">3D Active Site & Search Box Preview</h4>
                                                <span className="font-mono-code text-[11px] text-muted-foreground">
                                                    {gridSize.x} × {gridSize.y} × {gridSize.z} Å
                                                </span>
                                            </div>
                                            <div className="rounded-2xl overflow-hidden border border-border/70 shadow-elevated">
                                                <GridBoxViewer sessionId={workflow.sessionId} gridCenter={gridCenter} gridSize={gridSize} />
                                            </div>
                                            <div className="mt-3 p-3 bg-card/40 border border-border/60 rounded-xl flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground font-medium">Search Box Axis Orientation:</span>
                                                <div className="flex items-center gap-4 text-xs font-mono-code">
                                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> X-axis</span>
                                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Y-axis</span>
                                                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Z-axis</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* Ambient Dynamic Island Execution HUD */}
                        {isRunning && (
                            <section className="rounded-3xl bg-card/85 backdrop-blur-2xl border border-white/[0.08] dark:border-white/[0.08] p-6 sm:p-8 shadow-elevated apple-specular-edge space-y-5">
                                <div className="flex items-center justify-between pb-4 border-b border-border/60">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                            <Activity size={20} className="animate-pulse" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-base text-foreground tracking-tight">Molecular Docking Execution</h3>
                                            <p className="text-xs text-muted-foreground">Simulating high-resolution conformers and atomic CNN scoring.</p>
                                        </div>
                                    </div>
                                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 animate-pulse">
                                        GPU Active
                                    </span>
                                </div>

                                <div className="flex flex-col md:flex-row items-center gap-6">
                                    <AnimatedCircularProgressBar
                                        value={dockProgress}
                                        label="Docking"
                                        size={95}
                                        strokeWidth={8}
                                        gaugePrimaryColor="hsl(var(--primary))"
                                        gaugeSecondaryColor="hsl(var(--border))"
                                    />

                                    <div className="flex-1 w-full space-y-3">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold uppercase tracking-wider text-muted-foreground">Simulation Engine Progress</span>
                                            <span className="font-mono-code font-bold text-primary">{dockProgress}% Completed</span>
                                        </div>

                                        <div className="w-full bg-border/60 rounded-full h-2.5 overflow-hidden">
                                            <div 
                                                className="bg-primary h-full rounded-full transition-all duration-300 ease-out apple-specular-edge shadow-xs"
                                                style={{ width: `${dockProgress}%` }}
                                            />
                                        </div>

                                        <div className="p-3 bg-muted/40 rounded-xl border border-border/60 flex items-center gap-2.5">
                                            <RefreshCw size={14} className="animate-spin text-primary shrink-0" />
                                            <p className="text-xs text-foreground font-medium truncate">
                                                {workflow.loadingMessage || 'Running docking workflow simulation...'}
                                            </p>
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
                                    jobType="single"
                                />
                            </section>
                        )}

                        {!isRunning && (
                            <NotifyMeCard
                                notifyEmail={notifyEmail}
                                setNotifyEmail={setNotifyEmail}
                                emailConfirmed={emailConfirmed}
                                setEmailConfirmed={setEmailConfirmed}
                                queueStatus={queueStatus}
                                isRunning={false}
                                jobType="single"
                            />
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
                                disabled={workflow.loading || isRunning}
                                className="px-5 py-2.5 rounded-full border border-border/80 bg-card/60 backdrop-blur-md text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-[0.97] font-semibold text-xs sm:text-sm transition-all duration-150 disabled:opacity-40"
                            >
                                Back
                            </button>
                        ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse ml-2" />
                        )}
                        <span className="text-muted-foreground font-medium hidden sm:inline">
                            {stepIndex === 0 && (inputDone ? 'Receptor and ligand ready' : 'Provide protein receptor and ligand molecule')}
                            {stepIndex === 1 && (workflow.proteinPrepared ? 'Preparation complete' : 'Prepare receptor structure')}
                            {stepIndex === 2 && (configureDone ? 'Active site configured' : 'Select docking targeting mode')}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {stepIndex < 2 ? (
                            <button
                                type="button"
                                onClick={() => setStepIndex(stepIndex + 1)}
                                disabled={(stepIndex === 0 && !inputDone) || (stepIndex === 1 && !workflow.proteinPrepared) || workflow.loading}
                                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out disabled:opacity-40 shadow-sm shadow-primary/20 apple-specular-edge inline-flex items-center gap-2"
                            >
                                <span>Continue</span>
                                <ArrowRight size={14} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleRunDocking}
                                disabled={!configureDone || workflow.loading || isRunning}
                                className="px-7 py-3 rounded-full bg-primary text-primary-foreground font-bold text-xs sm:text-sm hover:brightness-105 active:scale-[0.97] transition-all duration-150 ease-out disabled:opacity-40 inline-flex items-center gap-2 shadow-md shadow-primary/25 apple-specular-edge"
                            >
                                <Play size={15} fill="currentColor" aria-hidden="true" />
                                <span>{isRunning ? 'Running Simulation...' : 'Run Docking Simulation'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}

export default Dock;
