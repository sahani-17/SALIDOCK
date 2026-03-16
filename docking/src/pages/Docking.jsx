import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, Play, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import GridBoxViewer from '../components/GridBoxViewer';
import { useDockingWorkflow } from '../hooks/useDockingWorkflow';
import WorkflowHeader from '../components/workflow/WorkflowHeader';
import StatusBanners from '../components/workflow/StatusBanners';
import InputSection from '../components/workflow/InputSection';
import ProteinPrepSection from '../components/workflow/ProteinPrepSection';
import Footer from '../components/Footer';

function Docking() {
  const navigate = useNavigate();
  const workflow = useDockingWorkflow();

  const [dockingMode, setDockingMode] = useState('auto');
  const [numCavities, setNumCavities] = useState(5);
  const [detectedCavities, setDetectedCavities] = useState([]);
  const [selectedCavities, setSelectedCavities] = useState([]);
  const [cavityDetectionComplete, setCavityDetectionComplete] = useState(false);

  const [gridCenter, setGridCenter] = useState({ x: 0, y: 0, z: 0 });
  const [gridSize, setGridSize] = useState({ x: 20, y: 20, z: 20 });
  const [autoDetectDone, setAutoDetectDone] = useState(false);

  const handleDetectCavities = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Detecting binding sites');
    setCavityDetectionComplete(false);
    try {
      const response = await api.detectCavities(workflow.sessionId, numCavities);
      setDetectedCavities(response.cavities || []);
      setSelectedCavities(response.cavities?.map(c => c.cavity_id) || []);
      setCavityDetectionComplete(true);
    } catch (err) {
      workflow.setError('Failed to detect cavities');
      setCavityDetectionComplete(false);
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  const handleAutoDetectCenter = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Calculating protein center...');
    try {
      const response = await api.getProteinCenter(workflow.sessionId);
      setGridCenter({ x: response.centerX, y: response.centerY, z: response.centerZ });
      setAutoDetectDone(true);
    } catch (err) {
      workflow.setError('Failed to auto-detect protein center: ' + (err.message || err));
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  const handleRunDocking = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Running docking simulation...');
    try {
      let dockingData = {};
      if (dockingMode === 'auto' && selectedCavities.length > 0) {
        dockingData.cavity_indices = selectedCavities;
      } else if (dockingMode === 'manual') {
        workflow.setLoadingMessage('Calculating grid parameters...');
        await api.calculateGrid(workflow.sessionId, {
          mode: 'manual',
          center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z,
          size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z
        });
        workflow.setLoadingMessage('Running docking simulation...');
        dockingData = {
          center_x: gridCenter.x, center_y: gridCenter.y, center_z: gridCenter.z,
          size_x: gridSize.x, size_y: gridSize.y, size_z: gridSize.z
        };
      }
      await api.runDocking(workflow.sessionId, dockingData);
      navigate(`/results?session=${workflow.sessionId}`);
    } catch (err) {
      workflow.setError('Failed to run docking');
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  const inputClass = "w-full h-10 px-3 rounded-lg bg-background border border-primary/15 text-foreground text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all";

  return (
    <div className="min-h-screen bg-background">
      <WorkflowHeader title="Molecular Docking Workflow" subtitle="Complete docking pipeline from upload to results" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StatusBanners error={workflow.error} setError={workflow.setError} loading={workflow.loading} loadingMessage={workflow.loadingMessage} />
        <InputSection {...workflow} />
        <ProteinPrepSection
          showProteinPrep={workflow.showProteinPrep}
          chains={workflow.chains} selectedChains={workflow.selectedChains} setSelectedChains={workflow.setSelectedChains}
          heteroatoms={workflow.heteroatoms} selectedHeteroatoms={workflow.selectedHeteroatoms} setSelectedHeteroatoms={workflow.setSelectedHeteroatoms}
          handleProteinPreparation={workflow.handleProteinPreparation}
          loading={workflow.loading} loadingMessage={workflow.loadingMessage} proteinPrepared={workflow.proteinPrepared}
        />

        {/* Docking Mode Selection */}
        <section className="rounded-2xl bg-card border border-primary/10 p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Grid3x3 size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Docking Mode</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Choose between automatic cavity detection or manual grid setup</p>

          {/* Mode tabs */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { key: 'auto', label: 'Auto-Blind Docking', desc: 'Automatically detect and dock to binding sites' },
              { key: 'manual', label: 'Manual Active-Site', desc: 'Specify custom grid center and size' },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setDockingMode(m.key)}
                className={`p-4 rounded-xl border-2 transition-all text-left ${dockingMode === m.key
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-primary/10 hover:border-primary/20'
                  }`}
              >
                <h3 className="font-bold text-foreground text-sm mb-0.5">{m.label}</h3>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </button>
            ))}
          </div>

          {/* Auto Cavity Mode */}
          {dockingMode === 'auto' && (
            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Cavity Detection</h3>
              <p className="text-xs text-muted-foreground mb-4">Identify and select binding sites for docking</p>

              <div className="mb-4">
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">Number of Cavities (max 10)</label>
                <input
                  type="number" min="1" max="10" value={numCavities}
                  onChange={(e) => setNumCavities(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-32 h-10 px-3 rounded-lg bg-background border border-primary/15 text-foreground text-sm focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                />
              </div>

              <button
                onClick={handleDetectCavities}
                disabled={workflow.loading || !workflow.uploadProgress.protein}
                className="px-5 py-2 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 mb-4"
              >
                {workflow.loading && workflow.loadingMessage.includes('Detecting') ? (
                  <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Detecting...</span>
                ) : 'Detect Binding Sites'}
              </button>

              {workflow.loading && workflow.loadingMessage.includes('Detecting') && (
                <div className="mb-4">
                  <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Analyzing protein structure for binding pockets...</p>
                </div>
              )}

              {detectedCavities.length > 0 && (
                <div className="mt-6 p-4 bg-primary/5 border border-primary/10 rounded-xl">
                  <h4 className="font-bold text-foreground mb-3 text-sm">Detected Cavities</h4>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {detectedCavities.map((cavity) => (
                      <label key={cavity.cavity_id} className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${selectedCavities.includes(cavity.cavity_id) ? 'border-primary/40 bg-primary/10' : 'border-primary/10 hover:border-primary/20'
                        }`}>
                        <input
                          type="checkbox"
                          checked={selectedCavities.includes(cavity.cavity_id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedCavities([...selectedCavities, cavity.cavity_id]);
                            else setSelectedCavities(selectedCavities.filter(c => c !== cavity.cavity_id));
                          }}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium text-foreground">Cavity {cavity.cavity_id}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {cavity.consensus_score !== undefined ? `Consensus: ${cavity.consensus_score.toFixed(2)}` :
                            cavity.rank !== undefined ? `Rank: ${cavity.rank}` :
                              cavity.volume !== undefined ? `Vol: ${cavity.volume.toFixed(0)} Å³` : 'N/A'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Continue with <span className="font-semibold text-primary">{selectedCavities.length}</span> selected cavities
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Manual Mode */}
          {dockingMode === 'manual' && (
            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Grid Configuration</h3>

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
            </div>
          )}

          {/* Run Docking */}
          <button
            onClick={handleRunDocking}
            disabled={workflow.loading || !workflow.uploadProgress.protein || !workflow.uploadProgress.ligand || (dockingMode === 'auto' && !cavityDetectionComplete)}
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

          {dockingMode === 'auto' && !cavityDetectionComplete && (
            <p className="text-sm text-warning mt-2">Please detect binding sites before running docking simulation</p>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
}

export default Docking;
