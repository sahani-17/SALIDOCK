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

function Active() {
  const navigate = useNavigate();
  const workflow = useDockingWorkflow();

  // Manual docking state (unique to Active page — manual mode only)
  const [gridCenter, setGridCenter] = useState({ x: 0, y: 0, z: 0 });
  const [gridSize, setGridSize] = useState({ x: 20, y: 20, z: 20 });
  const [autoDetectDone, setAutoDetectDone] = useState(false);

  // Auto-detect protein center
  const handleAutoDetectCenter = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Calculating protein center...');

    try {
      const response = await api.getProteinCenter(workflow.sessionId);
      setGridCenter({
        x: response.centerX,
        y: response.centerY,
        z: response.centerZ
      });
      setAutoDetectDone(true);
    } catch (err) {
      workflow.setError('Failed to auto-detect protein center: ' + (err.message || err));
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  // Run docking (manual mode only)
  const handleRunDocking = async () => {
    workflow.setLoading(true);
    workflow.setLoadingMessage('Running docking simulation...');

    try {
      let dockingData = {};

      workflow.setLoadingMessage('Calculating grid parameters...');
      await api.calculateGrid(workflow.sessionId, {
        mode: 'manual',
        center_x: gridCenter.x,
        center_y: gridCenter.y,
        center_z: gridCenter.z,
        size_x: gridSize.x,
        size_y: gridSize.y,
        size_z: gridSize.z
      });

      workflow.setLoadingMessage('Running docking simulation...');
      dockingData.center_x = gridCenter.x;
      dockingData.center_y = gridCenter.y;
      dockingData.center_z = gridCenter.z;
      dockingData.size_x = gridSize.x;
      dockingData.size_y = gridSize.y;
      dockingData.size_z = gridSize.z;

      await api.runDocking(workflow.sessionId, dockingData);
      navigate(`/results?session=${workflow.sessionId}`);
    } catch (_err) {
      workflow.setError('Failed to run docking');
    } finally {
      workflow.setLoading(false);
      workflow.setLoadingMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <WorkflowHeader
        title="Active-Site Docking"
        subtitle="Specify custom grid center and size for targeted docking"
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <StatusBanners
          error={workflow.error}
          setError={workflow.setError}
          loading={workflow.loading}
          loadingMessage={workflow.loadingMessage}
        />

        <InputSection {...workflow} />

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
          proteinPrepared={workflow.proteinPrepared}
        />

        {/* Manual Grid Configuration Section */}
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Grid3x3 className="w-6 h-6 text-gray-700" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Grid Configuration</h2>
              <p className="text-sm text-gray-600">Define the docking grid box position and dimensions</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Manual Grid Setup</h3>

            {/* Grid Center */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Grid Center Coordinates (Å)</label>
                <button
                  onClick={handleAutoDetectCenter}
                  disabled={workflow.loading || !workflow.uploadProgress.protein}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Auto-Detect
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">X</label>
                  <input
                    type="number"
                    step="0.1"
                    value={gridCenter.x}
                    onChange={(e) => {
                      setGridCenter({ ...gridCenter, x: parseFloat(e.target.value) || 0 });
                      setAutoDetectDone(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Y</label>
                  <input
                    type="number"
                    step="0.1"
                    value={gridCenter.y}
                    onChange={(e) => {
                      setGridCenter({ ...gridCenter, y: parseFloat(e.target.value) || 0 });
                      setAutoDetectDone(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Z</label>
                  <input
                    type="number"
                    step="0.1"
                    value={gridCenter.z}
                    onChange={(e) => {
                      setGridCenter({ ...gridCenter, z: parseFloat(e.target.value) || 0 });
                      setAutoDetectDone(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Grid Size */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Grid Size (Å)</label>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">X</label>
                  <input
                    type="number"
                    step="1"
                    value={gridSize.x}
                    onChange={(e) => setGridSize({ ...gridSize, x: parseInt(e.target.value) || 20 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Y</label>
                  <input
                    type="number"
                    step="1"
                    value={gridSize.y}
                    onChange={(e) => setGridSize({ ...gridSize, y: parseInt(e.target.value) || 20 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Z</label>
                  <input
                    type="number"
                    step="1"
                    value={gridSize.z}
                    onChange={(e) => setGridSize({ ...gridSize, z: parseInt(e.target.value) || 20 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Grid Box Visualization */}
            {workflow.uploadProgress.protein && autoDetectDone && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Grid Box Preview</h4>
                <GridBoxViewer
                  sessionId={workflow.sessionId}
                  gridCenter={gridCenter}
                  gridSize={gridSize}
                />
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold">Color Legend:</span> The grid box edges are colored to represent different dimensions:
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-600 rounded"></div>
                      <span className="text-gray-700">X-axis (Red)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-600 rounded"></div>
                      <span className="text-gray-700">Y-axis (Green)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-600 rounded"></div>
                      <span className="text-gray-700">Z-axis (Blue)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Run Docking Button */}
          <button
            onClick={handleRunDocking}
            disabled={workflow.loading || !workflow.uploadProgress.protein || !workflow.uploadProgress.ligand || !autoDetectDone}
            className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-lg font-semibold"
          >
            {workflow.loading && workflow.loadingMessage.includes('docking') ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            {workflow.loading && workflow.loadingMessage.includes('docking') ? 'Running...' : 'Run Docking Simulation'}
          </button>

          {workflow.loading && workflow.loadingMessage.includes('docking') && (
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div className="bg-green-600 h-2.5 rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
              <p className="text-xs text-gray-600 mt-2">Running molecular docking simulation... This may take several minutes.</p>
            </div>
          )}

          {!autoDetectDone && (
            <p className="text-sm text-amber-600 mt-2">Please configure grid center coordinates before running docking simulation</p>
          )}
        </section>
      </div>
    </div>
  );
}

export default Active;
