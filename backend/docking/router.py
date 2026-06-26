"""
docking/router.py
-----------------
Standalone engine-selection function for the SALIDOCK docking pipeline.

Rules (applied in evaluation order):
  1. No pocket coordinates         → QuickVina-W  (blind docking)
  2. Cavity tier is LOW            → QuickVina-W  (low-confidence, blind)
  3. Cavity volume > 1000 Å³       → QuickVina-W  (pocket too large for focused dock)
  4. All other cases               → GNINA        (focused, high-confidence dock)

The function is intentionally pure (no I/O, no side-effects) to allow fast
unit testing and downstream caching.
"""
from __future__ import annotations

from docking.models import CavityMetadata, ConfidenceTier, EngineChoice

# Volume threshold above which the pocket is considered too large for a
# focused GNINA search box and blind docking is preferred instead.
#
# Scientific basis:
#   Schmidtke & Barril (2010, J Med Chem) define the upper bound of
#   druggable cavities at ~1000 Å³ for classical drug-like sites.
#   However, allosteric sites and macromolecule-interaction interfaces
#   can reach 1500–2500 Å³ and remain focally dockable (Kozakov et al.,
#   2015; Surade & Bhatt, 2012).  2000 Å³ corresponds to a cube-root
#   side of ~12.6 Å → GNINA box ~20.6 Å, well within reliable sampling.
#   Pockets > 2000 Å³ produce boxes > 20.6 Å base side; blind docking
#   (QuickVina-W) is more appropriate for such large surface regions.
_VOLUME_THRESHOLD_ANG3: float = 2000.0


def select_engine(cavity: CavityMetadata) -> tuple[EngineChoice, str]:
    """
    Determine which docking engine to use based on upstream cavity metadata.

    Parameters
    ----------
    cavity : CavityMetadata
        Metadata from the wRRF consensus cavity detection pipeline.

    Returns
    -------
    engine : EngineChoice
        ``EngineChoice.GNINA`` or ``EngineChoice.QUICKVINA``.
    reason : str
        Human-readable explanation of the routing decision.  This string is
        included verbatim in both ``DockingResult.routing_reason`` and
        ``DockingError.routing_reason``.

    Examples
    --------
    >>> from docking.models import CavityMetadata, ConfidenceTier
    >>> meta = CavityMetadata(tier=ConfidenceTier.HIGH,
    ...                       volume_angstrom3=450.0,
    ...                       center_x=12.3, center_y=44.1, center_z=-8.0)
    >>> engine, reason = select_engine(meta)
    >>> engine
    <EngineChoice.GNINA: 'gnina'>

    >>> meta_low = CavityMetadata(tier=ConfidenceTier.LOW,
    ...                           volume_angstrom3=300.0)
    >>> engine, reason = select_engine(meta_low)
    >>> engine
    <EngineChoice.QUICKVINA: 'quickvina'>
    """
    # Rule 1 — Missing coordinates: cannot perform focused docking
    if not cavity.has_coordinates:
        return (
            EngineChoice.QUICKVINA,
            "No valid pocket coordinates available; "
            "routing to QuickVina-W for whole-protein blind docking.",
        )

    # Rule 2 — LOW confidence tier: pocket localisation is unreliable
    if cavity.tier == ConfidenceTier.LOW:
        return (
            EngineChoice.QUICKVINA,
            f"Cavity confidence tier is LOW; focused docking is unreliable "
            f"at this confidence level — routing to QuickVina-W for blind docking.",
        )

    # Rule 3 — Volume exceeds threshold: search box would be too large for GNINA
    if cavity.volume_angstrom3 > _VOLUME_THRESHOLD_ANG3:
        return (
            EngineChoice.QUICKVINA,
            f"Cavity volume {cavity.volume_angstrom3:.1f} Å³ exceeds the "
            f"{_VOLUME_THRESHOLD_ANG3:.0f} Å³ threshold; "
            f"routing to QuickVina-W for blind docking.",
        )

    # Rule 4 — All conditions satisfied: run GNINA focused docking
    return (
        EngineChoice.GNINA,
        f"Cavity confidence tier is {cavity.tier.value}, "
        f"volume is {cavity.volume_angstrom3:.1f} Å³ "
        f"(≤ {_VOLUME_THRESHOLD_ANG3:.0f} Å³), "
        f"and pocket coordinates ({cavity.center_x:.2f}, "
        f"{cavity.center_y:.2f}, {cavity.center_z:.2f}) are available; "
        f"routing to GNINA for focused docking.",
    )
