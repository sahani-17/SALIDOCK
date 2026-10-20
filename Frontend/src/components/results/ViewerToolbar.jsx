import React from 'react';
import ControlDropdown from './ControlDropdown';
import { PROTEIN_REPRESENTATIONS, LIGAND_REPRESENTATIONS, COLOR_SCHEMES } from './viewerOptions';

export default function ViewerToolbar({
  proteinRepr, setProteinRepr,
  ligandRepr, setLigandRepr,
  colorScheme, setColorScheme,
  loadingViewer,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border border-border/80 border-b-0 bg-muted/40 backdrop-blur-xl px-4 py-2.5 select-none">
      <div className="flex flex-wrap items-center gap-2.5">
        <ControlDropdown label="Protein" value={proteinRepr} options={PROTEIN_REPRESENTATIONS} onChange={setProteinRepr} disabled={loadingViewer} />
        <ControlDropdown label="Ligand" value={ligandRepr} options={LIGAND_REPRESENTATIONS} onChange={setLigandRepr} disabled={loadingViewer} />
        <ControlDropdown label="Colour" value={colorScheme} options={COLOR_SCHEMES} onChange={setColorScheme} disabled={loadingViewer} />
      </div>
    </div>
  );
}

