"""
docking/engines/quickvina.py
-----------------------------
QuickVina-W blind-docking engine runner for the SALIDOCK pipeline.

Design
------
QuickVina-W performs whole-protein blind docking.  The search box is
calculated by parsing all ATOM/HETATM coordinates in the receptor PDBQT,
computing a bounding box, and adding a fixed padding margin on each face.

Output format
-------------
QuickVina-W writes a PDBQT file with multiple MODEL/ENDMDL blocks; the
top-ranked pose is the first MODEL.  Scores appear in REMARK lines:

    REMARK VINA RESULT:   -7.500    0.000    0.000

The top pose is converted to SDF format using Open Babel (obabel).
If obabel is not available, a minimal SDF is synthesised from the PDBQT
ATOM coordinates so the pipeline always returns a valid SDF string.

CNN score / CNN affinity
------------------------
These are GNINA-specific outputs.  QuickVina-W does not compute them.
Both fields are set to None in the result dict and documented as such
in DockingResult.

Raises
------
Does NOT raise — all error conditions are returned as (None, error_dict).
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

QUICKVINA_BIN: str   = os.environ.get("QUICKVINA_BIN", "qvina-w")
TIMEOUT_SEC:   int   = 120          # Hard wall-clock limit (per specification)
BOX_PADDING:   float = 8.0          # Å added to each bounding-box face

# ---------------------------------------------------------------------------
# Bounding-box helpers
# ---------------------------------------------------------------------------

def _parse_receptor_coords(pdbqt_path: Path) -> Optional[np.ndarray]:
    """
    Parse all heavy-atom coordinates from a receptor PDBQT file.

    Returns an (N, 3) float array, or None if no coordinates are found.
    """
    coords: list[list[float]] = []
    for line in pdbqt_path.read_text(errors="replace").splitlines():
        if not line.startswith(("ATOM", "HETATM")):
            continue
        try:
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            coords.append([x, y, z])
        except (ValueError, IndexError):
            continue
    return np.array(coords, dtype=float) if coords else None


def _compute_blind_box(
    coords: np.ndarray,
    padding: float = BOX_PADDING,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    """
    Compute the centre and size of a blind docking search box that
    encloses the full receptor with ``padding`` Å on each face.

    Returns
    -------
    center : (cx, cy, cz)
    size   : (sx, sy, sz)  — always ≥ 20 Å on each axis
    """
    mn = coords.min(axis=0)
    mx = coords.max(axis=0)

    center = tuple(round(float((mn[i] + mx[i]) / 2.0), 4) for i in range(3))
    size   = tuple(
        round(float(max((mx[i] - mn[i]) + 2.0 * padding, 20.0)), 3)
        for i in range(3)
    )
    return center, size  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# PDBQT → SDF conversion
# ---------------------------------------------------------------------------

def _pdbqt_model_to_minimal_sdf(pdbqt_text: str, affinity: float) -> str:
    """
    Synthesise a minimal but valid SDF record from the first MODEL block of
    a PDBQT string.  Used as a fallback when obabel is unavailable.

    The V2000 MOL block will contain only atom-coordinate lines; bond
    connectivity is intentionally omitted (not derivable from PDBQT alone).
    The affinity is embedded as an SD property.

    This output is structurally valid SDF that most downstream tools can
    read, though bond information will be absent.
    """
    atom_lines: list[tuple[float, float, float, str]] = []
    in_model = False

    for line in pdbqt_text.splitlines():
        if line.startswith("MODEL"):
            in_model = True
            continue
        if line.startswith("ENDMDL"):
            break
        if in_model and line.startswith(("ATOM", "HETATM")):
            try:
                x       = float(line[30:38])
                y       = float(line[38:46])
                z       = float(line[46:54])
                element = line[76:78].strip() if len(line) >= 78 else "C"
                if not element:
                    element = line[13:15].strip()[:1] or "C"
                atom_lines.append((x, y, z, element))
            except (ValueError, IndexError):
                continue

    n_atoms = len(atom_lines)
    n_bonds = 0

    header  = "SaliDock_QuickVina_pose\n     RDKit\n\n"
    counts  = f"{n_atoms:3d}{n_bonds:3d}  0  0  0  0  0  0  0  0999 V2000\n"

    atom_block = ""
    for x, y, z, elem in atom_lines:
        atom_block += f"{x:10.4f}{y:10.4f}{z:10.4f} {elem:<3s} 0  0  0  0  0  0  0  0  0  0  0  0\n"

    props = (
        f"> <minimizedAffinity>\n{affinity:.4f}\n\n"
        f"> <CNNscore>\n\n"
        f"> <CNNaffinity>\n\n"
        f"> <engine>\nquickvina\n\n"
    )

    return header + counts + atom_block + "M  END\n" + props + "$$$$\n"


def _convert_pdbqt_to_sdf_obabel(pdbqt_path: Path, sdf_path: Path) -> bool:
    """
    Convert a PDBQT file to SDF using Open Babel.  Returns True on success.
    Only the first model (top-ranked pose) is converted.
    """
    if shutil.which("obabel") is None:
        return False
    try:
        proc = subprocess.run(
            [
                "obabel",
                str(pdbqt_path),
                "-isdf" if pdbqt_path.suffix.lower() == ".sdf" else "-ipdbqt",
                "-osdf",
                "-O", str(sdf_path),
                "-m",          # multi-model input
                "--firstonly",  # only first pose
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return proc.returncode == 0 and sdf_path.exists() and sdf_path.stat().st_size > 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


# ---------------------------------------------------------------------------
# Score parsing
# ---------------------------------------------------------------------------

def _parse_top_vina_score(pdbqt_text: str) -> Optional[float]:
    """
    Extract the top-ranked Vina score from a QuickVina-W PDBQT output.

    QuickVina-W writes REMARK lines of the form:
        REMARK VINA RESULT:    -7.500      0.000      0.000

    The first such REMARK (top-ranked model) is returned.
    """
    pattern = re.compile(
        r"^REMARK\s+VINA\s+RESULT:\s+([-+]?\d*\.?\d+)", re.MULTILINE
    )
    match = pattern.search(pdbqt_text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


# ---------------------------------------------------------------------------
# PDBQT validity check
# ---------------------------------------------------------------------------

def _is_valid_pdbqt(path: Path) -> bool:
    if not path.exists() or path.stat().st_size == 0:
        return False
    for line in path.read_text(errors="replace").splitlines():
        if line.startswith(("ATOM", "HETATM")):
            return True
    return False


# ---------------------------------------------------------------------------
# Public runner
# ---------------------------------------------------------------------------

def run_quickvina(
    receptor_pdbqt: str,
    ligand_pdbqt:   str,
    center: Optional[tuple[float, float, float]] = None,
    size: Optional[tuple[float, float, float]] = None,
) -> tuple[Optional[dict], Optional[dict]]:
    """
    Run QuickVina-W whole-protein blind docking or targeted docking and return the top pose.

    The search box is computed automatically from the receptor's atomic
    bounding box plus a fixed padding margin, unless manual center and size parameters
    are explicitly provided.

    Parameters
    ----------
    receptor_pdbqt : str
        Absolute path to the prepared receptor PDBQT file.
    ligand_pdbqt : str
        Absolute path to the prepared ligand PDBQT file.
    center : tuple of (x, y, z) | None, optional
        Custom center coordinates for targeted docking.
    size : tuple of (sx, sy, sz) | None, optional
        Custom size dimensions for targeted docking.

    Returns
    -------
    (result, None)
        On success. ``result`` dict keys:
            top_pose_sdf    : str
            cnn_score       : None  (not computed by QuickVina-W)
            cnn_affinity    : None  (not computed by QuickVina-W)
            vina_affinity   : float (kcal/mol)

    (None, error)
        On failure. ``error`` dict keys:
            error_code      : str
            message         : str
    """
    receptor_path = Path(receptor_pdbqt)
    ligand_path   = Path(ligand_pdbqt)

    # ── Error condition 1: binary not found ──────────────────────────────────
    if shutil.which(QUICKVINA_BIN) is None:
        return None, {
            "error_code": "BINARY_NOT_FOUND",
            "message": (
                f"QuickVina-W binary '{QUICKVINA_BIN}' not found in PATH. "
                f"Ensure QuickVina-W is installed or set the QUICKVINA_BIN "
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

    # ── Compute blind bounding box from receptor (unless manual parameters supplied) ────────────────
    if center is not None and size is not None:
        box_size = size
    else:
        coords = _parse_receptor_coords(receptor_path)
        if coords is None or len(coords) == 0:
            return None, {
                "error_code": "MALFORMED_INPUT",
                "message": (
                    "Could not extract any ATOM/HETATM coordinates from the "
                    f"receptor PDBQT file: '{receptor_pdbqt}'. "
                    "The file may be structurally invalid."
                ),
            }

        center, box_size = _compute_blind_box(coords)

    # ── Run QuickVina-W in an isolated temp directory ─────────────────────────
    with tempfile.TemporaryDirectory(prefix="salidock_qvinaw_") as tmp:
        out_pdbqt = Path(tmp) / "qvinaw_out.pdbqt"

        cmd = [
            QUICKVINA_BIN,
            "--receptor",       str(receptor_path),
            "--ligand",         str(ligand_path),
            "--center_x",       str(center[0]),
            "--center_y",       str(center[1]),
            "--center_z",       str(center[2]),
            "--size_x",         str(box_size[0]),
            "--size_y",         str(box_size[1]),
            "--size_z",         str(box_size[2]),
            "--exhaustiveness", "8",
            "--num_modes",      "9",
            "--out",            str(out_pdbqt),
        ]

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SEC,
            )
        except FileNotFoundError:
            return None, {
                "error_code": "BINARY_NOT_FOUND",
                "message": (
                    f"QuickVina-W binary '{QUICKVINA_BIN}' could not be "
                    f"executed (FileNotFoundError). Verify installation."
                ),
            }
        except subprocess.TimeoutExpired as exc:
            # ── Error condition 3: timeout ────────────────────────────────────
            timeout_val = exc.timeout if exc.timeout is not None else TIMEOUT_SEC
            return None, {
                "error_code": "TIMEOUT",
                "message": (
                    f"QuickVina-W job exceeded the {timeout_val}-second "
                    f"wall-clock limit and was terminated. "
                    f"Consider reducing protein size or exhaustiveness."
                ),
            }

        if proc.returncode != 0:
            stderr_lower = (proc.stderr or "").lower()
            malformed_signals = ("error", "exception", "invalid", "failed", "could not")
            if any(sig in stderr_lower for sig in malformed_signals):
                return None, {
                    "error_code": "MALFORMED_INPUT",
                    "message": (
                        f"QuickVina-W rejected the input files "
                        f"(exit code {proc.returncode}). "
                        f"Stderr: {proc.stderr.strip()[:400]}"
                    ),
                }
            return None, {
                "error_code": "MALFORMED_INPUT",
                "message": (
                    f"QuickVina-W exited with code {proc.returncode}. "
                    f"Stderr: {proc.stderr.strip()[:400]}"
                ),
            }

        if not out_pdbqt.exists() or out_pdbqt.stat().st_size == 0:
            return None, {
                "error_code": "MALFORMED_INPUT",
                "message": (
                    "QuickVina-W completed but produced an empty or missing "
                    "output PDBQT file. The ligand may have no valid poses "
                    "within the search box."
                ),
            }

        pdbqt_text  = out_pdbqt.read_text()
        vina_affinity = _parse_top_vina_score(pdbqt_text)

        if vina_affinity is None:
            return None, {
                "error_code": "MALFORMED_INPUT",
                "message": (
                    "Could not parse a Vina affinity score from the "
                    "QuickVina-W output PDBQT. The output may be malformed."
                ),
            }

        # ── Convert top pose to SDF ───────────────────────────────────────────
        sdf_path = Path(tmp) / "top_pose.sdf"
        converted = _convert_pdbqt_to_sdf_obabel(out_pdbqt, sdf_path)

        if converted:
            top_pose_sdf = sdf_path.read_text()
        else:
            # obabel unavailable — synthesise a minimal SDF from PDBQT atoms
            top_pose_sdf = _pdbqt_model_to_minimal_sdf(pdbqt_text, vina_affinity)

    return {
        "top_pose_sdf":  top_pose_sdf,
        "cnn_score":     None,   # QuickVina-W does not compute CNN scores
        "cnn_affinity":  None,   # QuickVina-W does not compute CNN affinity
        "vina_affinity": vina_affinity,
    }, None
