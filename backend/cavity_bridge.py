"""
Bridge / adapter between the new ``salidock.cavity`` pipeline output
(:class:`CavityResult`) and the legacy dictionary format expected by the
backend's downstream modules (``grid_calc``, ``docking_runner``, ``results``).

Required legacy keys consumed downstream
-----------------------------------------
grid_calc.calculate_grid_from_cavity  → ``center``, ``size``
docking_runner.run_vina_multi_cavity  → ``cavity_id``, ``center``, ``size``
results.parse_vina_output_with_cavity → ``rank``, ``volume``, ``center``, ``size``
app.py get_results                    → ``cavity_id``

Usage
-----
::

    from salidock.cavity import CavityDetectionPipeline, CavityConfig
    from cavity_bridge import cavity_results_to_legacy

    pipe = CavityDetectionPipeline(CavityConfig(output_dir=session_dir))
    results = pipe.detect_sync(str(protein_pdb))
    cavities = cavity_results_to_legacy(results, str(protein_pdb))
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# Import will succeed once salidock is pip-installed (editable or normal)
from salidock.cavity.models import CavityResult

log = logging.getLogger(__name__)

# Grid-size constants (must match cavity_detection.py defaults)
_MARGIN = 5.0        # Å added around the bounding box on each side
_MIN_GRID = 15.0     # Å minimum dimension (after margin)
_MAX_BASE = 40.0     # Å maximum base dimension (before margin)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def cavity_results_to_legacy(
    results: list[CavityResult],
    pdb_path: str,
    margin: float = _MARGIN,
    min_grid: float = _MIN_GRID,
    max_base: float = _MAX_BASE,
) -> list[dict]:
    """Convert a list of :class:`CavityResult` objects to legacy dicts.

    Each returned dict is fully compatible with:
    - ``grid_calc.calculate_grid_from_cavity(cavity_data)``
    - ``docking_runner.run_vina_multi_cavity(…, cavities=…)``
    - ``results.parse_vina_output_with_cavity(…, cavity_metadata=…)``
    - The JSON response sent to the frontend

    Parameters
    ----------
    results : list[CavityResult]
        Output from ``CavityDetectionPipeline.detect_sync()``.
    pdb_path : str
        Path to the PDB file used for detection (needed to compute
        residue-based bounding boxes for the ``size`` field).
    margin, min_grid, max_base : float
        Grid-sizing parameters forwarded to ``_compute_grid_size()``.

    Returns
    -------
    list[dict]
        Legacy-format cavity dictionaries, one per CavityResult.
    """
    # Pre-parse Cα coordinates from the PDB once (shared across cavities)
    residue_coords = _parse_ca_coords(Path(pdb_path))

    legacy: list[dict] = []
    for res in results:
        d = _convert_one(res, residue_coords, margin, min_grid, max_base)
        legacy.append(d)

    return legacy


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _convert_one(
    res: CavityResult,
    residue_coords: dict[str, np.ndarray],
    margin: float,
    min_grid: float,
    max_base: float,
) -> dict:
    """Convert a single CavityResult to a legacy dict."""

    center_arr = np.asarray(res.center, dtype=float)
    center = tuple(round(float(c), 3) for c in center_arr)

    # Compute grid *size* from residue bounding box (preferred)
    # or fall back to a volume-based cube-root estimate.
    size = _compute_grid_size(
        res.residues, residue_coords, res.volume_estimate,
        margin, min_grid, max_base,
    )

    cavity = {
        # === Keys required by grid_calc / docking_runner / results ===
        "cavity_id": res.rank,
        "center": center,
        "size": size,
        "rank": res.rank,
        "volume": res.volume_estimate,

        # === New consensus fields (for API response / frontend) ===
        "confidence": res.confidence,
        "weighted_score": res.weighted_score,
        "methods": res.methods,
        "method_scores": res.method_scores,
        "detected_by": res.methods,          # backward-compat alias
        "detection_tier": 1,
        "method": "consensus",

        # === Legacy-compat convenience fields ===
        "druggability_score": res.method_scores.get("fpocket", 0.0),
        "p2rank_score": res.method_scores.get("p2rank", 0.0),
        "num_residues": len(res.residues),
        "residues": res.residues,
    }
    return cavity


def _compute_grid_size(
    residues: list[str],
    residue_coords: dict[str, np.ndarray],
    volume_estimate: float,
    margin: float,
    min_grid: float,
    max_base: float,
) -> Tuple[float, float, float]:
    """Determine grid dimensions for Vina docking.

    Strategy
    --------
    1. If ≥ 3 residues have known Cα coordinates → bounding-box + margin.
    2. Else if volume_estimate > 0 → cube-root approximation + margin.
    3. Else → default 20 × 20 × 20 Å.
    """
    # --- Strategy 1: bounding box from Cα positions -----------------------
    pts = [residue_coords[r] for r in residues if r in residue_coords]
    if len(pts) >= 3:
        arr = np.array(pts)
        bbox = arr.max(axis=0) - arr.min(axis=0)  # (3,)

        # Cap + margin + floor
        dims = []
        for d in bbox:
            base = min(float(d), max_base)
            dim = max(base + 2 * margin, min_grid)
            dims.append(round(dim, 3))
        return tuple(dims)  # type: ignore[return-value]

    # --- Strategy 2: cube-root of volume estimate -------------------------
    if volume_estimate > 0:
        side = volume_estimate ** (1.0 / 3.0)
        side = min(side, max_base)
        dim = max(side + 2 * margin, min_grid)
        dim = round(dim, 3)
        return (dim, dim, dim)

    # --- Strategy 3: safe default -----------------------------------------
    log.warning("No residue coords and no volume estimate — using default 20 Å grid")
    return (20.0, 20.0, 20.0)


def _parse_ca_coords(pdb_path: Path) -> dict[str, np.ndarray]:
    """Extract Cα coordinates keyed by ``RESNAME_RESNUM_CHAIN``."""
    coords: dict[str, np.ndarray] = {}
    if not pdb_path.exists():
        log.warning("PDB file not found for residue parsing: %s", pdb_path)
        return coords

    for line in pdb_path.read_text().splitlines():
        if not line.startswith("ATOM"):
            continue
        if line[12:16].strip() != "CA":
            continue
        try:
            res_name = line[17:20].strip()
            chain = line[21:22].strip()
            res_num = line[22:26].strip()
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            rid = f"{res_name}_{res_num}_{chain}" if chain else f"{res_name}_{res_num}"
            coords[rid] = np.array([x, y, z])
        except (ValueError, IndexError):
            continue
    return coords
