import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Grid3x3, Play, Loader2, Wand2, Target, ArrowRight } from 'lucide-react';
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

const STEPS = [
    { key: 'input', label: 'Input' },
    { key: 'prepare', label: 'Prepare' },
    { key: 'configure', label: 'Configure' },
    { key: 'run', label: 'Run' },
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
    const [stepIndex, setStepIndex] = useState(0);

    const inputDone = workflow.uploadProgress.protein && workflow.uploadProgress.ligand;
    const configureDone = dockingMode === 'auto' ? true : autoDetectDone;

    const completed = useMemo(() => ({
        input: inputDone,
        prepare: workflow.proteinPrepared,
        configure: workflow.proteinPrepared && configureDone,
    }), [inputDone, workflow.proteinPrepared, configureDone]);

    // Auto-advance stepper as gates open (but don't rewind if user manually navigated)
    React.useEffect(() => {
        if (inputDone && stepIndex < 1) setStepIndex(1);
    }, [inputDone]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => {
        if (workflow.proteinPrepared && stepIndex < 2) setStepIndex(2);
    }, [workflow.proteinPrepared]); // eslint-disable-line react-hooks/exhaustive-deps

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
        try {
            let dockingData = {};
            if (dockingMode === 'auto') {
                workflow.setLoadingMessage('Detecting binding sites (top 5 cavities)...');
                const response = await api.detectCavities(workflow.sessionId);
                const cavities = response.cavities || [];
                if (cavities.length === 0) throw new Error('No cavities detected on the protein surface');
                dockingData.cavity_indices = cavities.map(c => c.cavity_id);
                workflow.setLoadingMessage(`Running docking on ${cavities.length} cavities...`);
            } else {
                workflow.setLoadingMessage('Calculating grid parameters...');
                await api.calculateGrid(workflow.sessionId, {
                    mode: 'manual',
                    center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z,
                    size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z,
                });
                workflow.setLoadingMessage('Running docking simulation...');
                dockingData = { center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z, size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z };
            }
            await api.runDocking(workflow.sessionId, dockingData);
            navigate(`/results?session=${workflow.sessionId}`);
        } catch (err) {
            workflow.setError(err.message || 'Failed to run docking');
            toast.error(err.message || 'Docking failed');
        } finally {
            workflow.setLoading(false);
            workflow.setLoadingMessage('');
        }
    };

    const inputClass = "w-full h-10 px-3 rounded-lg bg-card border border-border text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/15 outline-none transition-all";
    const isRunning = workflow.loading && /Detecting|docking|Running/i.test(workflow.loadingMessage);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <WorkflowHeader
                eyebrow="Workflow"
                title="Molecular Docking"
                subtitle="Complete pipeline from protein/ligand input to docked poses."
            />

            <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-16">
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

                        <div className="flex justify-between">
                            <button onClick={() => setStepIndex(1)} className="px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 font-semibold text-sm transition-all">Back</button>
                            <button
                                onClick={() => setStepIndex(3)}
                                disabled={!configureDone}
                                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                Continue <ArrowRight size={16} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4: Run */}
                {stepIndex === 3 && (
                    <div className="animate-fade-in-up">
                        <section className="rounded-2xl bg-card border border-border p-6 mb-6 shadow-elevated">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Play size={18} className="text-primary" aria-hidden="true" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Run Docking</h2>
                                    <p className="text-sm text-muted-foreground">Review the configuration and launch the simulation</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
                                <div className="rounded-xl border border-border bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Mode</p>
                                    <p className="font-semibold text-foreground">{dockingMode === 'auto' ? 'Auto-Blind (wRRF top 5)' : 'Active-Site (manual grid)'}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Protein</p>
                                    <p className="font-mono-code text-xs text-foreground truncate">{workflow.savedProteinFilename || '—'}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Ligand</p>
                                    <p className="font-mono-code text-xs text-foreground truncate">{workflow.savedLigandFilename || '—'}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Session</p>
                                    <p className="font-mono-code text-xs text-foreground truncate">{workflow.sessionId || '—'}</p>
                                </div>
                            </div>

                            <button
                                onClick={handleRunDocking}
                                disabled={workflow.loading || !inputDone || !workflow.proteinPrepared || !configureDone}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold text-base hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 shadow-glow"
                            >
                                {isRunning ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                                {isRunning ? 'Running…' : dockingMode === 'auto' ? 'Run Blind Docking' : 'Run Active-Site Docking'}
                            </button>

                            {isRunning && (
                                <div className="mt-4">
                                    <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-primary h-1.5 rounded-full animate-pulse" style={{ width: '100%' }} />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">{workflow.loadingMessage || 'Running molecular docking simulation…'}</p>
                                </div>
                            )}
                        </section>

                        <div className="flex justify-start">
                            <button onClick={() => setStepIndex(2)} className="px-5 py-2.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 font-semibold text-sm transition-all">Back</button>
                        </div>
                    </div>
                )}
            </div>

            <Footer />
        </div>
    );
}

export default Dock;
