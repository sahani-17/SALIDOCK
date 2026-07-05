import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, Loader2, Eye, ChevronDown, Star, MessageSquareText, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, API_BASE_URL } from '../services/api';
import MolecularViewer from '../components/MolecularViewer';
import Interaction2DViewer from '../components/Interaction2DViewer';
import Navbar from '../components/Navbar';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// ─── Definitions ────────────────────────────────────────────────────
const PROTEIN_REPRESENTATIONS = [
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'ball-and-stick', label: 'Ball & Stick' },
  { value: 'spacefill', label: 'Spacefill' },
  { value: 'molecular-surface', label: 'Surface' },
  { value: 'gaussian-surface', label: 'Gaussian Surface' },
  { value: 'putty', label: 'Putty' },
];

const LIGAND_REPRESENTATIONS = [
  { value: 'ball-and-stick', label: 'Ball & Stick' },
  { value: 'spacefill', label: 'Spacefill' },
  { value: 'molecular-surface', label: 'Surface' },
];

const COLOR_SCHEMES = [
  { value: 'chain-id',            label: 'Chain (Default)' },
  { value: 'entity-id',           label: 'Entity' },
  { value: 'secondary-structure', label: 'Secondary Structure' },
  { value: 'element-symbol',      label: 'Element (CPK)' },
  { value: 'hydrophobicity',      label: 'Hydrophobicity' },
  { value: 'residue-name',        label: 'Residue Name' },
  { value: 'sequence-id',         label: 'Sequence ID' },
  { value: 'uniform',             label: 'Uniform Blue' },
];

// ─── Dropdown Component (lives entirely in Results, outside Mol*) ──
function ControlDropdown({ label, value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative min-w-[160px]">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 transition-all hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <span className="truncate text-slate-900">{selected?.label || value}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`block w-full px-3.5 py-2 text-left text-xs transition-colors ${
                opt.value === value
                  ? 'bg-blue-50 font-bold text-blue-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helper: find components by target ──────────────────────────────
function getComponents(plugin, target) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  const matches = [];
  for (const s of structures) {
    for (const comp of s.components) {
      const key = (comp.key || '').toLowerCase();
      const label = (comp.cell?.obj?.label || '').toLowerCase();
      if (target === 'protein') {
        if (key === 'polymer' || key === 'water' || key === 'non-standard' || label.includes('polymer') || label.includes('protein')) {
          matches.push(comp);
        }
      } else if (target === 'ligand') {
        if (key === 'ligand' || key === 'branched' || label.includes('ligand') || label.includes('het')) {
          matches.push(comp);
        }
      } else {
        matches.push(comp);
      }
    }
  }
  return matches;
}

// ─── Results Page ───────────────────────────────────────────────────
function Results() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session');
  const { user } = useAuth();

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingPose, setDownloadingPose] = useState(null);
  const [selectedPose, setSelectedPose] = useState(1);
  const [pdbData, setPdbData] = useState(null);
  const [loadingViewer, setLoadingViewer] = useState(false);
  const [viewMode, setViewMode] = useState('3d'); // '3d' or '2d'
  const [selectedCavityFilter, setSelectedCavityFilter] = useState('all');
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackChecked, setFeedbackChecked] = useState(false);

  // Viewer control state
  const [proteinRepr, setProteinRepr] = useState('cartoon');
  const [ligandRepr, setLigandRepr] = useState('ball-and-stick');
  const [colorScheme, setColorScheme] = useState('chain-id');
  const [showPocketResidues, setShowPocketResidues] = useState(true);
  const [showPocketLabels, setShowPocketLabels] = useState(true);
  const [showPocketSurface, setShowPocketSurface] = useState(false);
  const [showInteractions, setShowInteractions] = useState(true);
  const [spin, setSpin] = useState(false);
  const [showProtein, setShowProtein] = useState(true);

  const viewerRef = useRef(null);

  // ─── Fetch results ────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { setError('No session ID provided'); setLoading(false); return; }

    const fetchResults = async () => {
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
    };
    fetchResults();
  }, [sessionId]);

  // ─── Pose handling ────────────────────────────────────────────────
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

  const handleDownloadTop5 = async () => {
    if (!results?.poses) return;
    const top5 = results.poses.slice(0, 5);
    for (let i = 0; i < top5.length; i++) {
      await handleDownloadPose(i + 1);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  const handleViewPose = useCallback(async (poseNumber) => {
    setLoadingViewer(true);
    setSelectedPose(poseNumber);
    try {
      const blob = await api.downloadComplex(sessionId, poseNumber);
      const text = await blob.text();
      setPdbData(text);
      // Reset controls to defaults when switching poses
      setProteinRepr('cartoon');
      setLigandRepr('ball-and-stick');
      setColorScheme('element-symbol');
      setShowPocketResidues(true);
      setShowPocketLabels(true);
      setShowPocketSurface(false);
      setShowInteractions(true);
      setSpin(false);
    } catch (err) {
      console.error('View pose error:', err);
      setError('Failed to load structure for visualization');
    } finally {
      setLoadingViewer(false);
    }
  }, [sessionId]);



  // Auto-load best pose
  useEffect(() => {
    if (results?.poses && results.poses.length > 0) handleViewPose(1);
  }, [results, handleViewPose]);

  // Prefill if this user already submitted feedback for this result session
  useEffect(() => {
    const defaultName = user?.user_metadata?.username || user?.user_metadata?.full_name || '';
    setFeedbackName(defaultName);
  }, [user?.user_metadata?.username, user?.user_metadata?.full_name]);

  useEffect(() => {
    if (!sessionId) {
      setFeedbackChecked(true);
      return;
    }

    if (!user?.id) {
      setFeedbackChecked(true);
      return;
    }

    const fetchExistingFeedback = async () => {
      try {
        const { data, error } = await supabase
          .from('result_feedback')
          .select('rating, description, username')
          .eq('session_id', sessionId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return;
        if (data) {
          setFeedbackRating(data.rating || 0);
          setFeedbackDescription(data.description || '');
          setFeedbackName(data.username || user?.user_metadata?.username || user?.user_metadata?.full_name || '');
          setFeedbackSubmitted(true);
        }
      } catch {
        // no-op: feedback prefill is optional
      } finally {
        setFeedbackChecked(true);
      }
    };

    fetchExistingFeedback();
  }, [sessionId, user?.id]);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();

    if (!feedbackName.trim()) {
      toast.error('Please provide your name.');
      return;
    }

    if (!feedbackRating) {
      toast.error('Please provide a rating out of 5.');
      return;
    }

    if (!feedbackDescription.trim()) {
      toast.error('Please add your feedback description.');
      return;
    }

    if (!sessionId) {
      toast.error('Invalid session.');
      return;
    }

    setSubmittingFeedback(true);
    try {
      const { error } = await supabase.from('result_feedback').insert({
        session_id: sessionId,
        rating: feedbackRating,
        description: feedbackDescription.trim(),
        user_id: user?.id || null,
        username: feedbackName.trim(),
      });

      if (error) throw error;

      setFeedbackSubmitted(true);
      toast.success('Thanks! Your feedback was submitted.');
    } catch (err) {
      console.error('Feedback submit error:', err);
      toast.error(err?.message || 'Failed to submit feedback.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // ─── Render guards ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-4">{error || 'No results found'}</p>
          <button
            onClick={() => navigate('/docking')}
            className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all"
          >
            Back to Docking
          </button>
        </div>
      </div>
    );
  }

  const allPoses = results?.poses || [];

  const uniqueCavityIds = Array.from(
    new Set(allPoses.map((p) => p.cavity_id).filter((id) => id !== undefined))
  ).sort((a, b) => a - b);

  const filteredPoses = selectedCavityFilter === 'all'
    ? allPoses
    : allPoses.filter(pose => pose.cavity_id?.toString() === selectedCavityFilter);

  const handleCavityFilterChange = (cavityId) => {
    setSelectedCavityFilter(cavityId);

    // Find the first pose belonging to this cavity
    const firstPoseOfCavity = allPoses.find(pose =>
      cavityId === 'all' ? true : pose.cavity_id?.toString() === cavityId.toString()
    );

    if (firstPoseOfCavity) {
      const index = allPoses.indexOf(firstPoseOfCavity) + 1;
      handleViewPose(index);

      // Fly the Mol* camera to the cavity centre after the pose finishes loading.
      // cavity_center is an [x, y, z] array set by cavity_bridge on every pose.
      if (cavityId !== 'all' && firstPoseOfCavity.cavity_center) {
        const [cx, cy, cz] = Array.isArray(firstPoseOfCavity.cavity_center)
          ? firstPoseOfCavity.cavity_center
          : [
              firstPoseOfCavity.cavity_center.x ?? 0,
              firstPoseOfCavity.cavity_center.y ?? 0,
              firstPoseOfCavity.cavity_center.z ?? 0,
            ];

        // Short delay so the pose PDB finishes loading into Mol* before we move
        setTimeout(() => {
          viewerRef.current?.focusOnPoint(cx, cy, cz, 14);
        }, 700);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-16">
      <Navbar lightTheme />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 3D Molecular Viewer Section */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          {/* Title row with pose selector */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button
                onClick={() => setViewMode('3d')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
                  viewMode === '3d' ? 'bg-white shadow-sm text-blue-700 border border-blue-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-4 h-4" />
                3D View
              </button>
              <button
                onClick={() => setViewMode('2d')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
                  viewMode === '2d' ? 'bg-white shadow-sm text-blue-700 border border-blue-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2D Interactions
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Cavity Filter Dropdown */}
              {uniqueCavityIds.length > 0 && (
                <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-2">Filter Cavity:</span>
                  <select
                    value={selectedCavityFilter}
                    onChange={(e) => handleCavityFilterChange(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                  >
                    <option value="all">All Pockets</option>
                    {uniqueCavityIds.map(id => (
                      <option key={id} value={id.toString()}>Pocket {id}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Viewing Pose Dropdown */}
              <div className="flex items-center gap-3 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-2">Viewing Pose:</span>
                <select
                  value={selectedPose}
                  onChange={(e) => handleViewPose(parseInt(e.target.value))}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                  disabled={loadingViewer}
                >
                  {filteredPoses.map((pose) => {
                    const globalIndex = allPoses.indexOf(pose) + 1;
                    return (
                      <option key={globalIndex} value={globalIndex}>
                        Pose {globalIndex} - {pose.affinity?.toFixed(2) || 'N/A'} kcal/mol {pose.cavity_id !== undefined ? `(Pocket ${pose.cavity_id})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {viewMode === '3d' && (
            <>
              {/* Toolbar: Dropdowns and Actions */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-slate-200 border-b-0 bg-slate-50 px-4 py-3"
              >
                {/* Left: Dropdowns */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <ControlDropdown
                    label="Protein"
                    value={proteinRepr}
                    options={PROTEIN_REPRESENTATIONS}
                    onChange={setProteinRepr}
                    disabled={loadingViewer}
                  />
                  <ControlDropdown
                    label="Ligand"
                    value={ligandRepr}
                    options={LIGAND_REPRESENTATIONS}
                    onChange={setLigandRepr}
                    disabled={loadingViewer}
                  />
                  <ControlDropdown
                    label="Colour"
                    value={colorScheme}
                    options={COLOR_SCHEMES}
                    onChange={setColorScheme}
                    disabled={loadingViewer}
                  />
                </div>

                {/* Right: Camera Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowProtein(p => !p)}
                    className={`px-3 py-1.5 border rounded-md text-xs font-semibold transition-all flex items-center gap-1 shadow-sm ${
                      !showProtein
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                    title={showProtein ? "Hide protein receptor structure" : "Show protein receptor structure"}
                  >
                    {showProtein ? '👁 Hide Receptor' : '👁 Show Receptor'}
                  </button>
                  <button
                    onClick={() => viewerRef.current?.zoomToPocket()}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-md text-xs font-semibold text-slate-700 hover:text-slate-900 transition-all flex items-center gap-1 shadow-sm"
                    title="Zoom to binding pocket"
                  >
                    🔍 Zoom Pocket
                  </button>
                  <button
                    onClick={() => viewerRef.current?.resetCamera()}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-md text-xs font-semibold text-slate-700 hover:text-slate-900 transition-all flex items-center gap-1 shadow-sm"
                    title="Reset camera view"
                  >
                    🔄 Reset View
                  </button>
                  <button
                    onClick={() => setSpin(prev => !prev)}
                    className={`px-3 py-1.5 border rounded-md text-xs font-semibold transition-all flex items-center gap-1 shadow-sm ${
                      spin
                        ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900'
                    }`}
                    title="Toggle automatic rotation"
                  >
                    🌀 Spin
                  </button>
                </div>
              </div>

              {/* Toggle Bar: Checkboxes for pocket, label, surface, interactions */}
              <div className="flex flex-wrap items-center gap-6 border border-slate-200 border-b-0 bg-slate-50/50 px-4 py-2 text-xs font-medium text-slate-600">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPocketResidues}
                    onChange={(e) => setShowPocketResidues(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Show Pocket Residues</span>
                </label>
                <label className={`flex items-center gap-2 cursor-pointer select-none ${!showPocketResidues ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="checkbox"
                    checked={showPocketLabels}
                    onChange={(e) => setShowPocketLabels(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                    disabled={!showPocketResidues}
                  />
                  <span>Pocket Labels</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPocketSurface}
                    onChange={(e) => setShowPocketSurface(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Pocket Surface</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showInteractions}
                    onChange={(e) => setShowInteractions(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>Interaction Lines</span>
                </label>
              </div>

              {/* Mol* Viewer (clean, no controls inside) */}
              <div className="relative rounded-b-xl overflow-hidden border border-slate-200">
                {loadingViewer && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/75 backdrop-blur-sm rounded-xl">
                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                    <p className="font-medium text-slate-800 pb-2 px-4 rounded-md shadow-sm">Loading molecular structure...</p>
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
                    showPocketResidues={showPocketResidues}
                    showPocketLabels={showPocketLabels}
                    showPocketSurface={showPocketSurface}
                    showInteractions={showInteractions}
                    spin={spin}
                    showProtein={showProtein}
                  />
                ) : (
                  <div className="w-full h-[500px] bg-slate-100/70 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300">
                    {!loadingViewer && <p className="text-slate-600 font-medium">No structure available</p>}
                  </div>
                )}
              </div>
            </>
          )}

          {viewMode === '2d' && (
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <Interaction2DViewer sessionId={sessionId} poseNumber={selectedPose} totalPoses={allPoses.length || 9} />
            </div>
          )}



          {/* Viewer hints */}
          {viewMode === '3d' && (
          <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              Viewer Controls
            </h3>
            <ul className="text-xs text-slate-600 flex flex-wrap gap-x-6 gap-y-2">
              <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono">Left Click</span> rotate</li>
              <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono">Right Click</span> pan</li>
              <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-mono">Scroll</span> zoom</li>
              <li className="flex items-center gap-1.5"><span className="text-blue-600 font-bold">•</span> Click icons in viewer to reset/auto-rotate</li>
            </ul>
          </div>
          )}
        </section>

        {/* All Binding Poses */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-900">All Binding Poses</h2>
            <button
              onClick={handleDownloadTop5}
              disabled={allPoses.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 hover:bg-slate-50 rounded-lg disabled:opacity-50 transition-colors text-sm font-medium border border-slate-300 hover:border-blue-300"
            >
              <Download className="w-4 h-4" />
              Download Top 5 (PDB)
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Cavity</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Mode</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Affinity (kcal/mol)</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">XYZ Coordinates</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPoses.map((pose) => {
                  const globalIndex = allPoses.indexOf(pose) + 1;
                  return (
                    <tr key={globalIndex} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm">
                        {pose.cavity_id !== undefined ? (
                          <button
                            onClick={() => handleCavityFilterChange(pose.cavity_id.toString())}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                          >
                            Pocket {pose.cavity_id}
                          </button>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900 font-medium">{pose.mode || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`font-mono font-bold px-2.5 py-1 rounded-md text-xs ${pose.affinity && pose.affinity < -8
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : pose.affinity && pose.affinity < -6
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                          {pose.affinity?.toFixed(2) || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                        {pose.cavity_center
                          ? `(${Array.isArray(pose.cavity_center)
                              ? pose.cavity_center.map(v => typeof v === 'number' ? v.toFixed(1) : v).join(', ')
                              : pose.cavity_center})`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewPose(globalIndex)}
                            disabled={loadingViewer && selectedPose === globalIndex}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${selectedPose === globalIndex
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300 hover:border-blue-300'
                              } disabled:opacity-50`}
                          >
                            {loadingViewer && selectedPose === globalIndex ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                            {selectedPose === globalIndex ? 'Viewing' : 'View'}
                          </button>
                          <button
                            onClick={() => handleDownloadPose(globalIndex)}
                            disabled={downloadingPose === globalIndex}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-blue-300 rounded-md disabled:opacity-50 transition-all hover:bg-slate-50"
                            title="Download PDB"
                          >
                            {downloadingPose === globalIndex ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            <span className="hidden lg:inline">Download</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {allPoses.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
                  <Eye className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">No binding poses found in results.</p>
                <p className="text-xs text-slate-500 mt-1">Run a new docking simulation to generate poses.</p>
              </div>
            )}
          </div>
        </section>

        {/* Feedback Section (inline, below results) */}
        {feedbackChecked && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquareText className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold text-slate-900">Feedback</h2>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              Please share a quick rating and your feedback description.
            </p>

            {feedbackSubmitted ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-slate-900 mb-1">Thanks! Your feedback has already been submitted.</p>
                <p className="text-xs text-slate-600">Rating: {feedbackRating || 0}/5</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-4">
                <div>
                  <label htmlFor="feedback-name-inline" className="text-sm font-medium text-slate-900 block mb-2">
                    Name
                  </label>
                  <input
                    id="feedback-name-inline"
                    type="text"
                    value={feedbackName}
                    onChange={(e) => setFeedbackName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-900 block mb-2">Rating (out of 5)</label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setFeedbackRating(star)}
                        className="p-1 rounded-md hover:bg-blue-50 transition-colors"
                        aria-label={`Rate ${star} out of 5`}
                      >
                        <Star
                          className={`w-6 h-6 ${star <= feedbackRating ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`}
                        />
                      </button>
                    ))}
                    <span className="text-sm text-slate-600 ml-2">
                      {feedbackRating ? `${feedbackRating}/5` : 'Select rating'}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="feedback-description-inline" className="text-sm font-medium text-slate-900 block mb-2">
                    Feedback description
                  </label>
                  <textarea
                    id="feedback-description-inline"
                    value={feedbackDescription}
                    onChange={(e) => setFeedbackDescription(e.target.value)}
                    placeholder="Tell us what worked well and what can be improved..."
                    rows={4}
                    className="w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all resize-y"
                  />
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-all disabled:opacity-60"
                  >
                    {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

      </div>
    </div>
  );
}

export default Results;
