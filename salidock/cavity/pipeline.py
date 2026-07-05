"""
salidock.cavity.pipeline — CavityDetectionPipeline

Orchestrates parallel execution of fpocket, P2Rank, and PUResNetV2.0,
then fuses their predictions using the wRRF engine.
"""

from __future__ import annotations

import concurrent.futures
import logging
import time
from pathlib import Path
from typing import List, Optional

from .config import CavityConfig
from .models import CavityResult
from .runners import run_fpocket, run_p2rank, run_puresnet
from .fusion import fuse_predictions

log = logging.getLogger(__name__)


class CavityDetectionPipeline:
    """
    Consensus binding-site prediction pipeline.

    Runs fpocket, P2Rank, and PUResNetV2.0 in parallel, then fuses
    their ranked pocket lists using Weighted Reciprocal Rank Fusion
    (wRRF) with Bayesian-optimised weights.

    Usage
    -----
    ::

        from salidock.cavity import CavityDetectionPipeline, CavityConfig

        config = CavityConfig(output_dir=session_dir, top_n_pockets=10)
        pipe = CavityDetectionPipeline(config)
        results = pipe.detect_sync("protein.pdb")   # → list[CavityResult]

    Results are sorted by descending wRRF score (best pocket first).
    """

    def __init__(self, config: Optional[CavityConfig] = None):
        self.config = config or CavityConfig()
        self.last_run_metadata = None

    def detect_sync(self, pdb_path: str) -> List[CavityResult]:
        """
        Run the full consensus pipeline synchronously.

        Parameters
        ----------
        pdb_path : str
            Absolute path to the protein PDB file (must be HETATM-free
            / prepared).  PDB format only — PDBQT is NOT accepted.

        Returns
        -------
        list[CavityResult]
            Ranked cavity results, at most `config.top_n_pockets` entries.
        """
        pdb_path = str(pdb_path)
        cfg = self.config
        t0 = time.time()
        log.info("CavityDetectionPipeline.detect_sync: starting for %s", pdb_path)

        def _run_fpocket_helper():
            try:
                return run_fpocket(pdb_path, timeout_sec=cfg.fpocket_timeout_sec)
            except Exception as exc:
                log.error("fpocket runner error: %s", exc, exc_info=True)
                return []

        cascade_triggered = False
        tools_used = ["p2rank"]
        if cfg.use_puresnet:
            tools_used.append("puresnet")

        # ── Primary tools execution ──────────────────────────────────────────
        p2r_pockets, pur_pockets = self._run_primary_tools_parallel(pdb_path)
        fp_pockets = []
        dist = None

        # ── Cascade Check ────────────────────────────────────────────────────
        if not cfg.cascade_mode:
            log.info("Cascade mode disabled: running fpocket along with primary tools")
            fp_pockets = _run_fpocket_helper()
            tools_used.append("fpocket")
        else:
            agreement = False
            p2r_top1 = p2r_pockets[0] if p2r_pockets else None
            pur_top1 = pur_pockets[0] if pur_pockets else None

            if p2r_top1 and pur_top1:
                import numpy as np
                c_p2r = np.array(p2r_top1["center"])
                c_pur = np.array(pur_top1["center"])
                dist = float(np.linalg.norm(c_p2r - c_pur))
                log.info(
                    "Cascade check: P2Rank-PUResNet top-1 distance = %.2f Å (threshold = %.2f Å)",
                    dist, cfg.cascade_agreement_threshold_angstrom
                )
                if dist <= cfg.cascade_agreement_threshold_angstrom:
                    agreement = True
            else:
                log.info("Cascade check: one or both primary tools returned no pockets")

            if not agreement:
                log.info("Primary tools disagree or one failed -> Cascade triggered (running fpocket fallback)")
                cascade_triggered = True
                fp_pockets = _run_fpocket_helper()
                tools_used.append("fpocket")
            else:
                log.info("Primary tools agree -> Cascade NOT triggered (skipping fpocket)")

        n_fp  = len(fp_pockets)
        n_p2r = len(p2r_pockets)
        n_pur = len(pur_pockets)
        log.info(
            "Tool results: fpocket=%d, P2Rank=%d, PUResNet=%d pockets",
            n_fp, n_p2r, n_pur,
        )

        if n_fp == 0 and n_p2r == 0 and n_pur == 0:
            log.error("All tools returned zero pockets — check tool installation")
            self.last_run_metadata = {
                "cascade_triggered": cascade_triggered,
                "tools_used": tools_used,
                "p2rank_pockets_count": n_p2r,
                "puresnet_pockets_count": n_pur,
                "fpocket_pockets_count": n_fp,
                "p2rank_top1_center": list(p2r_pockets[0]["center"]) if p2r_pockets else None,
                "puresnet_top1_center": list(pur_pockets[0]["center"]) if pur_pockets else None,
                "fpocket_top1_center": list(fp_pockets[0]["center"]) if fp_pockets else None,
                "p2rank_puresnet_distance": dist,
                "elapsed_seconds": round(time.time() - t0, 3),
            }
            return []

        # ── wRRF Fusion ───────────────────────────────────────────────────────
        active_weights = {}
        if "p2rank" in tools_used:
            active_weights["p2rank"] = cfg.w_p2rank
        if "puresnet" in tools_used:
            active_weights["puresnet"] = cfg.w_puresnet
        if "fpocket" in tools_used:
            active_weights["fpocket"] = cfg.w_fpocket

        total_weight = sum(active_weights.values())
        if total_weight > 0:
            active_weights = {k: v / total_weight for k, v in active_weights.items()}

        results = fuse_predictions(
            fpocket_pockets=fp_pockets,
            p2rank_pockets=p2r_pockets,
            puresnet_pockets=pur_pockets,
            weights=active_weights,
            rrf_k=cfg.rrf_k,
            clustering_radius=cfg.clustering_radius_angstrom,
            residue_radius=cfg.residue_radius_angstrom,
            pdb_path=pdb_path,
            top_n=cfg.top_n_pockets,
        )

        elapsed = time.time() - t0
        log.info(
            "CavityDetectionPipeline finished: %d cavities in %.1f s",
            len(results), elapsed,
        )

        self.last_run_metadata = {
            "cascade_triggered": cascade_triggered,
            "tools_used": tools_used,
            "p2rank_pockets_count": n_p2r,
            "puresnet_pockets_count": n_pur,
            "fpocket_pockets_count": n_fp,
            "p2rank_top1_center": list(p2r_pockets[0]["center"]) if p2r_pockets else None,
            "puresnet_top1_center": list(pur_pockets[0]["center"]) if pur_pockets else None,
            "fpocket_top1_center": list(fp_pockets[0]["center"]) if fp_pockets else None,
            "p2rank_puresnet_distance": dist,
            "elapsed_seconds": round(elapsed, 3),
        }

        return results

    # ──────────────────────────────────────────────────────────────────────────

    def _run_primary_tools_parallel(self, pdb_path: str):
        """Run P2Rank and PUResNet concurrently; return their pocket lists."""
        cfg = self.config

        def _p2r():
            try:
                return run_p2rank(
                    pdb_path,
                    timeout_sec=cfg.timeout_sec,
                    p2rank_path=cfg.p2rank_path,
                )
            except Exception as exc:
                log.error("P2Rank runner error: %s", exc, exc_info=True)
                return []

        def _pur():
            if not cfg.use_puresnet:
                return []
            try:
                return run_puresnet(
                    pdb_path,
                    docker_image=cfg.puresnet_docker_image,
                    top_n=cfg.puresnet_top_n,
                    timeout_sec=cfg.timeout_sec,
                )
            except Exception as exc:
                log.error("PUResNet runner error: %s", exc, exc_info=True)
                return []

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            f_p2r = pool.submit(_p2r)
            f_pur = pool.submit(_pur)

            p2r_pockets = f_p2r.result()
            pur_pockets = f_pur.result()

        return p2r_pockets, pur_pockets
