import React from 'react';

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded text-primary border-border focus:ring-ring cursor-pointer"
      />
      <span>{label}</span>
    </label>
  );
}

export default function ViewerToggles({
  showPocketResidues, setShowPocketResidues,
  showPocketLabels, setShowPocketLabels,
  showPocketSurface, setShowPocketSurface,
  showInteractions, setShowInteractions,
}) {
  return (
    <div className="flex flex-wrap items-center gap-6 border border-border border-b-0 bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground">
      <Toggle checked={showPocketResidues} onChange={setShowPocketResidues} label="Show Cavity Residues" />
      <Toggle checked={showPocketLabels} onChange={setShowPocketLabels} label="Cavity Labels" disabled={!showPocketResidues} />
      <Toggle checked={showPocketSurface} onChange={setShowPocketSurface} label="Cavity Surface" />
      <Toggle checked={showInteractions} onChange={setShowInteractions} label="Interaction Lines" />
    </div>
  );
}
