import React from 'react';
import { Download, Eye } from 'lucide-react';
import { AnimatedCircularProgressBar } from '../ui/animated-circular-progress-bar';

export default function PosesTable({
  allPoses, filteredPoses, selectedPose, loadingViewer, downloadingPose,
  onViewPose, onDownloadPose, onCavityClick, dockingParams,
}) {
  const formatTriplet = (v) => {
    if (!v) return '-';
    if (typeof v === 'string') return v;
    const arr = Array.isArray(v) ? v : [v.x ?? 0, v.y ?? 0, v.z ?? 0];
    return arr.map((n) => (typeof n === 'number' ? n.toFixed(2) : n)).join(', ');
  };

  const isManualOnly = allPoses.length > 0 && allPoses.every((p) => p.cavity_id === undefined || p.cavity_id === null);

  return (
    <section className="bg-card/75 backdrop-blur-xl rounded-3xl border border-border/80 p-6 mb-6 shadow-elevated apple-specular-edge">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          {isManualOnly ? 'Active Site Docking Results' : 'Binding Cavities & Docking Poses'}
        </h2>
        {isManualOnly && (
          <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold apple-specular-edge">
            User-Defined Coordinates
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/40 backdrop-blur-md">

        <table className="w-full text-center border-collapse">
          <thead>
            <tr className="bg-muted/40">
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cavity ID</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mode</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Affinity (kcal/mol)</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Center (x, y, z)</th>
              <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allPoses.map((pose) => {
              const globalIndex = allPoses.indexOf(pose) + 1;
              const isSelected = selectedPose === globalIndex;
              const centerCoordinates = pose.cavity_center || pose.grid_center || pose.center || dockingParams?.grid_center;

              return (
                <tr
                  key={globalIndex}
                  className={`border-t border-border/50 transition-colors duration-150 ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/20'
                  }`}
                >
                  <td className="px-4 py-3 text-sm">
                    {pose.cavity_id !== undefined && pose.cavity_id !== null ? (
                      <button
                        onClick={() => onCavityClick(pose.cavity_id.toString())}
                        className="text-primary font-semibold hover:underline active:scale-95 transition-transform"
                      >
                        C{pose.cavity_id}
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        Active Site
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground font-medium">{pose.mode || '-'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground font-mono-code">
                    {pose.affinity?.toFixed(2) ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono-code text-muted-foreground">
                    {formatTriplet(centerCoordinates)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => onViewPose(globalIndex)}
                        disabled={loadingViewer && isSelected}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-all duration-150 ease-out active:scale-[0.97] ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-xs shadow-primary/20 apple-specular-edge'
                            : 'bg-card/80 text-foreground hover:bg-card border border-border/80 hover:border-primary/40'
                        } disabled:opacity-50`}
                      >
                        {loadingViewer && isSelected
                          ? <AnimatedCircularProgressBar size={14} strokeWidth={3} />
                          : <Eye className="w-3.5 h-3.5" />}
                        {isSelected ? 'Viewing' : 'View'}
                      </button>
                      <button
                        onClick={() => onDownloadPose(globalIndex)}
                        disabled={downloadingPose === globalIndex}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-card/80 text-muted-foreground hover:text-foreground border border-border/80 hover:border-primary/40 rounded-full disabled:opacity-50 transition-all duration-150 ease-out active:scale-[0.97] hover:bg-card"
                        title="Download PDB"
                      >
                        {downloadingPose === globalIndex
                          ? <AnimatedCircularProgressBar size={14} strokeWidth={3} />
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
