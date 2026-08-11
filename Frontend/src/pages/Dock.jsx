import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Grid3x3, Play, Wand2, Target, ArrowRight } from 'lucide-react';
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
    const [queueCount, setQueueCount] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);

    React.useEffect(() => {
        api.getQueueCount()
            .then(res => setQueueCount(res.queue_count || 0))
            .catch(() => {});
    }, []);

    // Protein done = can proceed to Step 2 (prepare)
    // Ligand done = required to actually run docking (Step 3)
    const proteinDone = !!workflow.uploadProgress?.protein;
    const ligandDone  = !!workflow.uploadProgress?.ligand;
    const inputDone   = proteinDone && ligandDone;  // both needed for docking
    const configureDone = dockingMode === 'auto' ? true : autoDetectDone;

    const completed = useMemo(() => ({
        input: inputDone,
        prepare: workflow.proteinPrepared,
        configure: workflow.proteinPrepared && configureDone,
    }), [inputDone, workflow.proteinPrepared, configureDone]);

    // Auto-advance stepper as gates open (but don't rewind if user manually navigated)
    // Only auto-jump when BOTH protein AND ligand are ready — don't jump on protein alone
    React.useEffect(() => {
        if (inputDone && stepIndex < 1) setStepIndex(1);
    }, [inputDone]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => {
        if (workflow.proteinPrepared && stepIndex < 2) setStepIndex(2);
    }, [workflow.proteinPrepared]); // eslint-disable-line react-hooks/exhaustive-deps

    const [targetProgress, setTargetProgress] = useState(0);
    const [progressDuration, setProgressDuration] = useState(1000);
    const [dockProgress, setDockProgress] = useState(0);

    const isRunning = workflow.loading && /Detecting|docking|Running/i.test(workflow.loadingMessage);

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
                    // Creep up slowly while waiting for backend execution
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
                // Phase 1: Cavity Detection slowly goes 1% -> 20% over 22s (15-30s window)
                setTargetProgress(20);
                setProgressDuration(22000);

                const response = await api.detectCavities(workflow.sessionId);
                const cavities = response.cavities || [];
                if (cavities.length === 0) throw new Error('No cavities detected on the protein surface');
                dockingData.cavity_indices = cavities.map(c => c.cavity_id);

                workflow.setLoadingMessage(`Running docking on ${cavities.length} detected cavities...`);
            } else {
                workflow.setLoadingMessage('Calculating grid parameters & cavity bounds...');
                // Manual mode grid calc 1% -> 20% over 5s
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

            // Phase 2: Docking Simulation slowly goes 20% -> 95% over 35s (proportional to cavity volume & CNN scoring)
            setTargetProgress(95);
            setProgressDuration(35000);

            if (notifyEmail.trim()) {
                dockingData.notify_email = notifyEmail.trim();
            }

            await api.runDocking(workflow.sessionId, dockingData);

            // Phase 3: Complete 95% -> 100%
            setTargetProgress(100);
            setProgressDuration(400);
            await new Promise(r => setTimeout(r, 450));
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

    const inputClass = "w-full h-10 px-3 rounded-lg bg-card border border-border text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all";

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <WorkflowHeader
                title="Molecular Docking"
                subtitle="Complete pipeline from protein/ligand input to docked poses."
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
                        <div className="flex justify-end">
                            <button
                                onClick={() => setStepIndex(1)}
                                disabled={!proteinDone}
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
                        <div className="flex justify-between">
                            <button onClick={() => setStepIndex(0)} className="px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 font-semibold text-sm transition-all">Back</button>
                            <button
                                onClick={() => setStepIndex(2)}
                                disabled={!workflow.proteinPrepared}
                                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                Continue <ArrowRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Configure */}
                {stepIndex === 2 && (
                    <div className="animate-fade-in-up">
                        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Grid3x3 size={18} className="text-primary" aria-hidden="true" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Docking Mode</h2>
                                    <p className="text-sm text-muted-foreground">Choose between automatic cavity detection or a manual grid box</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                                {[
                                    { key: 'auto', icon: Wand2, label: 'Auto-Blind Docking', desc: 'wRRF consensus detects the top 5 cavities and docks into all of them.' },
                                    { key: 'manual', icon: Target, label: 'Active-Site Docking', desc: 'Specify a custom grid center and size for targeted docking.' },
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

                            {dockingMode === 'manual' && (
                                <div>
                                    <div className="mb-6">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Grid Center (Å)</label>
                                            <button
                                                onClick={handleAutoDetectCenter}
                                                disabled={workflow.loading || !workflow.uploadProgress.protein}
                                                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-50"
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

                                    <div className="mb-6">
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

                                    {workflow.uploadProgress.protein && autoDetectDone && (
                                        <div className="mb-2">
                                            <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">Grid Box Preview</h4>
                                            <GridBoxViewer sessionId={workflow.sessionId} gridCenter={gridCenter} gridSize={gridSize} />
                                            <div className="mt-3 p-3 bg-background border border-border rounded-xl">
                                                <p className="text-xs text-muted-foreground mb-2"><span className="font-semibold text-foreground">Legend:</span> Grid box edges colored by axis</p>
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                    {[
                                                        { dot: '#ef4444', label: 'X-axis' },
                                                        { dot: '#22c55e', label: 'Y-axis' },
                                                        { dot: '#3b82f6', label: 'Z-axis' },
                                                    ].map((c) => (
                                                        <div key={c.label} className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded" style={{ background: c.dot }} />
                                                            <span className="text-muted-foreground">{c.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {queueCount > 9 && (
                            <div className="border border-border bg-card/60 p-4 rounded-xl space-y-2">
                                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <span>📩 High Server Queue Detected ({queueCount} Jobs) — Get Email Notification On Completion</span>
                                    <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                                </label>
                                <input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={notifyEmail}
                                    onChange={(e) => setNotifyEmail(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/60"
                                    disabled={workflow.loading}
                                />
                                <p className="text-[11px] text-muted-foreground">Server queue is high. You can close this page; we'll email you a direct results link & summary once your run finishes.</p>
                            </div>
                        )}

                        <div className="flex justify-between">
                            <button onClick={() => setStepIndex(1)} className="px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 font-semibold text-sm transition-all" disabled={workflow.loading}>Back</button>
                            <button
                                onClick={handleRunDocking}
                                disabled={!configureDone || workflow.loading}
                                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-2"
                            >
                                {isRunning ? <AnimatedCircularProgressBar value={dockProgress} size={18} strokeWidth={3} className="my-0" /> : <Play size={16} aria-hidden="true" />}
                                {isRunning ? 'Running…' : 'Run Docking'}
                            </button>
                        </div>

                        {isRunning && (
                            <div className="mt-4 border border-border bg-card p-5 rounded-2xl flex items-center gap-6 shadow-elevated">
                                <AnimatedCircularProgressBar value={dockProgress} label="Docking" size={85} strokeWidth={7} />
                                <div className="flex-1 space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold uppercase tracking-wider text-muted-foreground">Docking Progress</span>
                                        <span className="font-mono-code font-bold text-primary">{dockProgress}%</span>
                                    </div>
                                    <div className="w-full bg-border/60 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${dockProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-muted-foreground">{workflow.loadingMessage || 'Running docking...'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}


            </div>

            <Footer />
        </div>
    );
}

export default Dock;
