import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid3x3, Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useDockingWorkflow } from '../hooks/useDockingWorkflow';
import WorkflowHeader from '../components/workflow/WorkflowHeader';
import StatusBanners from '../components/workflow/StatusBanners';
import InputSection from '../components/workflow/InputSection';
import ProteinPrepSection from '../components/workflow/ProteinPrepSection';
import Footer from '../components/Footer';

function Cavity() {
  const navigate = useNavigate();
  const workflow = useDockingWorkflow();

  const [numCavities, setNumCavities] = useState(5);
  const [detectedCavities, setDetectedCavities] = useState([]);
  const [selectedCavities, setSelectedCavities] = useState([]);
  const [cavityDetectionComplete, setCavityDetectionComplete] = useState(false);

  const handleDetectCavities = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Detecting binding sites');
    setCavityDetectionComplete(false);
    try {
      const response = await api.detectCavities(workflow.sessionId, numCavities);
      const cavities = response.cavities || [];
      setDetectedCavities(cavities);
      setSelectedCavities(cavities.map(c => c.cavity_id) || []);
      setCavityDetectionComplete(true);
      toast.success(`Found ${cavities.length} binding cavities`);
    } catch (_err) {
      workflow.setError('Failed to detect cavities');
      toast.error('Cavity detection failed');
      setCavityDetectionComplete(false);
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
      dockingData.cavity_indices = selectedCavities;
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

  return (
    <div className="min-h-screen bg-background">
      <WorkflowHeader
        title="Auto-Blind Docking"
        subtitle="Automatically detect and dock to binding sites"
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

        {/* Cavity Detection */}
        <section className="rounded-2xl bg-card border border-primary/10 p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Grid3x3 size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Cavity Detection</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Automatically detect and select binding sites for docking</p>

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

          {/* Run Docking */}
          <button
            onClick={handleRunDocking}
            disabled={workflow.loading || !workflow.uploadProgress.protein || !workflow.uploadProgress.ligand || !cavityDetectionComplete}
            className="mt-6 flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold text-base hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 glow-emerald"
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

          {!cavityDetectionComplete && (
            <p className="text-sm text-warning mt-2">Please detect binding sites before running docking simulation</p>
          )}
        </section>
      </div>
      <Footer />
    </div>
  );
}

export default Cavity;
