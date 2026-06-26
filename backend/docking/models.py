"""
docking/models.py
-----------------
All data classes, enumerations, and typed response objects for the
SALIDOCK molecular docking pipeline.

No runtime dependencies beyond the standard library.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class ConfidenceTier(str, Enum):
    """Confidence tier emitted by the upstream wRRF cavity detection pipeline."""
    HIGH   = "HIGH"
    MEDIUM = "MEDIUM"
    LOW    = "LOW"


class EngineChoice(str, Enum):
    """Docking engine selected by the routing function."""
    GNINA     = "gnina"
    QUICKVINA = "quickvina"


class ErrorCode(str, Enum):
    """Distinct error codes for the three explicitly handled failure modes."""
    BINARY_NOT_FOUND = "BINARY_NOT_FOUND"   # Engine executable missing from PATH
    MALFORMED_INPUT  = "MALFORMED_INPUT"    # Receptor or ligand PDBQT is invalid
    TIMEOUT          = "TIMEOUT"            # Job exceeded the 120-second wall-clock limit


# ---------------------------------------------------------------------------
# Input model
# ---------------------------------------------------------------------------

@dataclass
class CavityMetadata:
    """
    Metadata emitted by the upstream fpocket / P2Rank / PUResNet wRRF
    consensus cavity detection pipeline and consumed by the docking router.

    Attributes
    ----------
    tier : ConfidenceTier
        Confidence classification of the top-ranked cavity (HIGH / MEDIUM / LOW).
    volume_angstrom3 : float
        Estimated cavity volume in cubic Ångströms.
    center_x, center_y, center_z : float | None
        3D coordinates of the cavity centre in Ångströms.
        All three must be set for GNINA routing; None triggers blind docking.
    """
    tier:              ConfidenceTier
    volume_angstrom3:  float
    center_x:          Optional[float] = None
    center_y:          Optional[float] = None
    center_z:          Optional[float] = None

    @property
    def has_coordinates(self) -> bool:
        """True only when all three centre coordinates are non-None numbers."""
        return (
            self.center_x is not None
            and self.center_y is not None
            and self.center_z is not None
        )


# ---------------------------------------------------------------------------
# Success response
# ---------------------------------------------------------------------------

@dataclass
class DockingResult:
    """
    Structured response returned on successful docking completion.

    All six fields are always present in the object.  For QuickVina-W jobs,
    ``cnn_score`` and ``cnn_affinity`` are ``None`` — those scores are
    GNINA-specific and are never fabricated for non-GNINA runs.

    Attributes
    ----------
    top_pose_sdf : str
        SDF-format string of the top-ranked docked pose.
    cnn_score : float | None
        GNINA CNN score for the top pose (None for QuickVina-W).
    cnn_affinity : float | None
        GNINA CNN affinity in kcal/mol for the top pose (None for QuickVina-W).
    vina_affinity : float
        Vina-minimised binding affinity in kcal/mol (available from both engines).
    engine_used : EngineChoice
        The engine that produced this result.
    routing_reason : str
        Human-readable explanation of the engine selection decision.
    """
    top_pose_sdf:   str
    cnn_score:      Optional[float]   # None for QuickVina-W runs
    cnn_affinity:   Optional[float]   # None for QuickVina-W runs
    vina_affinity:  float
    engine_used:    EngineChoice
    routing_reason: str


# ---------------------------------------------------------------------------
# Error response
# ---------------------------------------------------------------------------

@dataclass
class DockingError:
    """
    Structured error returned on any of the three explicitly handled failures.

    Attributes
    ----------
    error_code : ErrorCode
        Machine-readable error category (BINARY_NOT_FOUND / MALFORMED_INPUT /
        TIMEOUT).
    message : str
        Human-readable description of the specific failure.
    engine_attempted : EngineChoice | None
        The engine that was selected before the failure occurred.
    routing_reason : str
        The routing decision that was made before the error was encountered.
    """
    error_code:        ErrorCode
    message:           str
    engine_attempted:  Optional[EngineChoice]
    routing_reason:    str
