"""
docking/pipeline.py
-------------------
Main orchestrator for the SALIDOCK molecular docking pipeline.

Public entry point
------------------
    result = run_docking(receptor_pdbqt, ligand_pdbqt, cavity_metadata)

``result`` is always either a ``DockingResult`` (success) or a
``DockingError`` (failure) — never an unhandled exception.

Flow
----
    1. Call select_engine(cavity_metadata)  →  (engine, reason)
    2. Dispatch to run_gnina() or run_quickvina()
    3. Map the engine's (result, error) tuple to a typed DockingResult
       or DockingError and return it.

Error mapping
-------------
    BINARY_NOT_FOUND  ←  engine returns error_code == "BINARY_NOT_FOUND"
    MALFORMED_INPUT   ←  engine returns error_code == "MALFORMED_INPUT"
    TIMEOUT           ←  engine returns error_code == "TIMEOUT"
"""
from __future__ import annotations

import logging
from typing import Union

from docking.engines.gnina     import run_gnina
from docking.engines.quickvina import run_quickvina
from docking.models import (
    CavityMetadata,
    DockingError,
    DockingResult,
    EngineChoice,
    ErrorCode,
)
from docking.router import select_engine

log = logging.getLogger(__name__)


def run_docking(
    receptor_pdbqt: str,
    ligand_pdbqt:   str,
    cavity_metadata: CavityMetadata,
    size: Optional[tuple[float, float, float]] = None,
) -> Union[DockingResult, DockingError]:
    """
    Run the SALIDOCK docking pipeline for a single receptor–ligand pair.

    This is the only function that external code needs to call.  It handles
    engine selection, dispatch, error mapping, and response construction.

    Parameters
    ----------
    receptor_pdbqt : str
        Absolute path to the prepared receptor PDBQT file.
    ligand_pdbqt : str
        Absolute path to the prepared ligand PDBQT file.
    cavity_metadata : CavityMetadata
        Metadata from the upstream wRRF consensus cavity detection pipeline
        (confidence tier, volume, and optional centre coordinates).
    size : tuple of (sx, sy, sz) | None, optional
        Custom grid dimensions in Ångströms (used for manual active-site mode).

    Returns
    -------
    DockingResult
        On success.  All six fields are populated; ``cnn_score`` and
        ``cnn_affinity`` are None for QuickVina-W runs.
    DockingError
        On any of the three handled failure modes:
        BINARY_NOT_FOUND, MALFORMED_INPUT, or TIMEOUT.

    Examples
    --------
    GNINA focused-docking job:

    >>> from docking import run_docking, CavityMetadata, ConfidenceTier
    >>> meta = CavityMetadata(
    ...     tier=ConfidenceTier.HIGH,
    ...     volume_angstrom3=450.0,
    ...     center_x=12.3, center_y=44.1, center_z=-8.0,
    ... )
    >>> result = run_docking("receptor.pdbqt", "ligand.pdbqt", meta)
    >>> isinstance(result, DockingResult)
    True

    QuickVina-W blind-docking job (LOW confidence):

    >>> meta_low = CavityMetadata(
    ...     tier=ConfidenceTier.LOW,
    ...     volume_angstrom3=300.0,
    ... )
    >>> result = run_docking("receptor.pdbqt", "ligand.pdbqt", meta_low)
    """
    # ── Step 1: Routing decision ──────────────────────────────────────────────
    engine, routing_reason = select_engine(cavity_metadata)
    log.info("[docking] engine=%s reason=%r", engine.value, routing_reason)

    # ── Step 2: Dispatch to the selected engine ───────────────────────────────
    if engine == EngineChoice.GNINA:
        raw_result, raw_error = run_gnina(
            receptor_pdbqt   = receptor_pdbqt,
            ligand_pdbqt     = ligand_pdbqt,
            center_x         = cavity_metadata.center_x,   # type: ignore[arg-type]
            center_y         = cavity_metadata.center_y,   # type: ignore[arg-type]
            center_z         = cavity_metadata.center_z,   # type: ignore[arg-type]
            volume_angstrom3 = cavity_metadata.volume_angstrom3,
            size             = size,
        )
    else:  # EngineChoice.QUICKVINA
        center = (
            cavity_metadata.center_x,
            cavity_metadata.center_y,
            cavity_metadata.center_z,
        ) if cavity_metadata.has_coordinates else None
        raw_result, raw_error = run_quickvina(
            receptor_pdbqt = receptor_pdbqt,
            ligand_pdbqt   = ligand_pdbqt,
            center         = center, # type: ignore[arg-type]
            size           = size,
        )

    # ── Step 3: Map to typed response ────────────────────────────────────────
    if raw_error is not None:
        log.warning(
            "[docking] %s failed: code=%s msg=%r",
            engine.value, raw_error["error_code"], raw_error["message"],
        )
        return DockingError(
            error_code       = ErrorCode(raw_error["error_code"]),
            message          = raw_error["message"],
            engine_attempted = engine,
            routing_reason   = routing_reason,
        )

    log.info(
        "[docking] %s succeeded: vina_affinity=%.3f kcal/mol",
        engine.value, raw_result["vina_affinity"],
    )
    return DockingResult(
        top_pose_sdf   = raw_result["top_pose_sdf"],
        cnn_score      = raw_result["cnn_score"],
        cnn_affinity   = raw_result["cnn_affinity"],
        vina_affinity  = raw_result["vina_affinity"],
        engine_used    = engine,
        routing_reason = routing_reason,
    )
