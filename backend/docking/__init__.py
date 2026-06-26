"""
SALIDOCK Docking Pipeline Package
----------------------------------
Exports the public API surface:

    from docking import run_docking, select_engine, CavityMetadata,
                        DockingResult, DockingError, ConfidenceTier,
                        EngineChoice, ErrorCode
"""
from docking.models import (
    CavityMetadata,
    ConfidenceTier,
    DockingResult,
    DockingError,
    EngineChoice,
    ErrorCode,
)
from docking.router import select_engine
from docking.pipeline import run_docking

__all__ = [
    "run_docking",
    "select_engine",
    "CavityMetadata",
    "ConfidenceTier",
    "DockingResult",
    "DockingError",
    "EngineChoice",
    "ErrorCode",
]
