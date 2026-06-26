"""
salidock.cavity.runners — Individual tool runners.

Each runner returns a list of dicts with keys:
    center    : np.ndarray shape (3,)
    score     : float  (raw tool-specific score, higher = better)
    volume    : float  (Å³, 0.0 if not available)

Pockets are already sorted highest-score-first before returning.
"""

from __future__ import annotations

import csv
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import List, Dict, Optional

import numpy as np

log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# fpocket
# ──────────────────────────────────────────────────────────────────────────────

def run_fpocket(pdb_path: str, timeout_sec: int = 120) -> List[Dict]:
    """
    Run fpocket on a PDB file and parse pocket centres + druggability scores.

    fpocket writes output to <basename>_out/<basename>_info.txt in the
    directory containing the PDB file.  We run fpocket in a dedicated
    temporary directory to avoid polluting the session workspace.
    """
    pdb_path = Path(pdb_path)
    if not pdb_path.exists():
        log.error("fpocket: PDB file not found: %s", pdb_path)
        return []

    try:
        # Run fpocket in a temp dir so outputs don't clutter the session dir
        with tempfile.TemporaryDirectory(prefix="fpocket_") as tmpdir:
            tmp_pdb = Path(tmpdir) / pdb_path.name
            shutil.copy2(pdb_path, tmp_pdb)

            result = subprocess.run(
                ["fpocket", "-f", str(tmp_pdb)],
                capture_output=True,
                text=True,
                timeout=timeout_sec,
                cwd=tmpdir,
            )

            if result.returncode != 0:
                log.warning(
                    "fpocket returned non-zero exit %d for %s: %s",
                    result.returncode, pdb_path.name, result.stderr[:500]
                )

            pdb_stem = pdb_path.stem
            out_dir = Path(tmpdir) / f"{pdb_stem}_out"
            info_file = out_dir / f"{pdb_stem}_info.txt"

            if not info_file.exists():
                log.warning("fpocket: info file not found: %s", info_file)
                return []

            return _parse_fpocket_info(info_file)

    except subprocess.TimeoutExpired:
        log.error("fpocket timed out after %d s for %s", timeout_sec, pdb_path.name)
        return []
    except FileNotFoundError:
        log.error("fpocket not found in PATH — skipping fpocket")
        return []
    except Exception as exc:
        log.error("fpocket failed for %s: %s", pdb_path.name, exc, exc_info=True)
        return []


def _parse_fpocket_info(info_file: Path) -> List[Dict]:
    """Parse fpocket output into pocket dicts.

    fpocket v3 and earlier wrote 'x center : N' lines in the info file.
    fpocket v4+ removed those lines — center coordinates are now stored
    in the per-pocket PDB files inside the pockets/ subdirectory.

    Strategy (version-agnostic):
      1. Parse info.txt for rank, Druggability Score, Volume (no coords)
      2. For each pocket, try to read  pockets/pocket{N}_vert.pdb
         (alpha-sphere vertices) and compute centroid
      3. Fall back to pockets/pocket{N}_atm.pdb (nearby protein atoms)
      4. If info.txt DOES have 'x center :' lines (v3), use those instead
    """
    content = info_file.read_text(errors="replace")
    blocks = re.split(r"(?=Pocket\s+\d+)", content)

    # pockets/ directory sits alongside the info.txt file
    pockets_dir = info_file.parent / "pockets"

    pockets = []
    for block in blocks:
        block = block.strip()
        if not block.startswith("Pocket"):
            continue

        # Pocket rank number
        rank_m = re.match(r"Pocket\s+(\d+)", block)
        if not rank_m:
            continue
        rank = int(rank_m.group(1))

        # Scores and volume from info.txt
        ds_m  = re.search(r"(?i)Druggability Score\s*:\s*([-\d.]+)", block)
        vol_m = re.search(r"(?i)Volume\s*:\s*([-\d.]+)", block)
        score  = float(ds_m.group(1))  if ds_m  else 0.0
        volume = float(vol_m.group(1)) if vol_m else 0.0

        # ── Try v3-style center lines first ────────────────────────────
        x_m = re.search(r"(?i)x\s+center\s*:\s*([-\d.]+)", block)
        y_m = re.search(r"(?i)y\s+center\s*:\s*([-\d.]+)", block)
        z_m = re.search(r"(?i)z\s+center\s*:\s*([-\d.]+)", block)

        if x_m and y_m and z_m:
            center = np.array([float(x_m.group(1)),
                               float(y_m.group(1)),
                               float(z_m.group(1))])
        else:
            # ── v4+: compute centroid from pocket PDB files ─────────────
            center = _fpocket_pocket_centroid(pockets_dir, rank)
            if center is None:
                log.debug("fpocket: no center found for pocket %d — skipping", rank)
                continue

        pockets.append({
            "center": center,
            "score":  score,
            "volume": volume,
        })

    pockets.sort(key=lambda p: p["score"], reverse=True)
    log.info("fpocket: %d pockets parsed from %s", len(pockets), info_file.name)
    return pockets


def _fpocket_pocket_centroid(pockets_dir: Path, rank: int) -> Optional[np.ndarray]:
    """
    Compute centroid of alpha-sphere vertices for fpocket pocket N.

    fpocket v4+ writes:
      pockets/pocket<N>_vert.pdb  — alpha-sphere dummy atoms (ATOM/HETATM STP)
      pockets/pocket<N>_atm.pdb   — nearby protein atoms

    The vert.pdb centroid is the best geometric centre of the pocket.
    We fall back to atm.pdb if vert.pdb is missing.
    """
    for suffix in (f"pocket{rank}_vert.pdb", f"pocket{rank}_atm.pdb"):
        pdb_file = pockets_dir / suffix
        if not pdb_file.exists():
            continue
        coords = []
        for line in pdb_file.read_text(errors="replace").splitlines():
            if line.startswith(("ATOM", "HETATM")):
                try:
                    coords.append([float(line[30:38]),
                                   float(line[38:46]),
                                   float(line[46:54])])
                except (ValueError, IndexError):
                    continue
        if coords:
            return np.mean(coords, axis=0)

    return None


# ──────────────────────────────────────────────────────────────────────────────
# P2Rank
# ──────────────────────────────────────────────────────────────────────────────

def _find_p2rank(p2rank_path: Optional[str] = None) -> Optional[str]:
    """Locate the P2Rank executable (prank script or .sh)."""
    if p2rank_path and Path(p2rank_path).exists():
        return p2rank_path

    # Try common locations relative to the backend directory
    backend_dir = Path(__file__).resolve().parent.parent.parent / "backend"
    candidates = [
        backend_dir / "p2rank_2.4.2" / "prank",
        backend_dir / "p2rank_2.4.2" / "prank.sh",
        backend_dir / "p2rank_2.4.2" / "prank.bat",
        Path("/usr/local/bin/prank"),
    ]
    for c in candidates:
        if c.exists():
            return str(c)

    # Fall back to PATH
    found = shutil.which("prank")
    return found  # may be None


def run_p2rank(
    pdb_path: str,
    timeout_sec: int = 120,
    p2rank_path: Optional[str] = None,
) -> List[Dict]:
    """
    Run P2Rank on a PDB file and parse pocket centres + probability scores.

    P2Rank output CSV has columns:
        rank, score, probability, sas_points, surf_atoms,
        center_x, center_y, center_z, residue_ids, ...
    Rows are already sorted by rank (ascending = better).
    """
    pdb_path = Path(pdb_path)
    if not pdb_path.exists():
        log.error("P2Rank: PDB not found: %s", pdb_path)
        return []

    exe = _find_p2rank(p2rank_path)
    if not exe:
        log.error("P2Rank executable not found — skipping P2Rank")
        return []

    try:
        with tempfile.TemporaryDirectory(prefix="p2rank_") as tmpdir:
            out_dir = Path(tmpdir) / "output"
            out_dir.mkdir()

            if os.name == "nt" and exe.lower().endswith(".bat"):
                cmd = ["cmd.exe", "/c", exe, "predict", "-f", str(pdb_path), "-o", str(out_dir)]
            else:
                cmd = [exe, "predict", "-f", str(pdb_path), "-o", str(out_dir)]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_sec,
            )

            if result.returncode != 0:
                log.warning(
                    "P2Rank returned non-zero exit %d for %s: %s",
                    result.returncode, pdb_path.name, result.stderr[:500]
                )

            # Find the predictions CSV: <pdbname>.pdb_predictions.csv
            csv_files = list(out_dir.rglob("*_predictions.csv"))
            if not csv_files:
                log.warning("P2Rank: no predictions CSV found in %s", out_dir)
                return []

            return _parse_p2rank_csv(csv_files[0])

    except subprocess.TimeoutExpired:
        log.error("P2Rank timed out after %d s for %s", timeout_sec, pdb_path.name)
        return []
    except Exception as exc:
        log.error("P2Rank failed for %s: %s", pdb_path.name, exc, exc_info=True)
        return []


def _parse_p2rank_csv(csv_path: Path) -> List[Dict]:
    """Parse a P2Rank *_predictions.csv file into pocket dicts."""
    pockets = []
    try:
        with open(csv_path, newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                try:
                    # Column names may have leading spaces — strip them
                    def get(key):
                        for k, v in row.items():
                            if k.strip() == key:
                                return v
                        return None

                    cx = get("center_x")
                    cy = get("center_y")
                    cz = get("center_z")
                    score = get("score")
                    prob  = get("probability")

                    if cx is None or cy is None or cz is None:
                        continue

                    # Use probability as ranking score (0–1); fall back to score
                    rank_score = float(prob) if prob else float(score) if score else 0.0

                    pockets.append({
                        "center": np.array([float(cx), float(cy), float(cz)]),
                        "score": rank_score,
                        "volume": 0.0,
                    })
                except (ValueError, TypeError):
                    continue
    except Exception as exc:
        log.error("P2Rank CSV parse error: %s", exc)
        return []

    # P2Rank CSV is already sorted by rank ascending — reverse to get
    # highest-confidence first (we store by descending score)
    pockets.sort(key=lambda p: p["score"], reverse=True)
    log.info("P2Rank: %d pockets parsed from %s", len(pockets), csv_path.name)
    return pockets


# ──────────────────────────────────────────────────────────────────────────────
# PUResNetV2.0 (via Docker)
# ──────────────────────────────────────────────────────────────────────────────

# Standard 20 amino acid codes that PUResNet's residue SDF library covers.
_STANDARD_RESIDUES = frozenset({
    "ALA","ARG","ASN","ASP","CYS","GLN","GLU","GLY","HIS","ILE",
    "LEU","LYS","MET","PHE","PRO","SER","THR","TRP","TYR","VAL",
})


def _sanitise_pdb_for_puresnet(pdb_path: Path) -> Path:
    """
    Write a PUResNet-safe copy of the PDB: only ATOM records for the 20
    standard amino acids.  PUResNet's residue_h.get_residue() raises
    StopIteration for any residue whose SDF template is missing from its
    library, which includes all HETATM records, modified residues, and
    non-standard amino acids.

    The sanitised file is written to a sibling temp file and returned.
    """
    safe_lines = []
    for line in pdb_path.read_text(errors="replace").splitlines():
        if not line.startswith("ATOM"):
            continue
        res_name = line[17:20].strip()
        if res_name not in _STANDARD_RESIDUES:
            continue
        safe_lines.append(line)

    if not safe_lines:
        # If nothing survives (very unusual), return original
        return pdb_path

    safe_path = pdb_path.parent / f"_puresnet_{pdb_path.name}"
    safe_path.write_text("\n".join(safe_lines) + "\nEND\n")
    return safe_path


def run_puresnet(
    pdb_path: str,
    docker_image: str = "jivankandel/puresnet:latest",
    top_n: int = 10,
    timeout_sec: int = 300,
) -> List[Dict]:
    """
    Run PUResNetV2.0 via Docker (CPU-only) and return predicted pocket centres.

    Pre-processing:
      The PDB is sanitised to standard 20 amino acids only before being
      passed to the container. This prevents StopIteration errors in
      puresnet's residue SDF library for non-standard/HETATM records.

    Falls back gracefully if Docker is not available.
    """
    pdb_path = Path(pdb_path)
    if not pdb_path.exists():
        log.error("PUResNet: PDB not found: %s", pdb_path)
        return []

    if not shutil.which("docker"):
        log.warning("Docker not available — skipping PUResNetV2.0")
        return []

    safe_pdb = pdb_path
    try:
        # Sanitise PDB: standard residues only
        safe_pdb = _sanitise_pdb_for_puresnet(pdb_path)
        log.debug("PUResNet: sanitised PDB -> %s", safe_pdb.name)

        mount_dir = str(safe_pdb.parent.resolve())
        container_pdb = f"/work/{safe_pdb.name}"

        # CPU-only: no --gpus flag needed.
        # Fresh jivankandel/puresnet image finds OpenBabel plugins automatically.
        cmd = [
            "docker", "run", "--rm",
            "-v", f"{mount_dir}:/work",
            docker_image,
            "python", "-c",
            _puresnet_inline_script(container_pdb, top_n),
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )

        # Log stderr for diagnostics (contains [puresnet] progress lines)
        if result.stderr:
            for line in result.stderr.strip().splitlines():
                log.info("PUResNet container: %s", line)

        if result.returncode != 0:
            log.warning(
                "PUResNet Docker exited %d for %s",
                result.returncode, pdb_path.name,
            )
            return []

        return _parse_puresnet_output(result.stdout)

    except subprocess.TimeoutExpired:
        log.error("PUResNet Docker timed out after %d s", timeout_sec)
        return []
    except Exception as exc:
        log.error("PUResNet failed for %s: %s", pdb_path.name, exc, exc_info=True)
        return []
    finally:
        # Clean up the sanitised temp file
        if safe_pdb != pdb_path and safe_pdb.exists():
            try:
                safe_pdb.unlink()
            except OSError:
                pass


def _puresnet_inline_script(pdb_path: str, top_n: int) -> str:
    """
    Inline Python script executed inside the PUResNet Docker container (CPU-only).

    Root cause of CUDA error:
      get_trained_model() calls ME.torch.load(model_path) without
      map_location='cpu', so a CUDA-saved checkpoint fails on CPU-only machines.

    Fix: monkey-patch torch.load AND ME.torch.load to always inject
    map_location='cpu' before any model loading happens.

    puresnet v0.1 behaviour:
      make_prediction(pdb_path, device='cpu', mode='A')
        → returns None
        → writes pocket PDB files into 'result/' sub-dir of cwd
           named: result/<pdb_name>_<chains>.pdb  (NOT _pocket_N.pdb)
        → we must inspect save_predictions to know exact naming

    Strategy: run make_prediction, then glob broadly under cwd for any
    new PDB files written, compute their centroids.
    """
    return (
        "import json, os, sys, glob, time\n"
        "import numpy as np\n"
        "\n"
        "# ── CPU patch: force all torch.load calls to use map_location='cpu' ──\n"
        "import torch\n"
        "_orig_load = torch.load\n"
        "def _cpu_load(*args, **kwargs):\n"
        "    kwargs.setdefault('map_location', 'cpu')\n"
        "    return _orig_load(*args, **kwargs)\n"
        "torch.load = _cpu_load\n"
        "\n"
        "# MinkowskiEngine keeps its own reference to torch — patch that too\n"
        "try:\n"
        "    import MinkowskiEngine as ME\n"
        "    ME.torch.load = _cpu_load\n"
        "except Exception:\n"
        "    pass\n"
        "\n"
        "# Work in /tmp — writable, avoids permission issues\n"
        "os.chdir('/tmp')\n"
        "snapshot_before = set(glob.glob('/tmp/**', recursive=True))\n"
        "\n"
        "from puresnet.predict import make_prediction\n"
        "\n"
        f"pdb_path = '{pdb_path}'\n"
        "pdb_name = os.path.basename(pdb_path)\n"
        "\n"
        "print('[puresnet] calling make_prediction (CPU mode)...', file=sys.stderr)\n"
        "make_prediction(pdb_path, device='cpu', mode='A')\n"
        "print('[puresnet] make_prediction done', file=sys.stderr)\n"
        "\n"
        "# Discover what files were written — compare snapshot\n"
        "snapshot_after = set(glob.glob('/tmp/**', recursive=True))\n"
        "new_files = sorted(snapshot_after - snapshot_before)\n"
        "print(f'[puresnet] new files written: {new_files}', file=sys.stderr)\n"
        "\n"
        "# Filter to PDB files only\n"
        "pocket_files = [f for f in new_files if f.endswith('.pdb')]\n"
        "\n"
        "# Also try broad glob as fallback\n"
        "if not pocket_files:\n"
        "    pocket_files = sorted(glob.glob('/tmp/**/*.pdb', recursive=True))\n"
        "    print(f'[puresnet] fallback glob found: {pocket_files}', file=sys.stderr)\n"
        "\n"
        "out = []\n"
        "for rank_0, pocket_file in enumerate(pocket_files):\n"
        f"    if rank_0 >= {top_n}:\n"
        "        break\n"
        "    coords = []\n"
        "    try:\n"
        "        with open(pocket_file) as fh:\n"
        "            for line in fh:\n"
        "                if line.startswith(('ATOM', 'HETATM')):\n"
        "                    try:\n"
        "                        coords.append([\n"
        "                            float(line[30:38]),\n"
        "                            float(line[38:46]),\n"
        "                            float(line[46:54])\n"
        "                        ])\n"
        "                    except (ValueError, IndexError):\n"
        "                        pass\n"
        "    except OSError:\n"
        "        continue\n"
        "    if coords:\n"
        "        center = np.mean(coords, axis=0).tolist()\n"
        "        score = round(1.0 / (rank_0 + 1), 4)\n"
        "        out.append({'center': center, 'score': score})\n"
        "\n"
        "print(f'[puresnet] {len(out)} pocket centres extracted', file=sys.stderr)\n"
        "print(json.dumps(out))\n"
    )


def _parse_puresnet_output(stdout: str) -> List[Dict]:
    """Parse JSON output from the PUResNet Docker container."""
    pockets = []
    # Find the last JSON array in stdout (ignore Docker preamble lines)
    for line in reversed(stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith("["):
            try:
                data = json.loads(line)
                for item in data:
                    center = item.get("center", [])
                    if len(center) != 3:
                        continue
                    pockets.append({
                        "center": np.array([float(v) for v in center]),
                        "score": float(item.get("score", 0.0)),
                        "volume": 0.0,
                    })
                break
            except (json.JSONDecodeError, ValueError):
                continue

    pockets.sort(key=lambda p: p["score"], reverse=True)
    log.info("PUResNet: %d pockets parsed", len(pockets))
    return pockets
