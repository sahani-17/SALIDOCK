import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import GridBoxViewer from '../components/GridBoxViewer';
import { useDockingWorkflow } from '../hooks/useDockingWorkflow';
import WorkflowHeader from '../components/workflow/WorkflowHeader';
import StatusBanners from '../components/workflow/StatusBanners';
import InputSection from '../components/workflow/InputSection';
import ProteinPrepSection from '../components/workflow/ProteinPrepSection';
import Footer from '../components/Footer';

function Active() {
  const navigate = useNavigate();
  const workflow = useDockingWorkflow();

  const [gridCenter, setGridCenter] = useState({ x: 0, y: 0, z: 0 });
  const [gridSize, setGridSize] = useState({ x: 20, y: 20, z: 20 });
  const [autoDetectDone, setAutoDetectDone] = useState(false);

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
      toast.error('Auto-detect failed');
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  const handleRunDocking = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Running docking simulation...');
    try {
      workflow.setLoadingMessage('Calculating grid parameters...');
      await api.calculateGrid(workflow.sessionId, {
        mode: 'manual',
        center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z,
        size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z
      });

      workflow.setLoadingMessage('Running docking simulation...');
      const dockingData = {
        center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z,
        size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z
      };
      await api.runDocking(workflow.sessionId, dockingData);
      toast.success('Docking complete! Viewing results...');
      navigate(`/results?session=${workflow.sessionId}`);
    } catch (_err) {
      workflow.setError('Failed to run docking');
      toast.error('Docking simulation failed');
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  const inputClass = "w-full h-10 px-3 rounded-lg bg-background border border-primary/15 text-foreground text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all";

  return (
    <div className="min-h-screen bg-background">
      <WorkflowHeader
        title="Active-Site Docking"
        subtitle="Specify custom grid center and size for targeted docking"
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StatusBanners error={workflow.error} setError={workflow.setError} loading={workflow.loading} loadingMessage={workflow.loadingMessage} />
        <InputSection {...workflow} />
        <ProteinPrepSection
          showProteinPrep={workflow.showProteinPrep}
          chains={workflow.chains} selectedChains={workflow.selectedChains} setSelectedChains={workflow.setSelectedChains}
          heteroatoms={workflow.heteroatoms} selectedHeteroatoms={workflow.selectedHeteroatoms} setSelectedHeteroatoms={workflow.setSelectedHeteroatoms}
          handleProteinPreparation={workflow.handleProteinPreparation}
          loading={workflow.loading} proteinPrepared={workflow.proteinPrepared}
        />

        {/* Grid Configuration */}
        <section className="rounded-2xl bg-card border border-primary/10 p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Grid3x3 size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Grid Configuration</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Define the docking grid box position and dimensions</p>

          {/* Grid Center */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Grid Center (Å)</label>
              <button
                onClick={handleAutoDetectCenter}
                disabled={workflow.loading || !workflow.uploadProgress.protein}
                className="px-4 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
              >
                Auto-Detect
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['x', 'y', 'z'].map((axis) => (
                <div key={axis}>
                  <label className="text-xs text-muted-foreground mb-1 block uppercase font-medium">{axis}</label>
                  <input
                    type="number" step="0.1" value={gridCenter[axis]}
                    onChange={(e) => { setGridCenter({ ...gridCenter, [axis]: parseFloat(e.target.value) || 0 }); setAutoDetectDone(true); }}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Grid Size */}
          <div className="mb-6">
            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">Grid Size (Å)</label>
            <div className="grid grid-cols-3 gap-3">
              {['x', 'y', 'z'].map((axis) => (
                <div key={axis}>
                  <label className="text-xs text-muted-foreground mb-1 block uppercase font-medium">{axis}</label>
                  <input
                    type="number" step="1" value={gridSize[axis]}
                    onChange={(e) => setGridSize({ ...gridSize, [axis]: parseInt(e.target.value) || 20 })}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Grid Box Visualization */}
          {workflow.uploadProgress.protein && autoDetectDone && (
            <div className="mb-6">
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Grid Box Preview</h4>
              <GridBoxViewer sessionId={workflow.sessionId} gridCenter={gridCenter} gridSize={gridSize} />
              <div className="mt-3 p-3 bg-primary/5 border border-primary/10 rounded-xl">
                <p className="text-xs text-muted-foreground mb-2"><span className="font-semibold text-foreground">Color Legend:</span> Grid box edges colored by dimension</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    { color: 'bg-red-500', label: 'X-axis (Red)' },
                    { color: 'bg-green-500', label: 'Y-axis (Green)' },
                    { color: 'bg-blue-500', label: 'Z-axis (Blue)' },
                  ].map((c) => (
                    <div key={c.label} className="flex items-center gap-2">
                      <div className={`w-3 h-3 ${c.color} rounded`} />
                      <span className="text-muted-foreground">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Run Docking */}
          <button
            onClick={handleRunDocking}
            disabled={workflow.loading || !workflow.uploadProgress.protein || !workflow.uploadProgress.ligand || !autoDetectDone}
            className="flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold text-base hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 glow-emerald"
          >
            {workflow.loading && workflow.loadingMessage.includes('docking') ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
            {workflow.loading && workflow.loadingMessage.includes('docking') ? 'Running...' : 'Run Docking Simulation'}
          </button>

          {workflow.loading && workflow.loadingMessage.includes('docking') && (
            <div className="mt-4">
              <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Running molecular docking simulation... This may take several minutes.</p>
            </div>
          )}

          {!autoDetectDone && (
            <p className="text-sm text-warning mt-2">Please configure grid center coordinates before running docking simulation</p>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
}

export default Active;
