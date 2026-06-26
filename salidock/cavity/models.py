"""
salidock.cavity.models — Data models for cavity detection results.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class CavityResult:
    """
    A single detected binding-site cavity, produced by the wRRF consensus pipeline.

    Attributes
    ----------
    rank : int
        1-based rank (1 = highest consensus score).
    center : tuple[float, float, float]
        Predicted pocket centre in Angstroms (x, y, z).
    confidence : str
        Qualitative confidence tier: "HIGH" | "MEDIUM" | "LOW".
        HIGH  → pocket found by ≥ 2 tools
        MEDIUM → found by 1 tool (PUResNet or P2Rank)
        LOW   → found by fpocket only
    weighted_score : float
        Final wRRF score (higher = more confident).
    methods : list[str]
        Tool names that contributed to this pocket
        (subset of {"fpocket", "p2rank", "puresnet"}).
    method_scores : dict[str, float]
        Per-tool normalised reciprocal rank score for this pocket.
        Keys present only for contributing tools.
    residues : list[str]
        Nearby Cα residue identifiers in "RESNAME_RESNUM_CHAIN" format,
        within 8 Å of the pocket centre.
    volume_estimate : float
        Estimated pocket volume in Å³ (from fpocket if available, else 0.0).
    """

    rank: int
    center: tuple
    confidence: str
    weighted_score: float
    methods: List[str] = field(default_factory=list)
    method_scores: Dict[str, float] = field(default_factory=dict)
    residues: List[str] = field(default_factory=list)
    volume_estimate: float = 0.0
