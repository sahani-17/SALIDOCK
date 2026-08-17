import React, { useEffect, useRef, useState } from "react";
import MolecularViewer from "./MolecularViewer";
import { AnimatedCircularProgressBar } from "./ui/animated-circular-progress-bar";

/**
 * Hero3D — Loads demo protein / ligand complex and renders an interactive 3D Mol* viewer.
 * Supports both whole receptor view (e.g. 6LUS / 6LU7) and ligand interaction view (e.g. 1DSP / 1STP).
 */
const Hero3D = ({
    pdbId = "6LU7",
    showInteractions = false,
    showPocketResidues = false,
    showPocketLabels = false,
    showPocketSurface = false,
    colorScheme = "sequence-id",
    proteinRepr = "cartoon",
    ligandRepr = "ball-and-stick",
    spin = true,
    focusOnLigand = false,
}) => {
    const viewerRef = useRef(null);
    const [pdbData, setPdbData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setPdbData(null);
        setError(null);

        const fetchStructure = async () => {
            const upper = pdbId.toUpperCase();
            const lower = pdbId.toLowerCase();

            // Candidate URLs: local exact, uppercase, lowercase, and RCSB fallback
            const candidates = [
                `/${pdbId}.pdb`,
                `/${upper}.pdb`,
                `/${lower}.pdb`,
                `https://files.rcsb.org/download/${upper}.pdb`
            ];

            for (const url of candidates) {
                try {
                    const r = await fetch(url);
                    if (r.ok) {
                        const text = await r.text();
                        if (text && text.includes("ATOM") && !cancelled) {
                            setPdbData(text);
                            return;
                        }
                    }
                } catch (e) {
                    // Try next candidate
                }
            }

            if (!cancelled) {
                setError(`Unable to load structure ${pdbId}`);
            }
        };

        fetchStructure();

        return () => {
            cancelled = true;
        };
    }, [pdbId]);

    return (
        <div className="relative w-full h-full bg-card rounded-xl overflow-hidden">
            {!pdbData && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-10 gap-2">
                    <AnimatedCircularProgressBar label="RCSB" size={56} strokeWidth={4} />
                    <span className="text-xs font-semibold text-foreground">Loading {pdbId.toUpperCase()}…</span>
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
                    proteinRepr={proteinRepr}
                    ligandRepr={ligandRepr}
                    colorScheme={colorScheme}
                    showPocketResidues={showPocketResidues}
                    showPocketLabels={showPocketLabels}
                    showPocketSurface={showPocketSurface}
                    showInteractions={showInteractions}
                    spin={spin}
                    showProtein
                    minimal
                    focusOnLigand={focusOnLigand || showInteractions}
                />
            )}
        </div>
    );
};

export default Hero3D;
