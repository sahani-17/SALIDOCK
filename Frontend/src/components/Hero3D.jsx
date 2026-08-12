import React, { useEffect, useRef, useState } from "react";
import MolecularViewer from "./MolecularViewer";
import { AnimatedCircularProgressBar } from "./ui/animated-circular-progress-bar";

/**
 * Hero3D — Loads demo protein-ligand complex (PDB 6LU7 / 6LUS: SARS-CoV-2 main protease + N3 inhibitor)
 * Renders an animated 3D protein & ligand viewer with N-to-C rainbow gradient and subtle auto-rotation.
 */
const Hero3D = ({ pdbId = "6LU7" }) => {
    const viewerRef = useRef(null);
    const [pdbData, setPdbData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setPdbData(null);
        setError(null);
        fetch(`/${pdbId}.pdb`)
            .then((r) => {
                if (!r.ok) throw new Error(`Local fetch ${r.status}`);
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

    return (
        <div className="relative w-full h-full bg-card rounded-xl overflow-hidden">
            {!pdbData && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-2">
                    <AnimatedCircularProgressBar label="RCSB" size={64} strokeWidth={5} />
                    <span className="text-xs font-semibold text-foreground">Loading {pdbId}…</span>
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
                    colorScheme="sequence-id"
                    showPocketResidues={false}
                    showPocketLabels={false}
                    showPocketSurface={false}
                    showInteractions={false}
                    spin={true}
                    showProtein
                    minimal
                />
            )}
        </div>
    );
};

export default Hero3D;
