import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Loader2 } from 'lucide-react';
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
  const workflow = useDockingWorkflow({ isBlind: true });

  const handleBlindDocking = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Detecting binding sites (top 5 cavities)...');
    try {
      // 1. Detect binding sites (defaults to top 5)
      const response = await api.detectCavities(workflow.sessionId);
      const cavities = response.cavities || [];
      
      if (cavities.length === 0) {
        throw new Error('No cavities detected on the protein surface');
      }

      // 2. Map all detected cavities to their IDs
      const cavityIds = cavities.map(c => c.cavity_id);

      // 3. Immediately run docking on these cavities
      workflow.setLoadingMessage(`Running docking simulation on ${cavities.length} cavities...`);
      await api.runDocking(workflow.sessionId, { cavity_indices: cavityIds });
      
      toast.success('Docking complete! Viewing results...');
      navigate(`/results?session=${workflow.sessionId}`);
    } catch (err) {
      workflow.setError(err.message || 'Failed during blind docking workflow');
      toast.error(err.message || 'Blind docking failed');
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
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
          isBlind={true}
        />

        {/* Blind Docking */}
        <section className="rounded-2xl bg-white border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Play size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-900">Blind Docking</h2>
          </div>
          <p className="text-xs text-slate-600 mb-5">Automatically detect top 5 cavities and run docking simulation</p>

          <button
            onClick={handleBlindDocking}
            disabled={workflow.loading || !workflow.uploadProgress.protein || !workflow.uploadProgress.ligand || !workflow.proteinPrepared}
            className="flex items-center gap-2 px-7 py-3.5 rounded-full bg-blue-600 text-white font-bold text-base hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {workflow.loading && (workflow.loadingMessage.includes('Detecting') || workflow.loadingMessage.includes('docking')) ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Play size={18} />
            )}
            {workflow.loading && (workflow.loadingMessage.includes('Detecting') || workflow.loadingMessage.includes('docking')) ? 'Running...' : 'Blind Docking'}
          </button>

          {workflow.loading && (workflow.loadingMessage.includes('Detecting') || workflow.loadingMessage.includes('docking')) && (
            <div className="mt-4">
              <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-slate-600 mt-2">{workflow.loadingMessage || 'Processing blind docking...'}</p>
            </div>
          )}

          {!workflow.proteinPrepared && workflow.uploadProgress.protein && workflow.uploadProgress.ligand && (
            <p className="text-sm text-amber-600 mt-2">Please prepare the protein before running docking simulation</p>
          )}
        </section>
      </div>
      <Footer lightTheme />
    </div>
  );
}

export default Cavity;
