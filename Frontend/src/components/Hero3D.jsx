import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import MolecularViewer from "./MolecularViewer";

/**
 * Hero3D — Loads a small demo protein-ligand complex from RCSB and
 * renders it with the same Mol* pipeline the workflow uses.
 *
 * Default: 1STP (streptavidin + biotin) — small, ligand-bound, iconic.
 */
const Hero3D = ({ pdbId = "1STP" }) => {
    const viewerRef = useRef(null);
    const [pdbData, setPdbData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setPdbData(null);
        setError(null);
        fetch(`https://files.rcsb.org/download/${pdbId}.pdb`)
            .then((r) => {
                if (!r.ok) throw new Error(`RCSB ${r.status}`);
                return r.text();
            })
            .then((text) => {
                if (!cancelled) setPdbData(text);
            })
            .catch((e) => {
                if (!cancelled) setError(e.message || "Failed to load structure");
            });
        return () => {
            cancelled = true;
        };
    }, [pdbId]);

    // Gentle idle rotation
    useEffect(() => {
        if (!pdbData) return;
        const t = setTimeout(() => {
            const plugin = viewerRef.current?.getPlugin?.();
            if (!plugin) return;
            try {
                plugin.canvas3d?.setProps({ trackball: { ...plugin.canvas3d.props.trackball, animate: { name: "spin", params: { speed: 0.15 } } } });
            } catch {
                /* noop */
            }
        }, 900);
        return () => clearTimeout(t);
    }, [pdbData]);

    return (
        <div className="relative w-full h-full bg-card">
            {!pdbData && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading {pdbId}…
                    </div>
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
                    <p className="text-sm text-destructive text-center">{error}</p>
                </div>
            )}
            {pdbData && (
                <MolecularViewer
                    ref={viewerRef}
                    pdbData={pdbData}
                    poseNumber={1}
                    proteinRepr="cartoon"
                    ligandRepr="ball-and-stick"
                    colorScheme="chain-id"
                    showPocketResidues={false}
                    showPocketLabels={false}
                    showPocketSurface={false}
                    showInteractions={false}
                    spin={false}
                    showProtein
                    minimal
                />
            )}
        </div>
    );
};

export default Hero3D;
