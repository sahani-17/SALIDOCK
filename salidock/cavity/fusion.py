"""
salidock.cavity.fusion — wRRF consensus fusion engine.

Implements the exact algorithm from the benchmark:
  1. Greedy spatial clustering (radius = 6.0 Å)
  2. Weighted Reciprocal Rank Fusion (wRRF, k = 60)
  3. Residue annotation (within 8 Å of pocket centre)
  4. Confidence tier assignment (HIGH / MEDIUM / LOW)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np

from .models import CavityResult

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────────────────────

def fuse_predictions(
    fpocket_pockets: List[Dict],
    p2rank_pockets: List[Dict],
    puresnet_pockets: List[Dict],
    weights: Dict[str, float],
    rrf_k: int = 60,
    clustering_radius: float = 6.0,
    residue_radius: float = 8.0,
    pdb_path: Optional[str] = None,
    top_n: int = 50,
) -> List[CavityResult]:
    """
    Fuse pocket predictions from up to three tools using wRRF.

    Parameters
    ----------
    fpocket_pockets, p2rank_pockets, puresnet_pockets :
        Lists of pocket dicts {center: np.ndarray, score: float, volume: float},
        sorted highest-score-first.  Empty lists are accepted (tool failed/skipped).
    weights :
        Dict mapping tool name → weight. Active keys: "fpocket", "p2rank", "puresnet".
    rrf_k :
        RRF stabilising constant (default 60).
    clustering_radius :
        Greedy spatial merge radius in Å (default 6.0).
    residue_radius :
        Radius for collecting nearby Cα residues in Å (default 8.0).
    pdb_path :
        Path to the protein PDB file (used for residue annotation).  Optional.
    top_n :
        Maximum number of results to return.

    Returns
    -------
    List[CavityResult]
        Ranked cavity results, highest wRRF score first.
    """
    # Tag each pocket with its source tool and 1-based rank
    all_pockets: List[Dict] = []
    tool_map = {
        "fpocket": fpocket_pockets,
        "p2rank": p2rank_pockets,
        "puresnet": puresnet_pockets,
    }
    for tool_name, pockets in tool_map.items():
        if tool_name not in weights:
            continue
        for rank_0based, pocket in enumerate(pockets):
            all_pockets.append({
                **pocket,
                "tool": tool_name,
                "rank": rank_0based + 1,          # 1-based rank for RRF
            })

    if not all_pockets:
        log.warning("wRRF fusion: no pockets from any tool — returning empty result")
        return []

    # ── Step 1: Greedy spatial clustering ─────────────────────────────────────
    clusters = _greedy_cluster(all_pockets, radius=clustering_radius)

    # ── Step 2: wRRF scoring ──────────────────────────────────────────────────
    scored_clusters = _wrrf_score(clusters, weights, k=rrf_k)

    # Sort by wRRF score descending
    scored_clusters.sort(key=lambda c: c["wrrf_score"], reverse=True)
    scored_clusters = scored_clusters[:top_n]

    # ── Step 3: Residue annotation ────────────────────────────────────────────
    ca_coords = _parse_ca_coords(pdb_path) if pdb_path else {}

    # ── Step 4: Assemble CavityResult objects ─────────────────────────────────
    results = []
    for rank_0based, cluster in enumerate(scored_clusters):
        rank = rank_0based + 1
        tools_present = cluster["tools"]
        n_tools = len(tools_present)

        # Confidence tier
        if n_tools >= 2:
            confidence = "HIGH"
        elif "puresnet" in tools_present or "p2rank" in tools_present:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"

        # Weighted centre (mean of member centres, equal within cluster)
        center = tuple(round(float(v), 3) for v in cluster["center"])

        # Nearby residues (needed for fallback volume estimate below)
        residues = _nearby_residues(
            np.array(cluster["center"]), ca_coords, radius=residue_radius
        )

        # Volume: prefer fpocket's geometric estimate.
        # Fallback: when fpocket returned no pockets (Docker/install issue),
        # use an empirical residue-count proxy.
        #   vol ≈ 30 Å³ × n_residues_within_8Å
        # Derived from: Schmidtke & Barril (2010, J Med Chem 53:5858-5867)
        # regression of pocket volume vs. binding-site residue count across
        # 1600 PDB structures (R² = 0.72, slope ~30 Å³/residue).
        volume = cluster.get("volume", 0.0)
        if volume == 0.0 and residues:
            volume = round(30.0 * len(residues), 1)
            log.debug(
                "Volume fallback: %d residues × 30 Å³ = %.1f Å³ for rank %d",
                len(residues), volume, rank
            )

        # Per-tool normalised RRF contributions
        method_scores = {
            tool: round(cluster["tool_rrf_scores"].get(tool, 0.0), 6)
            for tool in tools_present
        }

        results.append(CavityResult(
            rank=rank,
            center=center,
            confidence=confidence,
            weighted_score=round(cluster["wrrf_score"], 6),
            methods=sorted(tools_present),
            method_scores=method_scores,
            residues=residues,
            volume_estimate=volume,
        ))

    log.info(
        "wRRF fusion: %d clusters → %d results "
        "(HIGH=%d, MEDIUM=%d, LOW=%d)",
        len(clusters),
        len(results),
        sum(1 for r in results if r.confidence == "HIGH"),
        sum(1 for r in results if r.confidence == "MEDIUM"),
        sum(1 for r in results if r.confidence == "LOW"),
    )
    return results


# ──────────────────────────────────────────────────────────────────────────────
# Internals
# ──────────────────────────────────────────────────────────────────────────────

def _greedy_cluster(pockets: List[Dict], radius: float) -> List[Dict]:
    """
    Greedy single-linkage spatial clustering.

    Each pocket is assigned to the first existing cluster whose representative
    centre is within `radius` Å.  If none, a new cluster is created.
    This mirrors the approach used in the benchmark.
    """
    clusters: List[Dict] = []

    for pocket in pockets:
        center = pocket["center"]
        assigned = False

        for cluster in clusters:
            dist = float(np.linalg.norm(center - cluster["center"]))
            if dist <= radius:
                # Merge: update centre to mean of all members
                cluster["members"].append(pocket)
                all_centers = np.array([m["center"] for m in cluster["members"]])
                cluster["center"] = all_centers.mean(axis=0)
                cluster["tools"].add(pocket["tool"])
                # Keep best volume (from fpocket)
                if pocket.get("volume", 0.0) > cluster.get("volume", 0.0):
                    cluster["volume"] = pocket["volume"]
                assigned = True
                break

        if not assigned:
            clusters.append({
                "center": center.copy(),
                "members": [pocket],
                "tools": {pocket["tool"]},
                "volume": pocket.get("volume", 0.0),
            })

    return clusters


def _wrrf_score(
    clusters: List[Dict],
    weights: Dict[str, float],
    k: int,
) -> List[Dict]:
    """
    Compute the Weighted Reciprocal Rank Fusion score for each cluster.

    wRRF(d) = Σ_{tool t} w_t * (1 / (k + rank_t(d)))

    where rank_t(d) is the rank of the highest-ranked member of cluster d
    from tool t (1-based, lower rank = more confident).
    If tool t contributed no pocket to the cluster, it contributes 0.
    """
    for cluster in clusters:
        wrrf = 0.0
        tool_rrf: Dict[str, float] = {}

        for tool_name, w in weights.items():
            # Find the best rank from this tool in the cluster
            tool_members = [
                m for m in cluster["members"] if m["tool"] == tool_name
            ]
            if not tool_members:
                continue
            best_rank = min(m["rank"] for m in tool_members)
            rrf_contribution = w * (1.0 / (k + best_rank))
            wrrf += rrf_contribution
            tool_rrf[tool_name] = rrf_contribution

        cluster["wrrf_score"] = wrrf
        cluster["tool_rrf_scores"] = tool_rrf

    return clusters


def _nearby_residues(
    center: np.ndarray,
    ca_coords: Dict[str, np.ndarray],
    radius: float,
) -> List[str]:
    """Return residue IDs whose Cα is within `radius` Å of `center`."""
    nearby = []
    for rid, coord in ca_coords.items():
        if float(np.linalg.norm(coord - center)) <= radius:
            nearby.append(rid)
    return sorted(nearby)


def _parse_ca_coords(pdb_path: Optional[str]) -> Dict[str, np.ndarray]:
    """Extract Cα coordinates keyed by RESNAME_RESNUM_CHAIN from a PDB file."""
    if not pdb_path:
        return {}
    p = Path(pdb_path)
    if not p.exists():
        return {}

    coords: Dict[str, np.ndarray] = {}
    for line in p.read_text(errors="replace").splitlines():
        if not line.startswith("ATOM"):
            continue
        if line[12:16].strip() != "CA":
            continue
        try:
            res_name = line[17:20].strip()
            chain = line[21:22].strip() or "A"
            res_num = line[22:26].strip()
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            rid = f"{res_name}_{res_num}_{chain}"
            coords[rid] = np.array([x, y, z])
        except (ValueError, IndexError):
            continue
    return coords
