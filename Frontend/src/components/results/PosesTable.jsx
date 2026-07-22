import React from 'react';
import { Download, Eye, Loader2 } from 'lucide-react';

export default function PosesTable({
  allPoses, filteredPoses, selectedPose, loadingViewer, downloadingPose,
  onViewPose, onDownloadPose, onCavityClick,
}) {
  const formatTriplet = (v) => {
    if (!v) return '-';
    const arr = Array.isArray(v) ? v : [v.x ?? 0, v.y ?? 0, v.z ?? 0];
    return arr.map((n) => (typeof n === 'number' ? n.toFixed(0) : n)).join(', ');
  };

  return (
    <section className="bg-card rounded-2xl border border-border p-6 mb-6 shadow-elevated">
      <div className="mb-6">
        <h2 className="font-display text-2xl text-foreground">Binding Cavities</h2>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">

        <table className="w-full text-center border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Cavity ID</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Mode</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Affinity (kcal/mol)</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Center (x, y, z)</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allPoses.map((pose) => {
              const globalIndex = allPoses.indexOf(pose) + 1;
              const isSelected = selectedPose === globalIndex;
              return (
                <tr
                  key={globalIndex}
                  className={`border-t border-border transition-colors ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/30'
                  }`}
                >
                  <td className="px-4 py-3 text-sm">
                    {pose.cavity_id !== undefined ? (
                      <button
                        onClick={() => onCavityClick(pose.cavity_id.toString())}
                        className="text-primary font-semibold hover:underline"
                      >
                        C{pose.cavity_id}
                      </button>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{pose.mode || '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {pose.affinity?.toFixed(2) ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatTriplet(pose.cavity_center)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onViewPose(globalIndex)}
                        disabled={loadingViewer && isSelected}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card text-foreground hover:bg-muted border border-border hover:border-primary/40'
                        } disabled:opacity-50`}
                      >
                        {loadingViewer && isSelected
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Eye className="w-3.5 h-3.5" />}
                        {isSelected ? 'Viewing' : 'View'}
                      </button>
                      <button
                        onClick={() => onDownloadPose(globalIndex)}
                        disabled={downloadingPose === globalIndex}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card text-muted-foreground hover:text-foreground border border-border hover:border-primary/40 rounded-md disabled:opacity-50 transition-all hover:bg-muted"
                        title="Download PDB"
                      >
                        {downloadingPose === globalIndex
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Download className="w-3.5 h-3.5" />}
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
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <Eye className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">No binding poses found in results.</p>
            <p className="text-xs text-muted-foreground mt-1">Run a new docking simulation to generate poses.</p>
          </div>
        )}
      </div>
    </section>
  );
}
