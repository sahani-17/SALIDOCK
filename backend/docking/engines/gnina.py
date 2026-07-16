"""
docking/engines/gnina.py
------------------------
GNINA 1.3 focused-docking engine runner for the SALIDOCK pipeline.

Engine configuration (fixed, per specification)
-----------------------------------------------
  --cnn_scoring   rescore      (re-score each Vina pose with CNN)
  --exhaustiveness 8           (Vina sampling depth)
  --num_modes      9           (output poses)
  --no_gpu                     (CPU-only; web server has no GPU)
  --cpu            1           (explicit single-CPU allocation)

Box-size calculation
---------------------
The search box is derived from the upstream cavity volume estimate:

    side_raw = volume_angstrom3 ** (1/3)       # cube-root of volume
    side     = clamp(side_raw, 12.0, 28.0)     # min 12 Å, max 28 Å
    box      = side + 2 * BOX_PADDING          # 4 Å padding on each face

Output parsing
--------------
GNINA writes an SDF file.  Each molecule record contains SD-property lines:

    > <minimizedAffinity>   → vina_affinity (kcal/mol)
    > <CNNscore>            → cnn_score
    > <CNNaffinity>         → cnn_affinity (kcal/mol)

Only the first molecule in the SDF (top-ranked pose) is returned.

Raises
------
Does NOT raise — all error conditions are expressed as (None, error_dict)
return values so the pipeline layer can build typed DockingError objects.
"""
from __future__ import annotations

import math
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GNINA_BIN:   str   = os.environ.get("GNINA_BIN", "gnina")

# Wall-clock timeout for GNINA focused docking.
# With exhaustiveness=4, num_modes=5, and --cpu 4, a ~500-residue protein
# typically finishes in 30-120 s.  600 s gives ample headroom for large
# receptors (>1000 residues) without indefinite hangs.
TIMEOUT_SEC: int   = 600

BOX_PADDING: float = 2.0          # Å added to each face of the search box (reduced from 4)
BOX_MIN:     float = 12.0         # Å minimum side length (before padding)
BOX_MAX:     float = 28.0         # Å maximum base side length (before padding)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _box_side_from_volume(volume_angstrom3: float) -> float:
    """Compute a cubic search-box side length (Å) from cavity volume."""
    raw  = max(volume_angstrom3, 1.0) ** (1.0 / 3.0)
    base = max(BOX_MIN, min(raw, BOX_MAX))
    return round(base + 2.0 * BOX_PADDING, 3)


def _extract_first_molecule_sdf(sdf_text: str) -> str:
    """
    Extract the first molecule record from a multi-molecule SDF string.
    Returns the record including the terminating '$$$$' line.
    """
    lines: list[str] = []
    for line in sdf_text.splitlines(keepends=True):
        lines.append(line)
        if line.strip() == "$$$$":
            return "".join(lines)
    # File has no $$$$ terminator — return everything (single molecule)
    return sdf_text


def _parse_sdf_property(sdf_text: str, tag: str) -> Optional[float]:
    """
    Parse a numeric SD property value from an SDF record.

    Looks for the pattern:
        > <TAG>
        <value>
    and returns the value as float, or None if not found / not parsable.
    """
    pattern = re.compile(
        r">\s*<" + re.escape(tag) + r">\s*\n([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)",
        re.MULTILINE,
    )
    match = pattern.search(sdf_text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def _is_valid_pdbqt(path: Path) -> bool:
    """
    Lightweight check: a valid PDBQT must exist, be non-empty, and contain
    at least one ATOM or HETATM record.
    """
    if not path.exists() or path.stat().st_size == 0:
        return False
    for line in path.read_text(errors="replace").splitlines():
        if line.startswith(("ATOM", "HETATM")):
            return True
    return False


# ---------------------------------------------------------------------------
# Public runner
# ---------------------------------------------------------------------------

def run_gnina(
    receptor_pdbqt: str,
    ligand_pdbqt:   str,
    center_x:       float,
    center_y:       float,
    center_z:       float,
    volume_angstrom3: float,
    size: Optional[tuple[float, float, float]] = None,
) -> tuple[Optional[dict], Optional[dict]]:
    """
    Run GNINA 1.3 focused docking and return the top-ranked pose.

    Parameters
    ----------
    receptor_pdbqt : str
        Absolute path to the prepared receptor PDBQT file.
    ligand_pdbqt : str
        Absolute path to the prepared ligand PDBQT file.
    center_x, center_y, center_z : float
        Cavity centre coordinates in Ångströms.
    volume_angstrom3 : float
        Upstream cavity volume estimate (used to size the search box).
    size : tuple of (sx, sy, sz) | None, optional
        Custom grid dimensions in Ångströms.

    Returns
    -------
    (result, None)
        On success. ``result`` is a dict with keys:
            top_pose_sdf    : str
            cnn_score       : float
            cnn_affinity    : float
            vina_affinity   : float

    (None, error)
        On failure. ``error`` is a dict with keys:
            error_code      : str  (matches ErrorCode enum value)
            message         : str
    """
    receptor_path = Path(receptor_pdbqt)
    ligand_path   = Path(ligand_pdbqt)

    # ── Error condition 1: binary not found ──────────────────────────────────
    if shutil.which(GNINA_BIN) is None:
        return None, {
            "error_code": "BINARY_NOT_FOUND",
            "message": (
                f"GNINA binary '{GNINA_BIN}' not found in PATH. "
                f"Ensure GNINA 1.3 is installed or set the GNINA_BIN "
                f"environment variable to the full executable path."
            ),
        }

    # ── Error condition 2: malformed / missing input files ───────────────────
    if not _is_valid_pdbqt(receptor_path):
        return None, {
            "error_code": "MALFORMED_INPUT",
            "message": (
                f"Receptor PDBQT file is missing, empty, or contains no "
                f"ATOM/HETATM records: '{receptor_pdbqt}'. "
                f"Re-prepare the receptor with AutoDockTools or Meeko."
            ),
        }
    if not _is_valid_pdbqt(ligand_path):
        return None, {
            "error_code": "MALFORMED_INPUT",
            "message": (
                f"Ligand PDBQT file is missing, empty, or contains no "
                f"ATOM/HETATM records: '{ligand_pdbqt}'. "
                f"Re-prepare the ligand with Meeko or AutoDockTools."
            ),
        }

    # ── Derive search box ────────────────--------------------------------────
    if size is not None:
        size_x, size_y, size_z = size
    else:
        box_side = _box_side_from_volume(volume_angstrom3)
        size_x = size_y = size_z = box_side

    # ── Run GNINA in an isolated temp directory ───────────────────────────────
    with tempfile.TemporaryDirectory(prefix="salidock_gnina_") as tmp:
        out_sdf = Path(tmp) / "gnina_out.sdf"

        cmd = [
            GNINA_BIN,
            "--receptor",       str(receptor_path),
            "--ligand",         str(ligand_path),
            "--center_x",       str(round(center_x, 4)),
            "--center_y",       str(round(center_y, 4)),
            "--center_z",       str(round(center_z, 4)),
            "--size_x",         str(size_x),
            "--size_y",         str(size_y),
            "--size_z",         str(size_z),
            "--cnn_scoring",    "rescore",
            "--exhaustiveness", "8",
            "--num_modes",      "9",
            "--no_gpu",                # CPU-only: mandatory on web server
            "--cpu",            "1",   # single-core per job; 5 jobs run concurrently
            "--out",            str(out_sdf),
        ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SEC,
            )
        except FileNotFoundError:
            # Binary disappeared between shutil.which check and subprocess call
            return None, {
                "error_code": "BINARY_NOT_FOUND",
                "message": (
                    f"GNINA binary '{GNINA_BIN}' could not be executed "
                    f"(FileNotFoundError). Verify installation."
                ),
            }
        except subprocess.TimeoutExpired as exc:
            # ── Error condition 3: timeout ────────────────────────────────────
            timeout_val = exc.timeout if exc.timeout is not None else TIMEOUT_SEC
            return None, {
                "error_code": "TIMEOUT",
                "message": (
                    f"GNINA job exceeded the {timeout_val}-second wall-clock "
                    f"limit and was terminated. "
                    f"Consider reducing exhaustiveness or box size."
                ),
            }

        # ── Detect malformed input from GNINA's stderr ────────────────────────
        if proc.returncode != 0:
            stderr_lower = (proc.stderr or "").lower()
            # GNINA emits "error" or "exception" on bad input files
            malformed_signals = ("error", "exception", "could not", "invalid", "failed to parse")
            if any(sig in stderr_lower for sig in malformed_signals):
                return None, {
                    "error_code": "MALFORMED_INPUT",
                    "message": (
                        f"GNINA rejected the input files (exit code {proc.returncode}). "
                        f"GNINA stderr: {proc.stderr.strip()[:400]}"
                    ),
                }
            # Generic non-zero exit
            return None, {
                "error_code": "MALFORMED_INPUT",
                "message": (
                    f"GNINA exited with code {proc.returncode}. "
                    f"Stderr: {proc.stderr.strip()[:400]}"
                ),
            }

        # ── Validate output SDF was produced ─────────────────────────────────
        if not out_sdf.exists() or out_sdf.stat().st_size == 0:
            return None, {
                "error_code": "MALFORMED_INPUT",
                "message": (
                    "GNINA completed successfully but produced an empty or "
                    "missing output SDF file. The ligand may have no valid "
                    "conformers within the specified search box."
                ),
            }

        sdf_text = out_sdf.read_text()

    # ── Extract top-ranked pose ───────────────────────────────────────────────
    top_pose_sdf = _extract_first_molecule_sdf(sdf_text)

    cnn_score    = _parse_sdf_property(top_pose_sdf, "CNNscore")
    cnn_affinity = _parse_sdf_property(top_pose_sdf, "CNNaffinity")
    vina_affinity = _parse_sdf_property(top_pose_sdf, "minimizedAffinity")

    if vina_affinity is None:
        return None, {
            "error_code": "MALFORMED_INPUT",
            "message": (
                "GNINA output SDF does not contain a 'minimizedAffinity' "
                "property in the top pose. The output may be truncated or "
                "the ligand may have failed to dock."
            ),
        }

    return {
        "top_pose_sdf":  top_pose_sdf,
        "cnn_score":     cnn_score,
        "cnn_affinity":  cnn_affinity,
        "vina_affinity": vina_affinity,
    }, None
