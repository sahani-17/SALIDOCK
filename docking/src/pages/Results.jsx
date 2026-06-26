import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, Loader2, Eye, ChevronDown, Star, MessageSquareText, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../services/api';
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
  { value: 'default', label: 'Default' },
  { value: 'element-symbol', label: 'Element' },
  { value: 'chain-id', label: 'Chain' },
  { value: 'residue-name', label: 'Residue Name' },
  { value: 'sequence-id', label: 'Sequence ID' },
  { value: 'secondary-structure', label: 'Secondary Structure' },
  { value: 'hydrophobicity', label: 'Hydrophobicity' },
  { value: 'uniform', label: 'Uniform' },
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
    <div ref={ref} style={{ position: 'relative', minWidth: '140px' }}>
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        style={{
          background: 'hsl(215, 25%, 15%)',
          color: '#f0f0f0',
          border: '1px solid hsl(160, 60%, 30%)',
          borderRadius: '8px',
          padding: '7px 12px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          gap: '6px',
          transition: 'all 0.15s ease',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{ opacity: 0.5, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>
          {label}
        </span>
        <span>{selected?.label || value}</span>
        <ChevronDown
          size={13}
          style={{ opacity: 0.5, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            background: 'hsl(215, 25%, 12%)',
            border: '1px solid hsl(160, 60%, 30%)',
            borderRadius: '8px',
            overflow: 'hidden',
            zIndex: 100,
            minWidth: '100%',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 14px',
                fontSize: '12px',
                fontWeight: opt.value === value ? 700 : 400,
                textAlign: 'left',
                cursor: 'pointer',
                border: 'none',
                background: opt.value === value ? 'hsl(160, 84%, 39%)' : 'transparent',
                color: opt.value === value ? '#000' : '#d0d0d0',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value) e.target.style.background = 'hsl(215, 25%, 20%)';
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value) e.target.style.background = 'transparent';
              }}
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
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackChecked, setFeedbackChecked] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Viewer control state
  const [proteinRepr, setProteinRepr] = useState('cartoon');
  const [ligandRepr, setLigandRepr] = useState('ball-and-stick');
  const [colorScheme, setColorScheme] = useState('default');

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
      setColorScheme('default');
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

  useEffect(() => {
    if (loading || !results || !feedbackChecked) return;
    if (!feedbackSubmitted) {
      setShowFeedbackModal(true);
    }
  }, [loading, results, feedbackChecked, feedbackSubmitted]);

  useEffect(() => {
    document.body.style.overflow = showFeedbackModal ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showFeedbackModal]);

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
      setShowFeedbackModal(false);
      toast.success('Thanks! Your feedback was submitted.');
    } catch (err) {
      console.error('Feedback submit error:', err);
      toast.error(err?.message || 'Failed to submit feedback.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // ─── Mol* interaction helpers (completely outside the viewer) ─────
  const getPlugin = () => viewerRef.current?.getPlugin?.();

  const handleProteinReprChange = useCallback(async (value) => {
    setProteinRepr(value);
    const plugin = getPlugin();
    if (!plugin) return;
    try {
      const comps = getComponents(plugin, 'protein');
      if (!comps.length) return;
      // removeRepresentations takes an ARRAY of components (Mol* v4 API)
      await plugin.managers.structure.component.removeRepresentations(comps);
      // Re-fetch fresh components after removal (hierarchy updates)
      const freshComps = getComponents(plugin, 'protein');
      if (freshComps.length) {
        // addRepresentation takes (components[], type_string)
        await plugin.managers.structure.component.addRepresentation(freshComps, value);
      }
    } catch (err) {
      console.error('Error changing protein repr:', err);
    }
  }, []);

  const handleLigandReprChange = useCallback(async (value) => {
    setLigandRepr(value);
    const plugin = getPlugin();
    if (!plugin) return;
    try {
      const comps = getComponents(plugin, 'ligand');
      if (!comps.length) return;
      await plugin.managers.structure.component.removeRepresentations(comps);
      const freshComps = getComponents(plugin, 'ligand');
      if (freshComps.length) {
        await plugin.managers.structure.component.addRepresentation(freshComps, value);
      }
    } catch (err) {
      console.error('Error changing ligand repr:', err);
    }
  }, []);

  const handleColorChange = useCallback(async (value) => {
    setColorScheme(value);
    const plugin = getPlugin();
    if (!plugin) return;
    try {
      const comps = getComponents(plugin, 'all');
      if (!comps.length) return;
      // updateRepresentationsTheme takes (components[], params)
      await plugin.managers.structure.component.updateRepresentationsTheme(comps, {
        color: value === 'default' ? 'default' : value,
      });
    } catch (err) {
      console.error('Error changing color scheme:', err);
    }
  }, []);



  // ─── Render guards ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive font-medium mb-4">{error || 'No results found'}</p>
          <button
            onClick={() => navigate('/docking')}
            className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-lg hover:brightness-110 transition-all glow-emerald"
          >
            Back to Docking
          </button>
        </div>
      </div>
    );
  }

  const allPoses = results.poses || [];

  return (
    <div className="min-h-screen bg-background pt-16">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 3D Molecular Viewer Section */}
        <section className="bg-card rounded-xl border border-primary/10 p-6 mb-6 shadow-sm">
          {/* Title row with pose selector */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
            <div className="flex bg-secondary/30 rounded-lg p-1 border border-primary/10">
              <button
                onClick={() => setViewMode('3d')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
                  viewMode === '3d' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="w-4 h-4" />
                3D View
              </button>
              <button
                onClick={() => setViewMode('2d')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-md transition-all ${
                  viewMode === '2d' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                2D Interactions
              </button>
            </div>
            <div className="flex items-center gap-3 bg-secondary/50 p-1.5 rounded-lg border border-primary/5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground ml-2">Viewing Pose:</span>
              <select
                value={selectedPose}
                onChange={(e) => handleViewPose(parseInt(e.target.value))}
                className="px-3 py-1.5 bg-background border border-primary/20 rounded-md text-sm font-medium focus:ring-1 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all"
                disabled={loadingViewer}
              >
                {allPoses.map((pose, index) => (
                  <option key={index} value={index + 1}>
                    Pose {index + 1} - {pose.affinity?.toFixed(2) || 'N/A'} kcal/mol
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ─── Controls bar (OUTSIDE Mol* container) ─── */}
          {viewMode === '3d' ? (
            <>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              background: 'hsl(215, 25%, 10%)',
              borderRadius: '10px 10px 0 0',
              borderBottom: '1px solid hsl(160, 60%, 25%)',
            }}
          >
            <ControlDropdown
              label="Protein"
              value={proteinRepr}
              options={PROTEIN_REPRESENTATIONS}
              onChange={handleProteinReprChange}
              disabled={loadingViewer}
            />
            <ControlDropdown
              label="Ligand"
              value={ligandRepr}
              options={LIGAND_REPRESENTATIONS}
              onChange={handleLigandReprChange}
              disabled={loadingViewer}
            />
            <ControlDropdown
              label="Colour"
              value={colorScheme}
              options={COLOR_SCHEMES}
              onChange={handleColorChange}
              disabled={loadingViewer}
            />
          </div>

          {/* Mol* Viewer (clean, no controls inside) */}
          <div className="relative rounded-b-xl overflow-hidden ring-1 ring-primary/10">
            {loadingViewer && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-card/60 backdrop-blur-sm rounded-xl">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <p className="font-medium text-foreground pb-2 px-4 rounded-md shadow-sm">Loading molecular structure...</p>
              </div>
            )}
            {pdbData ? (
              <MolecularViewer ref={viewerRef} pdbData={pdbData} poseNumber={selectedPose} sessionId={sessionId} />
            ) : (
              <div className="w-full h-[500px] bg-secondary/20 rounded-xl flex items-center justify-center border-2 border-dashed border-primary/20">
                {!loadingViewer && <p className="text-muted-foreground font-medium">No structure available</p>}
              </div>
            )}
          </div>
            </>
          ) : (
            <div className="rounded-xl overflow-hidden ring-1 ring-primary/10">
              <Interaction2DViewer sessionId={sessionId} poseNumber={selectedPose} totalPoses={allPoses.length || 9} />
            </div>
          )}

          {/* Viewer hints */}
          {viewMode === '3d' && (
          <div className="mt-6 p-4 bg-primary/5 rounded-xl border border-primary/10 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              Viewer Controls
            </h3>
            <ul className="text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
              <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-background border border-primary/20 rounded text-[10px] font-mono">Left Click</span> rotate</li>
              <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-background border border-primary/20 rounded text-[10px] font-mono">Right Click</span> pan</li>
              <li className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 bg-background border border-primary/20 rounded text-[10px] font-mono">Scroll</span> zoom</li>
              <li className="flex items-center gap-1.5"><span className="text-primary font-bold">•</span> Click icons in viewer to reset/auto-rotate</li>
            </ul>
          </div>
          )}
        </section>

        {/* All Binding Poses */}
        <section className="bg-card rounded-xl border border-primary/10 p-6 mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
            <h2 className="text-xl font-bold text-foreground">All Binding Poses</h2>
            <button
              onClick={handleDownloadTop5}
              disabled={allPoses.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg disabled:opacity-50 transition-colors text-sm font-medium border border-primary/10 hover:border-primary/30"
            >
              <Download className="w-4 h-4" />
              Download Top 5 (PDB)
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-primary/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/30 border-b border-primary/10">
                  <th className="px-4 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Rank</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Mode</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Cavity</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Affinity (kcal/mol)</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">RMSD (Å)</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">Volume (ų)</th>
                  <th className="px-4 py-3.5 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {allPoses.map((pose, index) => (
                  <tr key={index} className="hover:bg-primary/5 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{pose.mode || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{pose.cavity_id !== undefined ? `Pocket ${pose.cavity_id}` : '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-mono font-bold px-2.5 py-1 rounded-md text-xs ${pose.affinity && pose.affinity < -8
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : pose.affinity && pose.affinity < -6
                          ? 'bg-warning/10 text-warning border border-warning/20'
                          : 'bg-secondary text-muted-foreground'
                        }`}>
                        {pose.affinity?.toFixed(2) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{pose.rmsd_lb?.toFixed(2) || '-'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{pose.cavity_volume?.toFixed(0) || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewPose(index + 1)}
                          disabled={loadingViewer && selectedPose === index + 1}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${selectedPose === index + 1
                            ? 'bg-primary text-primary-foreground shadow-[0_0_15px_-3px_hsl(160,84%,39%,0.4)]'
                            : 'bg-secondary text-foreground hover:bg-secondary/80 border border-transparent hover:border-primary/20'
                            } disabled:opacity-50`}
                        >
                          {loadingViewer && selectedPose === index + 1 ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          {selectedPose === index + 1 ? 'Viewing' : 'View'}
                        </button>
                        <button
                          onClick={() => handleDownloadPose(index + 1)}
                          disabled={downloadingPose === index + 1}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-transparent text-muted-foreground hover:text-foreground border border-primary/10 hover:border-primary/30 rounded-md disabled:opacity-50 transition-all hover:bg-primary/5"
                          title="Download PDB"
                        >
                          {downloadingPose === index + 1 ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden lg:inline">Download</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {allPoses.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/10">
                  <Eye className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground font-medium">No binding poses found in results.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Run a new docking simulation to generate poses.</p>
              </div>
            )}
          </div>
        </section>

      </div>

      {showFeedbackModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowFeedbackModal(false)}
          />

          <div className="relative w-full max-w-lg rounded-2xl border border-primary/20 bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowFeedbackModal(false)}
              className="absolute right-3 top-3 p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close feedback popup"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <MessageSquareText className="w-5 h-5 text-primary" />
              <h2 className="text-lg sm:text-xl font-bold text-foreground">How was your result?</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              Please share a quick rating and your feedback description.
            </p>

            <form onSubmit={handleSubmitFeedback} className="space-y-4">
              <div>
                <label htmlFor="feedback-name-modal" className="text-sm font-medium text-foreground block mb-2">
                  Name
                </label>
                <input
                  id="feedback-name-modal"
                  type="text"
                  value={feedbackName}
                  onChange={(e) => setFeedbackName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-lg bg-background border border-primary/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Rating (out of 5)</label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFeedbackRating(star)}
                      className="p-1 rounded-md hover:bg-primary/10 transition-colors"
                      aria-label={`Rate ${star} out of 5`}
                    >
                      <Star
                        className={`w-6 h-6 ${star <= feedbackRating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/40'}`}
                      />
                    </button>
                  ))}
                  <span className="text-sm text-muted-foreground ml-2">
                    {feedbackRating ? `${feedbackRating}/5` : 'Select rating'}
                  </span>
                </div>
              </div>

              <div>
                <label htmlFor="feedback-description-modal" className="text-sm font-medium text-foreground block mb-2">
                  Feedback description
                </label>
                <textarea
                  id="feedback-description-modal"
                  value={feedbackDescription}
                  onChange={(e) => setFeedbackDescription(e.target.value)}
                  placeholder="Tell us what worked well and what can be improved..."
                  rows={4}
                  className="w-full rounded-lg bg-background border border-primary/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all resize-y"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(false)}
                  className="px-4 py-2 rounded-lg border border-primary/20 text-sm font-medium text-foreground hover:bg-primary/5 transition-all"
                >
                  Later
                </button>
                <button
                  type="submit"
                  disabled={submittingFeedback}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-60"
                >
                  {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Results;
