import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Eye } from 'lucide-react';
import { api } from '../services/api';
import MolecularViewer from '../components/MolecularViewer';
import Interaction2DViewer from '../components/Interaction2DViewer';
import Navbar from '../components/Navbar';
import ViewerToolbar from '../components/results/ViewerToolbar';
import ViewerToggles from '../components/results/ViewerToggles';
import PosesTable from '../components/results/PosesTable';

import ResultsSkeleton from '../components/results/ResultsSkeleton';

function Results() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session');

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingPose, setDownloadingPose] = useState(null);
  const [selectedPose, setSelectedPose] = useState(1);
  const [pdbData, setPdbData] = useState(null);
  const [loadingViewer, setLoadingViewer] = useState(false);
  const [viewMode, setViewMode] = useState('3d');
  const [selectedCavityFilter, setSelectedCavityFilter] = useState('all');


  // Viewer controls
  const [proteinRepr, setProteinRepr] = useState('cartoon');
  const [ligandRepr, setLigandRepr] = useState('ball-and-stick');
  const [colorScheme, setColorScheme] = useState('chain-id');
  const [showCavityResidues, setShowCavityResidues] = useState(true);
  const [showCavityLabels, setShowCavityLabels] = useState(true);
  const [showCavitySurface, setShowCavitySurface] = useState(false);
  const [showInteractions, setShowInteractions] = useState(true);

  const viewerRef = useRef(null);


  const isDemo = sessionId === 'demo';

  useEffect(() => {
    if (!sessionId) { setError('No session ID provided'); setLoading(false); return; }
    if (isDemo) {
      setResults({
        poses: [
          { mode: 1, affinity: -9.4, cavity_id: 0, cavity_center: [12.3, 8.7, -4.2] },
          { mode: 2, affinity: -8.9, cavity_id: 0, cavity_center: [12.3, 8.7, -4.2] },
          { mode: 3, affinity: -8.1, cavity_id: 1, cavity_center: [3.1, -2.4, 6.8] },
          { mode: 4, affinity: -7.6, cavity_id: 1, cavity_center: [3.1, -2.4, 6.8] },
          { mode: 5, affinity: -7.2, cavity_id: 2, cavity_center: [-5.4, 10.1, 2.3] },
          { mode: 6, affinity: -6.8, cavity_id: 2, cavity_center: [-5.4, 10.1, 2.3] },
        ],
      });
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const data = await api.getResults(sessionId);
        setResults(data);
      } catch (err) {
        console.error('Results fetch error:', err);
        setError('Failed to load results');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, isDemo]);

  const handleDownloadPose = async (poseNumber) => {
    setDownloadingPose(poseNumber);
    try {
      const blob = await api.downloadComplex(sessionId, poseNumber);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `complex_pose_${poseNumber}.pdb`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Pose download error:', err);
      setError('Failed to download pose');
    } finally {
      setDownloadingPose(null);
    }
  };


  const handleViewPose = useCallback(async (poseNumber) => {
    setLoadingViewer(true);
    setSelectedPose(poseNumber);
    
    // Automatically synchronize the cavity filter with the selected pose's cavity
    const targetPose = results?.poses?.[poseNumber - 1];
    if (targetPose && targetPose.cavity_id !== undefined) {
      setSelectedCavityFilter(targetPose.cavity_id.toString());
    }

    try {
      let text;
      if (isDemo) {
        const res = await fetch('https://files.rcsb.org/download/1STP.pdb');
        text = await res.text();
      } else {
        const blob = await api.downloadComplex(sessionId, poseNumber);
        text = await blob.text();
      }
      setPdbData(text);
      setProteinRepr('cartoon');
      setLigandRepr('ball-and-stick');
      setColorScheme('element-symbol');
    } catch (err) {
      console.error('Pose view error:', err);
      setError('Failed to view pose');
    } finally {
      setLoadingViewer(false);
    }
  }, [sessionId, isDemo]);

  useEffect(() => {
    if (results?.poses && results.poses.length > 0) handleViewPose(1);
  }, [results, handleViewPose]);


  if (loading) return <ResultsSkeleton />;

  if (error || !results) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive font-medium mb-4">{error || 'No results found'}</p>
          <button
            onClick={() => navigate('/dock')}
            className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-all"
          >
            Back to Docking
          </button>
        </div>
      </div>
    );
  }

  const allPoses = results?.poses || [];
  const uniqueCavityIds = Array.from(new Set(allPoses.map((p) => p.cavity_id).filter((id) => id !== undefined))).sort((a, b) => a - b);
  const filteredPoses = selectedCavityFilter === 'all'
    ? allPoses
    : allPoses.filter((p) => p.cavity_id?.toString() === selectedCavityFilter);

  const handleCavityFilterChange = (cavityId) => {
    setSelectedCavityFilter(cavityId);
    const firstPose = allPoses.find((p) =>
      cavityId === 'all' ? true : p.cavity_id?.toString() === cavityId.toString()
    );
    if (firstPose) {
      const index = allPoses.indexOf(firstPose) + 1;
      handleViewPose(index);
      if (cavityId !== 'all' && firstPose.cavity_center) {
        const [cx, cy, cz] = Array.isArray(firstPose.cavity_center)
          ? firstPose.cavity_center
          : [firstPose.cavity_center.x ?? 0, firstPose.cavity_center.y ?? 0, firstPose.cavity_center.z ?? 0];
        setTimeout(() => viewerRef.current?.focusOnPoint(cx, cy, cz, 14), 700);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pt-16">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <section className="bg-card rounded-2xl border border-border p-6 mb-6 shadow-elevated">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <div className="flex bg-muted rounded-lg p-1 border border-border">
              <button
                onClick={() => setViewMode('3d')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
                  viewMode === '3d' ? 'bg-card shadow-sm text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="w-4 h-4" /> 3D View
              </button>
              <button
                onClick={() => setViewMode('2d')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
                  viewMode === '2d' ? 'bg-card shadow-sm text-primary border border-primary/20' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                2D Interactions
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {uniqueCavityIds.length > 0 && (
                <div className="flex items-center gap-3 bg-muted p-1.5 rounded-lg border border-border">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-2">Filter Cavity:</span>
                  <select
                    value={selectedCavityFilter}
                    onChange={(e) => handleCavityFilterChange(e.target.value)}
                    className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  >
                    <option value="all">All Cavities</option>
                    {uniqueCavityIds.map((id) => (
                      <option key={id} value={id.toString()}>Cavity {id}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-3 bg-muted p-1.5 rounded-lg border border-border">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-2">Viewing Pose:</span>
                <select
                  value={selectedPose}
                  onChange={(e) => handleViewPose(parseInt(e.target.value))}
                  className="px-3 py-1.5 bg-card border border-border rounded-md text-sm font-medium text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  disabled={loadingViewer}
                >
                  {allPoses.map((pose, idx) => {
                    const globalIndex = idx + 1;
                    return (
                      <option key={globalIndex} value={globalIndex}>
                        Pose {globalIndex} - {pose.affinity?.toFixed(2) || 'N/A'} kcal/mol {pose.cavity_id !== undefined ? `(Cavity ${pose.cavity_id})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {viewMode === '3d' && (
            <>
              <ViewerToolbar
                proteinRepr={proteinRepr} setProteinRepr={setProteinRepr}
                ligandRepr={ligandRepr} setLigandRepr={setLigandRepr}
                colorScheme={colorScheme} setColorScheme={setColorScheme}
                loadingViewer={loadingViewer}
              />
              <ViewerToggles
                showPocketResidues={showCavityResidues} setShowPocketResidues={setShowCavityResidues}
                showPocketLabels={showCavityLabels} setShowPocketLabels={setShowCavityLabels}
                showPocketSurface={showCavitySurface} setShowPocketSurface={setShowCavitySurface}
                showInteractions={showInteractions} setShowInteractions={setShowInteractions}
              />

              <div className="relative rounded-xl overflow-hidden border border-border bg-background/30">
                {loadingViewer && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/75 backdrop-blur-sm rounded-xl">
                    <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                    <p className="font-medium text-foreground pb-2 px-4 rounded-md shadow-sm">Loading molecular structure...</p>
                  </div>
                )}
                {pdbData ? (
                  <MolecularViewer
                    ref={viewerRef}
                    pdbData={pdbData}
                    poseNumber={selectedPose}
                    sessionId={sessionId}
                    proteinRepr={proteinRepr}
                    ligandRepr={ligandRepr}
                    colorScheme={colorScheme}
                    showPocketResidues={showCavityResidues}
                    showPocketLabels={showCavityLabels}
                    showPocketSurface={showCavitySurface}
                    showInteractions={showInteractions}
                  />
                ) : (
                  <div className="w-full h-[600px] bg-muted/40 rounded-xl flex items-center justify-center border-2 border-dashed border-border">
                    {!loadingViewer && <p className="text-muted-foreground font-medium">No structure available</p>}
                  </div>
                )}
              </div>

              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 backdrop-blur-sm mt-4">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  Viewer Controls
                </h3>
                <ul className="text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
                  <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-card border border-border rounded text-[10px] font-mono-code">Left Click</span> rotate</li>
                  <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-card border border-border rounded text-[10px] font-mono-code">Right Click</span> pan</li>
                  <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-card border border-border rounded text-[10px] font-mono-code">Scroll</span> zoom</li>
                </ul>
              </div>
            </>
          )}

          {viewMode === '2d' && (
            <div className="rounded-xl overflow-hidden border border-border bg-white" style={{ minHeight: '600px' }}>
              <Interaction2DViewer sessionId={sessionId} poseNumber={selectedPose} totalPoses={allPoses.length || 9} />
            </div>
          )}
        </section>

        <PosesTable
          allPoses={allPoses}
          filteredPoses={filteredPoses}
          selectedPose={selectedPose}
          loadingViewer={loadingViewer}
          downloadingPose={downloadingPose}
          onViewPose={handleViewPose}
          onDownloadPose={handleDownloadPose}
          onCavityClick={handleCavityFilterChange}
        />


      </div>
    </div>
  );
}

export default Results;
