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

    # ── Cascade parameters ───────────────────────────────────────────────────────
    cascade_mode: bool = True
    cascade_agreement_threshold_angstrom: float = 6.0
    weights_json_path: Optional[str] = None

    def __post_init__(self):
        if self.output_dir is not None:
            self.output_dir = Path(self.output_dir)
        else:
            import tempfile
            self.output_dir = Path(tempfile.gettempdir()) / "salidock_cavity"
            self.output_dir.mkdir(exist_ok=True, parents=True)

        if self.fpocket_timeout_sec is None:
            self.fpocket_timeout_sec = self.timeout_sec

        # Load weights and cascade settings dynamically if weights.json is found
        resolved_weights_path = None
        if self.weights_json_path:
            resolved_weights_path = Path(self.weights_json_path)
        else:
            # Try to auto-detect relative to project root
            try:
                project_root = Path(__file__).resolve().parent.parent.parent
                candidate = project_root / "backend" / "config" / "weights.json"
                if candidate.exists():
                    resolved_weights_path = candidate
            except Exception:
                pass
            
            if not resolved_weights_path:
                # Also check current working directory / backend / config / weights.json
                candidate = Path.cwd() / "backend" / "config" / "weights.json"
                if candidate.exists():
                    resolved_weights_path = candidate

        if resolved_weights_path and resolved_weights_path.exists():
            try:
                import json
                with open(resolved_weights_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                # Update weights
                w_data = data.get("weights", {})
                if "fpocket" in w_data:
                    self.w_fpocket = float(w_data["fpocket"])
                if "p2rank" in w_data:
                    self.w_p2rank = float(w_data["p2rank"])
                if "puresnet" in w_data:
                    self.w_puresnet = float(w_data["puresnet"])
                
                # Update other cascade / clustering settings
                if "cascade_mode" in data:
                    self.cascade_mode = bool(data["cascade_mode"])
                if "cascade_agreement_threshold_angstrom" in data:
                    self.cascade_agreement_threshold_angstrom = float(data["cascade_agreement_threshold_angstrom"])
                if "rrf_k" in data:
                    self.rrf_k = int(data["rrf_k"])
                if "clustering_radius_angstrom" in data:
                    self.clustering_radius_angstrom = float(data["clustering_radius_angstrom"])
                
                import logging
                logging.getLogger(__name__).info(f"Loaded config from {resolved_weights_path}")
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Failed to load config from {resolved_weights_path}: {e}")

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
