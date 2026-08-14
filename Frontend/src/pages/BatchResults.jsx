import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Eye, Download, Search, Info, BarChart2, CheckCircle2, AlertTriangle, FileText, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, API_BASE_URL } from '../services/api';
import MolecularViewer from '../components/MolecularViewer';
import ViewerToggles from '../components/results/ViewerToggles';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { AnimatedCircularProgressBar } from '../components/ui/animated-circular-progress-bar';

function BatchResults() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session');

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    return () => {
      toast.dismiss();
    };
  }, []);

  // Selection states
  const [selectedLigandIdx, setSelectedLigandIdx] = useState(0);
  const [selectedPose, setSelectedPose] = useState(1);
  
  // Viewer states
  const [pdbData, setPdbData] = useState(null);
  const [loadingViewer, setLoadingViewer] = useState(false);
  const [viewMode, setViewMode] = useState('3d'); // 3d or 2d
  const [svgContent, setSvgContent] = useState("");
  const [loadingSvg, setLoadingSvg] = useState(false);
  const [showProtein, setShowProtein] = useState(true);
  const [showPocketResidues, setShowPocketResidues] = useState(false);
  const [showPocketLabels, setShowPocketLabels] = useState(false);
  const [showPocketSurface, setShowPocketSurface] = useState(true);
  const [showInteractions, setShowInteractions] = useState(false);

  // Search and sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('affinity'); // affinity, mw, name, efficiency
  const [sortOrder, setSortOrder] = useState('asc'); // asc or desc

  // Tooltip for scatter plot
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const viewerRef = useRef(null);

  // Load report on mount
  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }
    
    const fetchResults = async () => {
      try {
        setLoading(true);
        const data = await api.getBatchResults(sessionId);
        setReport(data);
        
        // Find top binder (lowest affinity) among completed runs to visualize exclusively
        const sortedCompleted = (data.results || [])
          .filter(r => r.status === 'completed')
          .sort((a, b) => a.affinity - b.affinity);
        if (sortedCompleted.length > 0) {
          setSelectedLigandIdx(sortedCompleted[0].index);
        }
      } catch (err) {
        console.error('Failed to load batch results:', err);
        setError('Batch docking results not found. Make sure calculations finished successfully.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchResults();
  }, [sessionId]);

  // Load 3D structure for top binder pose
  useEffect(() => {
    if (!sessionId || selectedLigandIdx === null || selectedLigandIdx === undefined) return;
    
    const fetchStructure = async () => {
      setLoadingViewer(true);
      try {
        const blob = await api.downloadBatchComplex(sessionId, selectedLigandIdx, selectedPose);
        const text = await blob.text();
        setPdbData(text);
      } catch (err) {
        console.error('Failed to load 3D complex:', err);
      } finally {
        setLoadingViewer(false);
      }
    };

    fetchStructure();
  }, [sessionId, selectedLigandIdx, selectedPose]);

  // Helper properties of selected top binder
  const selectedLigand = useMemo(() => {
    if (!report || !report.results) return null;
    return report.results.find(r => r.index === selectedLigandIdx);
  }, [report, selectedLigandIdx]);

  // Sort and filter results
  const filteredResults = useMemo(() => {
    if (!report || !report.results) return [];
    
    let res = [...report.results];
    
    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      res = res.filter(r => r.name.toLowerCase().includes(term));
    }
    
    // Sort
    res.sort((a, b) => {
      // Put failed runs at the bottom
      if (a.status !== 'completed' && b.status === 'completed') return 1;
      if (a.status === 'completed' && b.status !== 'completed') return -1;
      if (a.status !== 'completed' && b.status !== 'completed') return 0;

      let valA, valB;
      if (sortBy === 'affinity') {
        valA = a.affinity;
        valB = b.affinity;
      } else if (sortBy === 'mw') {
        valA = a.properties?.mw || 0;
        valB = b.properties?.mw || 0;
      } else if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'efficiency') {
        valA = a.ligand_efficiency || 0;
        valB = b.ligand_efficiency || 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return res;
  }, [report, searchTerm, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleDownloadPose = async () => {
    if (selectedLigandIdx === null) return;
    try {
      const blob = await api.downloadBatchComplex(sessionId, selectedLigandIdx, selectedPose);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `top_binder_${selectedLigand?.name || 'complex'}_pose_1.pdb`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download top binder complex:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-6">
        <AnimatedCircularProgressBar label="Loading" size={80} strokeWidth={6} />
        <p className="mt-4 text-sm font-semibold text-muted-foreground animate-pulse">Loading batch screening dashboard...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-20 flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-2xl bg-destructive/10 text-destructive mb-4">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">Failed to Load Batch Results</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">{error || 'Unable to retrieve batch docking output.'}</p>
          <button
            onClick={() => navigate('/batch-dock')}
            className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-xs hover:brightness-110 transition-all"
          >
            Return to Batch Docking
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const summary = report.summary || {};

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border p-6 rounded-2xl shadow-elevated">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Batch Docking Dashboard</h1>
            <p className="text-sm text-muted-foreground">Comparative virtual screening results for target protein.</p>
          </div>
          <a
            href={api.downloadBatchZipUrl(sessionId)}
            download
            className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all inline-flex items-center gap-1.5 shadow-glow"
          >
            <Download size={15} /> Download All Results (ZIP)
          </a>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Library', value: `${summary.total_ligands} ligands`, color: 'bg-primary/10 border-primary/20 text-primary' },
            { label: 'Success Runs', value: `${summary.docked_successfully} docked`, color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' },
            { label: 'Best Binding Affinity', value: summary.best_affinity !== null ? `${summary.best_affinity.toFixed(2)} kcal/mol` : 'N/A', color: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500' },
            { label: 'Top Binder Compound', value: summary.best_binder || '—', color: 'bg-amber-500/10 border-amber-500/20 text-amber-500', truncate: true },
          ].map((c, i) => (
            <div key={i} className={`p-4 rounded-2xl border bg-card ${c.color} flex flex-col justify-center`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{c.label}</span>
              <span className={`text-base sm:text-lg font-bold text-foreground ${c.truncate ? 'truncate' : ''}`}>{c.value}</span>
            </div>
          ))}
        </div>

        {/* Top Grid: Table (col-span-2) and Properties Card (col-span-1) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Compounds Comparison Library Table */}
          <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-5 shadow-elevated flex flex-col h-[380px]">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                <FileText size={16} className="text-primary" /> Compounds Comparison Library
              </h2>
              <div className="relative w-full sm:w-60">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search ligands..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-background border border-border text-foreground text-xs focus:border-primary outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-border rounded-xl bg-background">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr className="text-muted-foreground uppercase font-semibold tracking-wider bg-card">
                    <th className="p-3">Rank</th>
                    <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('name')}>Name {sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                    <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('mw')}>MW (Da) {sortBy === 'mw' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                    <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('affinity')}>Affinity {sortBy === 'affinity' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                    <th className="p-3 cursor-pointer select-none hover:text-foreground" onClick={() => handleSort('efficiency')}>Ligand Eff. {sortBy === 'efficiency' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</th>
                    <th className="p-3">Engine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredResults.map((res, i) => {
                    const isTopBinder = res.index === selectedLigandIdx;
                    return (
                      <tr 
                        key={res.index}
                        className={`transition-colors ${res.status !== 'completed' ? 'opacity-60 bg-muted/10' : ''} ${isTopBinder ? 'bg-primary/10 font-bold' : ''}`}
                      >
                        <td className="p-3 font-semibold text-foreground flex items-center gap-1.5">
                          {res.status === 'completed' ? `${i+1}` : '—'}
                          {isTopBinder && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-500/20 text-amber-500 border border-amber-500/30">
                              Top Binder
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-semibold text-foreground truncate max-w-40">{res.name}</td>
                        <td className="p-3 font-mono-code text-muted-foreground">{res.properties?.mw?.toFixed(1) || 'N/A'}</td>
                        <td className="p-3 font-mono-code font-bold">
                          {res.status === 'completed' ? `${res.affinity.toFixed(2)}` : 'FAIL'}
                        </td>
                        <td className="p-3 font-mono-code text-muted-foreground">{res.status === 'completed' ? `${res.ligand_efficiency?.toFixed(3) || '—'}` : '—'}</td>
                        <td className="p-3 uppercase text-[10px] text-muted-foreground">{res.engine || '—'}</td>
                      </tr>
                    );
                  })}
                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center p-6 text-muted-foreground italic">No matching compounds found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* About Compound Details Panel */}
          {selectedLigand && selectedLigand.status === 'completed' && (
            <div className="lg:col-span-1 bg-card border border-border p-5 rounded-2xl shadow-elevated flex flex-col h-[380px]">
              <div className="flex justify-between items-center pb-3 border-b border-border mb-3">
                <div className="truncate">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-amber-500 block">Top Ranked Binder</span>
                  <h3 className="font-bold text-foreground truncate">{selectedLigand.name}</h3>
                </div>
                <button
                  onClick={handleDownloadPose}
                  className="p-2 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary shrink-0"
                  title="Download Top Binder Complex PDB"
                >
                  <Download size={14} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                {[
                  { label: 'Chemical Formula', value: selectedLigand.properties?.formula || 'N/A' },
                  { label: 'Molecular Weight', value: selectedLigand.properties?.mw ? `${selectedLigand.properties.mw.toFixed(2)} Da` : 'N/A' },
                  { label: 'H-Bond Donors', value: selectedLigand.properties?.hbd ?? 'N/A' },
                  { label: 'H-Bond Acceptors', value: selectedLigand.properties?.hba ?? 'N/A' },
                  { label: 'LogP value', value: selectedLigand.properties?.logp !== undefined ? selectedLigand.properties.logp.toFixed(2) : 'N/A' },
                  { label: 'Rotatable Bonds', value: selectedLigand.properties?.rotatable_bonds ?? 'N/A' },
                  { label: 'Vina Affinity', value: `${selectedLigand.affinity} kcal/mol` },
                  { label: 'CNN Affinity (Gnina)', value: selectedLigand.cnn_affinity ? `${selectedLigand.cnn_affinity.toFixed(2)} kcal/mol` : 'N/A' },
                ].map((p, i) => (
                  <div key={i} className="bg-background/40 border border-border/50 p-2.5 rounded-xl">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">{p.label}</p>
                    <p className="font-semibold text-foreground font-mono-code truncate">{p.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section: 3D Visualizer (Top Binder Exclusively) */}
        {selectedLigand && selectedLigand.status === 'completed' && (
          <section className="rounded-2xl bg-card border border-border p-5 shadow-elevated flex flex-col">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Top Binder 3D Visualization: <span className="text-primary">{selectedLigand.name}</span> ({selectedLigand.affinity.toFixed(2)} kcal/mol)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Displaying 3D complex of the top ranked binder. Download full ZIP archive to access all compound structures.
                </p>
              </div>
            </div>

            <ViewerToggles
              showProtein={showProtein} setShowProtein={setShowProtein}
              showPocketResidues={showPocketResidues} setShowPocketResidues={setShowPocketResidues}
              showPocketLabels={showPocketLabels} setShowPocketLabels={setShowPocketLabels}
              showPocketSurface={showPocketSurface} setShowPocketSurface={setShowPocketSurface}
              showInteractions={showInteractions} setShowInteractions={setShowInteractions}
            />

            <div className="flex-1 bg-background/50 border border-border rounded-2xl relative overflow-hidden h-[600px]">
              {pdbData ? (
                <MolecularViewer
                  ref={viewerRef}
                  pdbData={pdbData}
                  poseNumber={selectedPose}
                  showProtein={showProtein}
                  showPocketSurface={showPocketSurface}
                  showPocketResidues={showPocketResidues}
                  showPocketLabels={showPocketLabels}
                  showInteractions={showInteractions}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <AnimatedCircularProgressBar label="Model" size={64} strokeWidth={5} />
                  <span className="text-xs font-semibold text-foreground">Loading top binder 3D model...</span>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default BatchResults;
