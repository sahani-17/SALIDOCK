"""
salidock.cavity.config — Pipeline configuration.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class CavityConfig:
    """
    Configuration for the CavityDetectionPipeline.

    Attributes
    ----------
    output_dir : Path
        Directory for intermediate outputs (fpocket _out/, P2Rank CSVs, etc.).
        Defaults to the system temp directory.
    top_n_pockets : int
        Maximum number of ranked cavities to return. Default 50.
    timeout_sec : int
        Per-tool subprocess timeout in seconds. Default 300.

    # ── Fusion parameters (do NOT change — determined by Bayesian optimisation) ──
    w_fpocket : float
        wRRF weight for fpocket. Bayesian-optimised value: 0.0947.
    w_p2rank : float
        wRRF weight for P2Rank.  Bayesian-optimised value: 0.4054.
    w_puresnet : float
        wRRF weight for PUResNetV2.0. Bayesian-optimised value: 0.4999.
    rrf_k : int
        RRF stabilising constant. Default 60.
    clustering_radius_angstrom : float
        Greedy spatial clustering radius in Å. Default 6.0.
    residue_radius_angstrom : float
        Radius for collecting nearby residues around pocket centre. Default 8.0.

    # ── Tool paths ──
    p2rank_path : str
        Path to the P2Rank executable (prank script). Auto-detected if None.
    puresnet_docker_image : str
        Docker image tag for PUResNetV2.0. Default "jivankandel/puresnet:latest".
    puresnet_top_n : int
        Number of top pockets to request from PUResNetV2.0. Default 10.
    fpocket_timeout_sec : int
        fpocket-specific timeout. Falls back to timeout_sec if None.
    use_puresnet : bool
        Whether to include PUResNetV2.0. Set False if Docker unavailable.
        When False, weights are renormalised between fpocket and P2Rank.
    """

    output_dir: Optional[Path] = None
    top_n_pockets: int = 5
    timeout_sec: int = 300

    # ── Fusion parameters (Bayesian-optimised — do not change) ──────────────────
    w_fpocket: float = 0.0947
    w_p2rank: float = 0.4054
    w_puresnet: float = 0.4999
    rrf_k: int = 60
    clustering_radius_angstrom: float = 6.0
    residue_radius_angstrom: float = 8.0

    # ── Tool paths ───────────────────────────────────────────────────────────────
    p2rank_path: Optional[str] = None        # auto-detected if None

    # Use the CPU-fixed image (salidock-puresnet-cpu) instead of the upstream
    # jivankandel/puresnet image which has broken residue SDF files in CPU mode.
    # Build with: docker build -f backend/puresnet_cpu.Dockerfile -t salidock-puresnet-cpu:latest .
    puresnet_docker_image: str = "salidock-puresnet-cpu:latest"
    puresnet_top_n: int = 10
    fpocket_timeout_sec: Optional[int] = None

    # PUResNet enabled — uses salidock-puresnet-cpu:latest (CPU-fixed image).
    # Root cause was residues/ dir empty in upstream image (pip reinstall fixes it).
    # Build: docker build -f backend/puresnet_cpu.Dockerfile -t salidock-puresnet-cpu:latest .
    use_puresnet: bool = True

    def __post_init__(self):
        if self.output_dir is not None:
            self.output_dir = Path(self.output_dir)
        else:
            import tempfile
            self.output_dir = Path(tempfile.gettempdir()) / "salidock_cavity"
            self.output_dir.mkdir(exist_ok=True, parents=True)

        if self.fpocket_timeout_sec is None:
            self.fpocket_timeout_sec = self.timeout_sec

    @property
    def effective_weights(self) -> dict:
        """Return the active tool weights, renormalised if PUResNet is disabled."""
        if self.use_puresnet:
            return {
                "fpocket": self.w_fpocket,
                "p2rank": self.w_p2rank,
                "puresnet": self.w_puresnet,
            }
        # Renormalise between fpocket and p2rank
        total = self.w_fpocket + self.w_p2rank
        return {
            "fpocket": self.w_fpocket / total,
            "p2rank": self.w_p2rank / total,
        }
