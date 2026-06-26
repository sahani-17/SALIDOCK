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

        # ── Run all three tools in parallel ───────────────────────────────────
        fp_pockets, p2r_pockets, pur_pockets = self._run_tools_parallel(pdb_path)

        n_fp  = len(fp_pockets)
        n_p2r = len(p2r_pockets)
        n_pur = len(pur_pockets)
        log.info(
            "Tool results: fpocket=%d, P2Rank=%d, PUResNet=%d pockets",
            n_fp, n_p2r, n_pur,
        )

        if n_fp == 0 and n_p2r == 0 and n_pur == 0:
            log.error("All tools returned zero pockets — check tool installation")
            return []

        # ── wRRF Fusion ───────────────────────────────────────────────────────
        results = fuse_predictions(
            fpocket_pockets=fp_pockets,
            p2rank_pockets=p2r_pockets,
            puresnet_pockets=pur_pockets,
            weights=cfg.effective_weights,
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
        return results

    # ──────────────────────────────────────────────────────────────────────────

    def _run_tools_parallel(self, pdb_path: str):
        """Run fpocket, P2Rank, PUResNet concurrently; return their pocket lists."""
        cfg = self.config

        def _fp():
            try:
                return run_fpocket(pdb_path, timeout_sec=cfg.fpocket_timeout_sec)
            except Exception as exc:
                log.error("fpocket runner error: %s", exc, exc_info=True)
                return []

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

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            f_fp  = pool.submit(_fp)
            f_p2r = pool.submit(_p2r)
            f_pur = pool.submit(_pur)

            fp_pockets  = f_fp.result()
            p2r_pockets = f_p2r.result()
            pur_pockets = f_pur.result()

        return fp_pockets, p2r_pockets, pur_pockets
