import React from 'react';
import Switch from '../ui/Switch';

export default function ViewerToggles({
  showPocketResidues, setShowPocketResidues,
  showPocketLabels, setShowPocketLabels,
  showPocketSurface, setShowPocketSurface,
  showInteractions, setShowInteractions,
  showProtein = true, setShowProtein,
}) {
  return (
    <div className="flex flex-wrap items-center gap-5 border border-border/80 border-b-0 bg-muted/30 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-muted-foreground select-none">
      {setShowProtein && (
        <Switch
          checked={!showProtein}
          onChange={(checked) => setShowProtein(!checked)}
          label="Hide Receptor"
        />
      )}
      <Switch
        checked={showPocketSurface}
        onChange={setShowPocketSurface}
        label="Cavity Surface"
      />
      <Switch
        checked={showPocketResidues}
        onChange={setShowPocketResidues}
        label="Cavity Residues"
      />
      <Switch
        checked={showPocketLabels}
        onChange={setShowPocketLabels}
        label="Residue Labels"
      />
      <Switch
        checked={showInteractions}
        onChange={setShowInteractions}
        label="Interactions"
      />
    </div>
  );
}
