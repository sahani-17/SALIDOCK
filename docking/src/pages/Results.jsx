import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, ArrowLeft, Loader2, Eye } from 'lucide-react';
import { api } from '../services/api';
import MolecularViewer from '../components/MolecularViewer';

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

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    const fetchResults = async () => {
      try {
        setLoading(true);
        const data = await api.getResults(sessionId);
        setResults(data);
      } catch (err) {
        setError('Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

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
      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  const handleViewPose = async (poseNumber) => {
    setLoadingViewer(true);
    setSelectedPose(poseNumber);
    try {
      const blob = await api.downloadComplex(sessionId, poseNumber);
      const text = await blob.text();
      setPdbData(text);
    } catch (err) {
      setError('Failed to load structure for visualization');
    } finally {
      setLoadingViewer(false);
    }
  };

  // Auto-load best pose on mount
  useEffect(() => {
    if (results?.poses && results.poses.length > 0) {
      handleViewPose(1);
    }
  }, [results]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'No results found'}</p>
          <button
            onClick={() => navigate('/docking')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Docking
          </button>
        </div>
      </div>
    );
  }

  const allPoses = results.poses || [];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <a href="/"><img src="/logo.png" alt="SaliDock" className="h-12" /></a>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <h1 className="text-2xl font-semibold text-gray-900">Results & Analysis</h1>
                <p className="text-sm text-gray-600 mt-1">Analyze docking results and molecular interactions</p>
              </div>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                New Docking
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* 3D Molecular Viewer */}
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">3D Molecular Structure</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Viewing Pose:</span>
              <select
                value={selectedPose}
                onChange={(e) => handleViewPose(parseInt(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

          {loadingViewer ? (
            <div className="w-full h-96 bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading molecular structure...</p>
              </div>
            </div>
          ) : pdbData ? (
            <MolecularViewer pdbData={pdbData} poseNumber={selectedPose} sessionId={sessionId} />
          ) : (
            <div className="w-full h-96 bg-gray-50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
              <p className="text-gray-600">No structure available</p>
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Viewer Controls</h3>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• <strong>Rotate:</strong> Left click + drag</li>
              <li>• <strong>Zoom:</strong> Scroll wheel or pinch</li>
              <li>• <strong>Pan:</strong> Right click + drag</li>
              <li>• <strong>Reset View:</strong> Click the rotate icon</li>
              <li>• <strong>Toggle Rotation:</strong> Click the rotation icon to start/stop auto-rotation</li>
            </ul>
          </div>
        </section>

        {/* All Binding Poses */}
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">All Binding Poses</h2>
            <button
              onClick={handleDownloadTop5}
              disabled={allPoses.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Download Top 5 Best Binding Pose Complex (PDB)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Mode</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Cavity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Affinity (kcal/mol)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">RMSD (Å)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Volume (Ų)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allPoses.map((pose, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-900 text-sm font-semibold">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{pose.mode || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{pose.cavity_id !== undefined ? pose.cavity_id : '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-semibold ${pose.affinity && pose.affinity < -8
                        ? 'text-green-700'
                        : pose.affinity && pose.affinity < -6
                          ? 'text-orange-700'
                          : 'text-gray-700'
                        }`}>
                        {pose.affinity?.toFixed(2) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{pose.rmsd_lb?.toFixed(2) || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{pose.cavity_volume?.toFixed(0) || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewPose(index + 1)}
                          disabled={loadingViewer && selectedPose === index + 1}
                          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors ${selectedPose === index + 1
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            } disabled:opacity-50`}
                        >
                          {loadingViewer && selectedPose === index + 1 ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Eye className="w-3 h-3" />
                          )}
                          {selectedPose === index + 1 ? 'Viewing' : 'View'}
                        </button>
                        <button
                          onClick={() => handleDownloadPose(index + 1)}
                          disabled={downloadingPose === index + 1}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                          {downloadingPose === index + 1 ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {allPoses.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No binding poses found</p>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

export default Results;
