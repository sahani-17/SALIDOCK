#!/usr/bin/env python3
"""
run_unified_preprocessing_benchmark.py
=======================================
Unified SaliDock preprocessing + benchmarking pipeline.

Datasets: CHEN11, COACH420, CASF2016, JOINED560, PDBbind2020, HOLO4K

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE BREAKDOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Phase 1  PREPROCESSING ONLY
         - Download raw RCSB PDB  (raw_pdb_cache/)
         - Extract true ligand centroids from raw PDB (non-blocking)
         - Preprocess: strip HETATM/waters/H/altloc → save *_prep.pdb
         - Save centroid cache + checkpoint
         NOTE: no tools run here. This is purely data preparation.

Phase 2  TOOL SWEEP
         - Read every *_prep.pdb written in Phase 1
         - Run fpocket, P2Rank, PUResNet on each
         - Write per-dataset TSV files (raw_results/{tool}/{ds}.tsv)
         - dist_to_true = -1 for apo/no-ligand proteins

Phase 3  COMPILE
         - Merge all TSVs into master_distance_matrix.tsv
         - Generate DCA label files at 3 Å / 4 Å / 5 Å thresholds

Phase 4  OPTIMISE
         - Optuna Bayesian weight optimisation (500 trials)

Phase 5  ABLATION
         - Tool contribution analysis

Phase 6  SENSITIVITY
         - DCA sensitivity curves across thresholds

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Run Phase 1 (preprocessing) for all datasets — live in terminal
  python run_unified_preprocessing_benchmark.py --phase 1

  # Run Phase 1 for a single dataset
  python run_unified_preprocessing_benchmark.py --phase 1 --dataset CHEN11

  # Run Phase 2 (tool sweep) after Phase 1 completes
  python run_unified_preprocessing_benchmark.py --phase 2

  # Run full pipeline end-to-end
  python run_unified_preprocessing_benchmark.py --phase all

Output: salidock_benchmark/preproc_benchmark/
"""

from __future__ import annotations

import os
import sys
import json
import shutil
import time
import datetime
import argparse
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

import numpy as np

# ── stdout line-buffered so progress shows immediately ───────────────────────
sys.stdout.reconfigure(line_buffering=True)

# ── Path setup ────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / 'backend' / 'p2rank-datasets'
BENCH_DIR    = BASE_DIR / 'salidock_benchmark' / 'preproc_benchmark'

sys.path.insert(0, str(BASE_DIR))

# ── Dataset definitions ───────────────────────────────────────────────────────

CASF_2016_PDB_IDS = [
    '1a30','1bcu','1bzc','1c5z','1e66','1eby','1g2k','1gpk','1gpn','1h22',
    '1h23','1k1i','1lpg','1mq6','1nc1','1nc3','1nvq','1o0h','1o3f','1o5b',
    '1owh','1oyt','1p1n','1p1q','1ps3','1pxn','1q8t','1q8u','1qf1','1qkt',
    '1r5y','1s38','1sqa','1syi','1u1b','1uto','1vso','1w4o','1y6r','1yc1',
    '1ydr','1ydt','1z6e','1z95','1z9g','2al5','2br1','2brb','2c3i','2cbv',
    '2cet','2fvd','2fxs','2hb1','2iwx','2j78','2j7h','2p15','2p4y','2pog',
    '2qbp','2qbq','2qbr','2qe4','2qnq','2r9w','2v00','2v7a','2vkm','2vvn',
    '2vw5','2w4x','2w66','2wbg','2wca','2weg','2wer','2wn9','2wnc','2wtv',
    '2wvt','2x00','2xb8','2xbv','2xdl','2xii','2xj7','2xnb','2xys','2y5h',
    '2yfe','2yge','2yki','2ymd','2zb1','2zcq','2zcr','2zda','2zy1','3acw',
    '3ag9','3ao4','3arp','3arq','3aru','3arv','3ary','3b1m','3b27','3b5r',
    '3b65','3b68','3bgz','3bv9','3cj4','3coy','3coz','3d4z','3d6q','3dd0',
    '3dx1','3dx2','3dxg','3e5a','3e92','3e93','3ebp','3ehy','3ejr','3f3a',
    '3f3c','3f3d','3f3e','3fcq','3fur','3fv1','3fv2','3g0w','3g2n','3g2z',
    '3g31','3gbb','3gc5','3ge7','3gnw','3gr2','3gv9','3gy4','3ivg','3jvr',
    '3jvs','3jya','3k5v','3kgp','3kr8','3kwa','3l7b','3lka','3mss','3myg',
    '3n76','3n7a','3n86','3nq9','3nw9','3nx7','3o9i','3oe4','3oe5','3ozs',
    '3ozt','3p5o','3prs','3pww','3pxf','3pyy','3qgy','3qqs','3r88','3rlr',
    '3rr4','3rsx','3ryj','3syr','3tsk','3twp','3u5j','3u8k','3u8n','3u9q',
    '3udh','3ueu','3uev','3uew','3uex','3ui7','3uo4','3up2','3uri','3utu',
    '3uuo','3wtj','3wz8','3zdg','3zso','3zsx','3zt2','4abg','4agn','4agp',
    '4agq','4bkt','4cig','4ciw','4cr9','4cra','4crc','4ddh','4ddk','4de1',
    '4de2','4de3','4djv','4dld','4dli','4e5w','4e6q','4ea2','4eky','4eo8',
    '4eor','4f09','4f2w','4f3c','4f9w','4gfm','4gid','4gkm','4gr0','4hge',
    '4ih5','4ih7','4ivb','4ivc','4ivd','4j21','4j28','4j3l','4jfs','4jia',
    '4jsz','4jxs','4k18','4k77','4kz6','4kzq','4kzu','4llx','4lzs','4m0y',
    '4m0z','4mgd','4mme','4ogj','4owm','4pcs','4qac','4qd6','4rfm','4tmn',
    '4twp','4ty7','4u4s','4w9c','4w9h','4w9i','4w9l','4wiv','4x6p','5a7b',
    '5aba','5c28','5c2h','5dwr','5tmn',
]

PDBBIND_V2020_PDB_IDS = [
    '6qqw','6d08','6jap','6np2','6uvp','6oxq','6jsn','6hzb','6qrc','6oio',
    '6jag','6moa','6hld','6i9a','6e4c','6g24','6jb4','6s55','6seo','6dyz',
    '5zk5','6jid','5ze6','6qlu','6a6k','6qgf','6e3z','6te6','6pka','6g2o',
    '6jsf','5zxk','6qxd','6n97','6jt3','6qtr','6oy1','6n96','6qzh','6qqz',
    '6qmt','6ibx','6hmt','5zk7','6k3l','6cjs','6n9l','6ibz','6ott','6gge',
]

# Residues excluded when identifying true ligand centroids
HETATM_EXCLUDE = {
    'HOH','WAT','DOD','H2O',
    'SO4','PO4','GOL','EDO','PEG','DMS','ACT','ACE','NH2','MSE',
    'CL','NA','MG','ZN','CA','FE','CU','MN','CO','NI','K','IOD',
    'BR','F','LI','CS','BA','SR','CD','HG','PT','AU',
}

# name → ds_file (relative to DATASETS_DIR) or None for hardcoded list
DATASETS: Dict[str, Optional[str]] = {
    'CHEN11':      'chen11.ds',
    'COACH420':    'coach420.ds',
    'CASF2016':    None,
    'JOINED560':   'joined.ds',
    'PDBbind2020': None,
    'HOLO4K':      'holo4k.ds',
}


# ══════════════════════════════════════════════════════════════════════════════
# PREPROCESSING HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def preprocess_pdb(input_pdb: str, output_pdb: str) -> dict:
    """
    SaliDock PDB preprocessing — mirrors production tools.py.

    Steps:
      1. Remove ALL HETATM records (ligands, cofactors, ions, waters)
      2. Remove water residues in ATOM records (HOH/WAT/H2O/DOD)
      3. Remove hydrogen atoms (by element column or by atom name pattern)
      4. Keep only first alternate location (A or blank)
      5. Keep ALL chains

    Returns stats dict.
    Raises ValueError if zero ATOM records survive after stripping.
    """
    WATER_RES = {'HOH', 'WAT', 'H2O', 'DOD'}

    lines_in = Path(input_pdb).read_text(encoding='utf-8', errors='replace').splitlines(keepends=True)

    stats = dict(atoms_before=0, atoms_after=0,
                 hetatm_removed=0, water_removed=0,
                 h_removed=0, altloc_removed=0)

    stats['atoms_before'] = sum(1 for l in lines_in if l[:6].strip() in ('ATOM', 'HETATM'))
    out: list = []

    for line in lines_in:
        rec = line[:6].strip()

        if rec == 'HETATM':
            rn = line[17:20].strip().upper() if len(line) > 20 else ''
            if rn in WATER_RES:
                stats['water_removed'] += 1
            else:
                stats['hetatm_removed'] += 1
            continue

        if rec == 'ATOM':
            rn = line[17:20].strip().upper() if len(line) > 20 else ''
            if rn in WATER_RES:
                stats['water_removed'] += 1
                continue

            name = line[12:16].strip().upper() if len(line) > 16 else ''
            elem = line[76:78].strip().upper() if len(line) > 77 else ''

            # ── Hydrogen detection (safe, element-column-first) ────────────
            # Rule 1: element column says 'H'  → definitive, always strip
            # Rule 2: no element column available → fall back to atom name:
            #   - bare 'H' (backbone amide hydrogen)
            #   - starts with a digit followed by H  (e.g. '1H ', '2HB')
            # We deliberately do NOT do name.startswith('H') because that
            # would strip heavy atoms like HEM, HSD, HIE, and DNA atoms
            # like "H5'" which are NOT hydrogens.
            if elem == 'H':
                is_h = True
            elif elem in ('', 'D'):   # deuterium or no element col
                is_h = (
                    name == 'H'
                    or (len(name) >= 2 and name[0].isdigit() and name[1] == 'H')
                )
            else:
                is_h = False

            if is_h:
                stats['h_removed'] += 1
                continue

            altloc = line[16:17] if len(line) > 16 else ' '
            if altloc not in (' ', 'A', ''):
                stats['altloc_removed'] += 1
                continue

            out.append(line)
            continue

        out.append(line)

    stats['atoms_after'] = sum(1 for l in out if l[:4] == 'ATOM')
    if stats['atoms_after'] == 0:
        raise ValueError(
            f"Preprocessing produced an empty PDB for {Path(input_pdb).name}. "
            f"atoms_before={stats['atoms_before']}, after stripping "
            f"HETATM/waters/H/altloc nothing remained. "
            f"(Likely a DNA/RNA-only or NMR ensemble-only structure.)"
        )

    Path(output_pdb).write_text(''.join(out), encoding='utf-8')
    return stats


# ══════════════════════════════════════════════════════════════════════════════
# PDB DOWNLOAD + CENTROID HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def parse_ds_file(ds_path: Path) -> List[str]:
    """Parse P2Rank .ds manifest — return list of relative PDB paths."""
    paths = []
    with open(ds_path, encoding='utf-8', errors='replace') as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            for p in line.split():
                if '.pdb' in p:
                    paths.append(p)
                    break
    return paths


def _rcsb_download(pdb_id: str, dest: Path) -> Optional[Path]:
    """Download PDB from RCSB. Returns dest path or None on failure."""
    if dest.exists() and dest.stat().st_size > 100:
        return dest
    urls = [
        f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb",
        f"https://files.rcsb.org/pub/pdb/data/structures/divided/pdb"
        f"/{pdb_id[1:3]}/pdb{pdb_id}.ent.gz",
    ]
    for url in urls:
        try:
            urllib.request.urlretrieve(url, dest)
            if dest.stat().st_size > 100:
                return dest
            dest.unlink(missing_ok=True)
        except Exception:
            pass
    return None


def get_tool_pdb(relative_path: str, pdb_id: str, pdb_cache: Path) -> Optional[Path]:
    """
    Prefer local p2rank dataset file (protein-only, HETATM stripped — fine for tools).
    Falls back to RCSB download.
    """
    local = DATASETS_DIR / relative_path
    if local.exists():
        return local
    return _rcsb_download(pdb_id, pdb_cache / f"{pdb_id}.pdb")


def get_raw_pdb(pdb_id: str, raw_cache: Path) -> Optional[Path]:
    """
    Download the original raw PDB from RCSB (HETATM intact).
    Used only for true ligand centroid extraction.
    Stored in a separate cache.
    """
    return _rcsb_download(pdb_id, raw_cache / f"{pdb_id}_raw.pdb")


def extract_ligand_centers(pdb_path: str) -> List[List[float]]:
    """
    Extract true ligand centroids from HETATM records.
    Only considers molecules with >= 5 heavy atoms (excludes ions/waters/solvents).
    Returns list of [x, y, z] centroids.
    """
    ligands: dict = {}
    with open(pdb_path, encoding='utf-8', errors='ignore') as fh:
        for line in fh:
            if not line.startswith('HETATM'):
                continue
            try:
                rn     = line[17:20].strip().upper()
                chain  = line[21:22].strip() or 'A'
                resnum = line[22:26].strip()
                x, y, z = float(line[30:38]), float(line[38:46]), float(line[46:54])
                if rn in HETATM_EXCLUDE:
                    continue
                key = (rn, chain, resnum)
                ligands.setdefault(key, []).append([x, y, z])
            except (ValueError, IndexError):
                continue

    centers = [
        np.mean(coords, axis=0).tolist()
        for coords in ligands.values() if len(coords) >= 5
    ]
    return centers


def euclidean(a, b) -> float:
    return float(np.linalg.norm(np.array(a) - np.array(b)))


# ══════════════════════════════════════════════════════════════════════════════
# PROGRESS DISPLAY
# ══════════════════════════════════════════════════════════════════════════════

class Progress:
    """
    Smart progress display with per-protein ETA.

    Terminal (TTY):  in-place \r bar — updates on every event (start + finish)
    Log / nohup:     new timestamped line per completed protein
    """

    def __init__(self, total: int, name: str):
        self.total     = total
        self.name      = name
        self.done      = 0
        self.skipped   = 0
        self.errors    = 0
        self.t0        = time.time()
        self.is_tty    = sys.stdout.isatty()
        self._last_protein_t0: float = time.time()

        # Print immediately on creation so the terminal is never blank
        if self.is_tty:
            print(
                f"\r  [{'.' * 25}]   0.0%  0/{self.total}  ETA:--:--  START",
                end='', flush=True,
            )
        else:
            ts = datetime.datetime.now().strftime('%H:%M:%S')
            print(f"  {ts}  [{name}] Starting — {total} targets", flush=True)

    # ── timing helpers ─────────────────────────────────────────────────────────

    def _overall_eta(self) -> str:
        elapsed = time.time() - self.t0
        if self.done == 0:
            return '--:--'
        remaining = (elapsed / self.done) * (self.total - self.done)
        return str(datetime.timedelta(seconds=int(remaining)))

    def _protein_elapsed(self) -> str:
        secs = int(time.time() - self._last_protein_t0)
        return str(datetime.timedelta(seconds=secs))

    def _bar(self) -> str:
        W      = 25
        filled = int(W * self.done / self.total) if self.total else 0
        return '█' * filled + '░' * (W - filled)

    # ── public interface ───────────────────────────────────────────────────────

    def start_protein(self, pdb_id: str):
        """Call BEFORE starting work on a protein — shows RUN state."""
        self._last_protein_t0 = time.time()
        if not self.is_tty:
            return
        pct = self.done / self.total * 100
        print(
            f"\r  [{self._bar()}] {pct:5.1f}%  {self.done}/{self.total}"
            f"  ETA:{self._overall_eta():<9}  RUN  {pdb_id.upper():<6}",
            end='', flush=True,
        )

    def tick(self, pdb_id: str, status: str = 'ok'):
        """
        Call AFTER a protein finishes.

        status:
          'ok'    — preprocessed successfully (may have or lack centroids)
          'nolig' — preprocessed but no ligand centroids in raw PDB
          'skip'  — already in checkpoint, not re-processed
          'nopdb' — could not obtain any PDB file
          'err'   — preprocessing raised an exception
        """
        self.done += 1
        if status in ('nopdb', 'err'):
            self.errors += 1
        if status == 'skip':
            self.skipped += 1

        pct     = self.done / self.total * 100
        eta     = self._overall_eta()
        elapsed = self._protein_elapsed()

        TAG = {
            'ok':    'OK  ',
            'nolig': 'NOLG',
            'skip':  'SKIP',
            'nopdb': 'NOPDB',
            'err':   'ERR ',
        }.get(status, '    ')

        if self.is_tty:
            print(
                f"\r  [{self._bar()}] {pct:5.1f}%  {self.done}/{self.total}"
                f"  ETA:{eta:<9}  {TAG}  {pdb_id.upper():<6}  ({elapsed})",
                end='', flush=True,
            )
        else:
            ts = datetime.datetime.now().strftime('%H:%M:%S')
            print(
                f"  {ts}  [{pct:5.1f}%  {self.done:>5}/{self.total}]"
                f"  ETA:{eta:<10}  {TAG}  {pdb_id.upper():<6}  [{elapsed}]",
                flush=True,
            )

    def finish(self, processed: int):
        elapsed = time.time() - self.t0
        mins, secs = divmod(int(elapsed), 60)
        msg = (
            f"\n  ✓ {self.name}: {processed} preprocessed, "
            f"{self.skipped} skipped, {self.errors} failed"
            f" — {mins}m {secs}s total"
        )
        if self.is_tty:
            print(msg)
        else:
            print(msg, flush=True)


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — PREPROCESSING ONLY
# ══════════════════════════════════════════════════════════════════════════════

def run_phase_1(datasets_to_run: List[str]):
    """
    Phase 1: Download + preprocess every protein.

    For each protein:
      1. Obtain tool-input PDB  (local p2rank file preferred; fallback RCSB download)
      2. Download raw RCSB PDB  (always, for centroid extraction)
      3. Extract true ligand centroids from raw PDB  (non-blocking)
      4. Preprocess tool PDB → save *_prep.pdb in preprocessed_pdb/

    NO cavity detection tools are run here.
    Checkpoint saves after every single protein — resume-safe with Ctrl+C.
    """
    print('=' * 80)
    print('  PHASE 1 — PREPROCESSING ONLY (download + clean PDBs)')
    print('=' * 80)
    print(f"  Datasets : {', '.join(datasets_to_run)}")
    print(f"  Output   : {BENCH_DIR}")
    print()

    prep_dir  = BENCH_DIR / 'preprocessed_pdb'   # cleaned *_prep.pdb files
    pdb_cache = BENCH_DIR / 'pdb_cache'           # downloaded tool-input PDBs
    raw_cache = BENCH_DIR / 'raw_pdb_cache'       # downloaded raw RCSB PDBs
    ckpt_path = BENCH_DIR / 'phase1_checkpoint.json'
    cent_path = BENCH_DIR / 'true_centroids.json'

    for d in [prep_dir, pdb_cache, raw_cache]:
        d.mkdir(parents=True, exist_ok=True)

    # ── Load checkpoint ───────────────────────────────────────────────────────
    checkpoint: dict = {}
    if ckpt_path.exists():
        try:
            checkpoint = json.loads(ckpt_path.read_text(encoding='utf-8'))
            n_done = sum(1 for v in checkpoint.values() if v is True)
            print(f"  [Resume] {n_done} proteins already preprocessed — will skip them\n")
        except Exception:
            pass

    # ── Load centroid cache ────────────────────────────────────────────────────
    true_centroids: dict = {}
    if cent_path.exists():
        try:
            true_centroids = json.loads(cent_path.read_text(encoding='utf-8'))
        except Exception:
            pass

    def _save():
        ckpt_path.write_text(json.dumps(checkpoint), encoding='utf-8')
        cent_path.write_text(json.dumps(true_centroids), encoding='utf-8')

    # ── Dataset loop ──────────────────────────────────────────────────────────
    try:
        for ds_name in datasets_to_run:
            print(f"\n{'─' * 70}")
            print(f"  Dataset: {ds_name}")
            print('─' * 70)

            ds_file = DATASETS.get(ds_name)
            if ds_file is not None:
                ds_path = DATASETS_DIR / ds_file
                if not ds_path.exists():
                    print(f"  [ERROR] Manifest not found: {ds_path} — skipping")
                    continue
                targets = parse_ds_file(ds_path)
            elif ds_name == 'CASF2016':
                targets = [f"{p}.pdb" for p in CASF_2016_PDB_IDS]
            elif ds_name == 'PDBbind2020':
                targets = [f"{p}.pdb" for p in PDBBIND_V2020_PDB_IDS]
            else:
                print(f"  [ERROR] Unknown dataset {ds_name} — skipping")
                continue

            prog      = Progress(len(targets), ds_name)
            processed = 0

            for target in targets:
                pdb_id  = Path(target).stem[:4].lower()
                ck_key  = f"{ds_name}/{pdb_id}"

                # Already done in a previous run
                if checkpoint.get(ck_key) is True:
                    prog.tick(pdb_id, 'skip')
                    continue

                prog.start_protein(pdb_id)

                # ── Step 1: Get tool-input PDB ───────────────────────────────
                if ds_file is not None:
                    tool_pdb = get_tool_pdb(target, pdb_id, pdb_cache)
                else:
                    tool_pdb = _rcsb_download(pdb_id, pdb_cache / f"{pdb_id}.pdb")

                # ── Step 2: Download raw RCSB PDB for centroid extraction ────
                raw_pdb = get_raw_pdb(pdb_id, raw_cache)
                centers: list = []
                if raw_pdb is not None:
                    try:
                        centers = extract_ligand_centers(str(raw_pdb))
                        if centers:
                            true_centroids[pdb_id] = centers
                    except Exception:
                        pass

                # ── Step 3: Fall back to raw PDB for tool input if needed ────
                if tool_pdb is None:
                    tool_pdb = raw_pdb
                if tool_pdb is None:
                    print(f"\n  [WARN] No PDB available for {pdb_id} — skipping")
                    checkpoint[ck_key] = 'nopdb'
                    _save()
                    prog.tick(pdb_id, 'nopdb')
                    continue

                # ── Step 4: Preprocess → save *_prep.pdb ────────────────────
                prep_path = prep_dir / f"{pdb_id}_prep.pdb"
                try:
                    preprocess_pdb(str(tool_pdb), str(prep_path))
                except ValueError as exc:
                    # No ATOM records survived — log and move on
                    print(f"\n  [WARN] {pdb_id}: {exc}")
                    checkpoint[ck_key] = 'empty'
                    _save()
                    prog.tick(pdb_id, 'err')
                    continue
                except Exception as exc:
                    print(f"\n  [ERROR] Preprocess failed for {pdb_id}: {exc}")
                    checkpoint[ck_key] = 'err'
                    _save()
                    prog.tick(pdb_id, 'err')
                    continue

                # ── Done ─────────────────────────────────────────────────────
                checkpoint[ck_key] = True
                _save()   # save after every single protein
                processed += 1
                status = 'ok' if centers else 'nolig'
                prog.tick(pdb_id, status)

            prog.finish(processed)

    except KeyboardInterrupt:
        print('\n\n  [INTERRUPTED] Saving checkpoint and exiting gracefully...')
        _save()
        print('  [SAVED] Resume anytime by running the same command again.')
        sys.exit(0)

    # Final save
    _save()
    print(f"\n  Phase 1 complete.")
    print(f"  Preprocessed PDBs → {prep_dir}")
    print(f"  Centroid cache    → {cent_path}")
    print(f"\n  Run Phase 2 next:")
    print(f"  python run_unified_preprocessing_benchmark.py --phase 2")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — TOOL SWEEP (fpocket + P2Rank + PUResNet)
# ══════════════════════════════════════════════════════════════════════════════

def run_phase_2(p2rank_exe: str, use_puresnet: bool):
    """
    Phase 2: Run cavity detection tools on every preprocessed PDB from Phase 1.

    Reads every *_prep.pdb in preprocessed_pdb/ and runs:
      - fpocket
      - P2Rank
      - PUResNet  (if Docker available)

    Writes per-dataset TSV files to raw_results/{tool}/{dataset}.tsv.
    dist_to_true = -1 for apo/no-ligand proteins.
    """
    from salidock.cavity.runners import run_fpocket, run_p2rank, run_puresnet

    print('=' * 80)
    print('  PHASE 2 — TOOL SWEEP (fpocket / P2Rank / PUResNet)')
    print('=' * 80)
    print(f"  P2Rank   : {p2rank_exe}")
    print(f"  PUResNet : {'enabled (Docker found)' if use_puresnet else 'DISABLED (no Docker)'}")

    prep_dir  = BENCH_DIR / 'preprocessed_pdb'
    raw_dir   = BENCH_DIR / 'raw_results'
    cent_path = BENCH_DIR / 'true_centroids.json'
    ckpt_path = BENCH_DIR / 'phase2_checkpoint.json'

    if not prep_dir.exists():
        print('\n  [ERROR] No preprocessed PDBs found. Run Phase 1 first.')
        return

    # Load centroid cache
    true_centroids: dict = {}
    if cent_path.exists():
        try:
            true_centroids = json.loads(cent_path.read_text(encoding='utf-8'))
        except Exception:
            pass

    # Load Phase 2 checkpoint
    checkpoint: dict = {}
    if ckpt_path.exists():
        try:
            checkpoint = json.loads(ckpt_path.read_text(encoding='utf-8'))
            n_done = sum(1 for v in checkpoint.values() if v is True)
            print(f"\n  [Resume] {n_done} proteins already swept — will skip them")
        except Exception:
            pass

    def _save():
        ckpt_path.write_text(json.dumps(checkpoint), encoding='utf-8')

    for tool in ['fpocket', 'p2rank', 'purnet']:
        (raw_dir / tool).mkdir(parents=True, exist_ok=True)

    # Collect all prep PDBs grouped by dataset
    prep_files = sorted(prep_dir.glob('*_prep.pdb'))
    if not prep_files:
        print('\n  [ERROR] No *_prep.pdb files found in preprocessed_pdb/. Run Phase 1 first.')
        return

    # We need to know which dataset each PDB belongs to — use Phase 1 checkpoint
    phase1_ckpt: dict = {}
    p1_ckpt_path = BENCH_DIR / 'phase1_checkpoint.json'
    if p1_ckpt_path.exists():
        try:
            phase1_ckpt = json.loads(p1_ckpt_path.read_text(encoding='utf-8'))
        except Exception:
            pass

    # Build dataset → [pdb_id] mapping from Phase 1 checkpoint keys
    ds_to_pids: Dict[str, List[str]] = defaultdict(list)
    for key, val in phase1_ckpt.items():
        if val is True and '/' in key:
            ds, pid = key.split('/', 1)
            ds_to_pids[ds].append(pid)

    # Filter to datasets we actually have TSV files open for
    total_prep = sum(len(v) for v in ds_to_pids.values())
    print(f"\n  {total_prep} preprocessed proteins across {len(ds_to_pids)} datasets\n")

    try:
        for ds_name, pids in ds_to_pids.items():
            print(f"\n{'─' * 70}")
            print(f"  Dataset: {ds_name}  ({len(pids)} proteins)")
            print('─' * 70)

            # Open TSV files (append so resume doesn't re-write headers)
            tsvs: Dict[str, object] = {}
            for tool in ['fpocket', 'p2rank', 'purnet']:
                tsv_path = raw_dir / tool / f"{ds_name}.tsv"
                new_file = not tsv_path.exists()
                tsvs[tool] = open(tsv_path, 'a', encoding='utf-8', buffering=1)
                if new_file:
                    tsvs[tool].write(
                        'protein_id\tdataset\ttool\trank\t'
                        'pred_x\tpred_y\tpred_z\tconfidence\tdist_to_true\n'
                    )

            prog      = Progress(len(pids), ds_name)
            processed = 0

            for pdb_id in pids:
                ck_key = f"{ds_name}/{pdb_id}"
                if checkpoint.get(ck_key) is True:
                    prog.tick(pdb_id, 'skip')
                    continue

                prep_path = prep_dir / f"{pdb_id}_prep.pdb"
                if not prep_path.exists():
                    prog.tick(pdb_id, 'nopdb')
                    continue

                prog.start_protein(pdb_id)

                # Centroid lookup
                centers = true_centroids.get(pdb_id, [])

                def dist(px, py, pz):
                    if centers:
                        return min(euclidean([px, py, pz], c) for c in centers)
                    return -1.0

                def write_rows(tool_key: str, preds: list):
                    for rank_i, p in enumerate(preds, 1):
                        cx, cy, cz = (
                            p['center'].tolist()
                            if hasattr(p['center'], 'tolist')
                            else list(p['center'])
                        )
                        d = dist(cx, cy, cz)
                        tsvs[tool_key].write(
                            f"{pdb_id}\t{ds_name}\t{tool_key}\t{rank_i}\t"
                            f"{cx:.3f}\t{cy:.3f}\t{cz:.3f}\t{p['score']:.4f}\t{d:.3f}\n"
                        )

                # ── Run tools ────────────────────────────────────────────────
                fp_res = p2r_res = pur_res = []
                try:
                    fp_res = run_fpocket(str(prep_path))[:5]
                except Exception:
                    pass
                try:
                    p2r_res = run_p2rank(str(prep_path), p2rank_path=p2rank_exe)[:5]
                except Exception:
                    pass
                if use_puresnet:
                    try:
                        pur_res = run_puresnet(
                            str(prep_path), docker_image='salidock-puresnet-cpu:latest'
                        )[:5]
                    except Exception:
                        pass

                write_rows('fpocket', fp_res)
                write_rows('p2rank',  p2r_res)
                write_rows('purnet',  pur_res)

                checkpoint[ck_key] = True
                _save()
                processed += 1
                status = 'ok' if centers else 'nolig'
                prog.tick(pdb_id, status)

            for fh in tsvs.values():
                fh.close()

            prog.finish(processed)

    except KeyboardInterrupt:
        print('\n\n  [INTERRUPTED] Saving Phase 2 checkpoint...')
        _save()
        print('  [SAVED] Resume by running --phase 2 again.')
        sys.exit(0)

    _save()
    print(f"\n  Phase 2 complete — TSVs in: {raw_dir}")
    print(f"\n  Run Phase 3 next:")
    print(f"  python run_unified_preprocessing_benchmark.py --phase 3")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — COMPILE MASTER TSV + DCA LABELS
# ══════════════════════════════════════════════════════════════════════════════

def run_phase_3():
    print('\n' + '=' * 80)
    print('  PHASE 3 — COMPILE MASTER TSV + DCA LABELS')
    print('=' * 80)

    raw_dir     = BENCH_DIR / 'raw_results'
    master_path = BENCH_DIR / 'master_distance_matrix.tsv'
    labels_dir  = BENCH_DIR / 'dca_labels'
    labels_dir.mkdir(exist_ok=True)

    all_rows = []
    for tool_dir in sorted(raw_dir.iterdir()):
        if tool_dir.is_dir() and tool_dir.name in ('fpocket', 'p2rank', 'purnet'):
            for tsv in sorted(tool_dir.glob('*.tsv')):
                lines = tsv.read_text(encoding='utf-8').splitlines()
                data  = [l for l in lines[1:] if l.strip()]
                all_rows.extend(data)
                print(f"  {len(data):>7} rows  ← {tool_dir.name}/{tsv.name}")

    if not all_rows:
        print('  [ERROR] No data found. Run Phase 2 first.')
        return

    with open(master_path, 'w', encoding='utf-8') as fh:
        fh.write('protein_id\tdataset\ttool\trank\tpred_x\tpred_y\tpred_z\tconfidence\tdist_to_true\n')
        fh.write('\n'.join(all_rows) + '\n')
    print(f"\n  Master TSV: {len(all_rows)} rows → {master_path.name}")

    # DCA labels — exclude dist_to_true < 0 (apo/no-ligand)
    for threshold in [3.0, 4.0, 5.0]:
        t_path    = labels_dir / f"threshold_{int(threshold)}A.tsv"
        excluded  = 0
        with open(t_path, 'w', encoding='utf-8') as fh:
            fh.write('protein_id\tdataset\ttool\trank\tdca_success\n')
            for row in all_rows:
                parts = row.split('\t')
                if len(parts) < 9:
                    continue
                try:
                    d = float(parts[8])
                except ValueError:
                    continue
                if d < 0:
                    excluded += 1
                    continue
                success = int(d <= threshold)
                fh.write(f"{parts[0]}\t{parts[1]}\t{parts[2]}\t{parts[3]}\t{success}\n")
        print(f"  DCA labels @ {int(threshold)} Å → {t_path.name}  ({excluded} apo rows excluded)")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4 — OPTUNA WEIGHT OPTIMISATION
# ══════════════════════════════════════════════════════════════════════════════

def run_phase_4():
    print('\n' + '=' * 80)
    print('  PHASE 4 — OPTUNA WEIGHT OPTIMISATION')
    print('=' * 80)

    try:
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)
    except ImportError:
        print('  [ERROR] optuna not installed. Run: pip install optuna')
        return

    labels_path = BENCH_DIR / 'dca_labels' / 'threshold_4A.tsv'
    master_path = BENCH_DIR / 'master_distance_matrix.tsv'
    results_dir = BENCH_DIR / 'optuna_results'
    results_dir.mkdir(exist_ok=True)

    if not labels_path.exists() or not master_path.exists():
        print('  [ERROR] Run Phase 3 first.')
        return

    # Load data
    rows = []
    with open(master_path, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            parts = line.strip().split('\t')
            if len(parts) < 9:
                continue
            try:
                rows.append({
                    'protein_id': parts[0], 'dataset': parts[1],
                    'tool': parts[2], 'rank': int(parts[3]),
                    'center': [float(parts[4]), float(parts[5]), float(parts[6])],
                    'score': float(parts[7]), 'dist': float(parts[8]),
                })
            except (ValueError, IndexError):
                continue

    labels = {}
    with open(labels_path, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            parts = line.strip().split('\t')
            if len(parts) >= 5:
                labels[f"{parts[0]}/{parts[2]}/1"] = int(parts[4])

    pid_dict: Dict[str, List[dict]] = defaultdict(list)
    for r in rows:
        pid_dict[r['protein_id']].append(r)

    def dca_rate(wf: float, wp: float, wu: float) -> float:
        successes = 0
        total     = 0
        for pid, preds in pid_dict.items():
            tc = []
            for p in preds:
                if p['dist'] > 0:
                    tc.append(p['center'])
                    break
            if not tc:
                continue

            best_d = float('inf')
            for tool, w in [('fpocket', wf), ('p2rank', wp), ('purnet', wu)]:
                tp = [p for p in preds if p['tool'] == tool and p['rank'] == 1]
                if tp:
                    d = euclidean(tp[0]['center'], tc[0]) * (1 / (w + 1e-9))
                    best_d = min(best_d, d)

            if best_d <= 4.0:
                successes += 1
            total += 1
        return successes / total if total else 0.0

    def objective(trial):
        wf = trial.suggest_float('w_fpocket',  0.0, 1.0)
        wp = trial.suggest_float('w_p2rank',   0.0, 1.0)
        wu = trial.suggest_float('w_puresnet', 0.0, 1.0)
        return -dca_rate(wf, wp, wu)

    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=500, show_progress_bar=True)

    best = study.best_params
    print(f"\n  Best weights found:")
    print(f"    fpocket  = {best['w_fpocket']:.4f}")
    print(f"    p2rank   = {best['w_p2rank']:.4f}")
    print(f"    puresnet = {best['w_puresnet']:.4f}")
    print(f"    DCA@4Å   = {-study.best_value * 100:.1f}%")

    out = {'weights': best, 'dca_4A': -study.best_value}
    (results_dir / 'best_weights.json').write_text(json.dumps(out, indent=2))
    print(f"\n  Saved → {results_dir / 'best_weights.json'}")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 5 — ABLATION
# ══════════════════════════════════════════════════════════════════════════════

def run_phase_5():
    print('\n' + '=' * 80)
    print('  PHASE 5 — ABLATION STUDY')
    print('=' * 80)

    master_path = BENCH_DIR / 'master_distance_matrix.tsv'
    cent_path   = BENCH_DIR / 'true_centroids.json'
    if not master_path.exists():
        print('  [ERROR] Run Phase 3 first.')
        return

    true_centroids: dict = {}
    if cent_path.exists():
        try:
            true_centroids = json.loads(cent_path.read_text(encoding='utf-8'))
        except Exception:
            pass

    rows = []
    with open(master_path, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            parts = line.strip().split('\t')
            if len(parts) >= 9:
                try:
                    rows.append({
                        'protein_id': parts[0], 'tool': parts[2],
                        'rank': int(parts[3]),
                        'center': [float(parts[4]), float(parts[5]), float(parts[6])],
                        'dist': float(parts[8]),
                    })
                except (ValueError, IndexError):
                    continue

    pid_dict: Dict[str, List[dict]] = defaultdict(list)
    for r in rows:
        pid_dict[r['protein_id']].append(r)

    print(f"\n  {'Tool':<15}  {'DCA@3Å':>8}  {'DCA@4Å':>8}  {'DCA@5Å':>8}")
    print('  ' + '-' * 45)

    for method in ['fpocket', 'p2rank', 'purnet', 'all_tools']:
        for th in [3.0, 4.0, 5.0]:
            succ = 0
            n    = 0
            for pid, preds in pid_dict.items():
                tc = true_centroids.get(pid, [])
                if not tc:
                    continue
                if method == 'all_tools':
                    cands = [p for p in preds if p['rank'] == 1]
                else:
                    cands = [p for p in preds if p['tool'] == method and p['rank'] == 1]
                if cands:
                    best = min(min(euclidean(p['center'], c) for c in tc) for p in cands)
                    if best <= th:
                        succ += 1
                n += 1
            if th == 3.0:
                row_vals = [f"  {method:<15}"]
            row_vals.append(f"  {succ/n*100:>7.1f}%" if n else "  N/A")
        print(''.join(row_vals))


# ══════════════════════════════════════════════════════════════════════════════
# PHASE 6 — SENSITIVITY CURVES
# ══════════════════════════════════════════════════════════════════════════════

def run_phase_6():
    print('\n' + '=' * 80)
    print('  PHASE 6 — SENSITIVITY CURVES')
    print('=' * 80)

    master_path = BENCH_DIR / 'master_distance_matrix.tsv'
    cent_path   = BENCH_DIR / 'true_centroids.json'
    fig_dir     = BENCH_DIR / 'figures'
    fig_dir.mkdir(exist_ok=True)

    if not master_path.exists():
        print('  [ERROR] Run Phase 3 first.')
        return

    true_centroids: dict = {}
    if cent_path.exists():
        try:
            true_centroids = json.loads(cent_path.read_text(encoding='utf-8'))
        except Exception:
            pass

    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print('  [INFO] matplotlib not installed — skipping plots.')
        return

    rows = []
    with open(master_path, encoding='utf-8') as fh:
        next(fh)
        for line in fh:
            parts = line.strip().split('\t')
            if len(parts) >= 9:
                try:
                    rows.append({
                        'protein_id': parts[0], 'dataset': parts[1],
                        'tool': parts[2], 'rank': int(parts[3]),
                        'center': [float(parts[4]), float(parts[5]), float(parts[6])],
                        'dist': float(parts[8]),
                    })
                except (ValueError, IndexError):
                    continue

    data_map: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for r in rows:
        data_map[r['dataset']][r['protein_id']].append(r)

    thresholds = [float(x) / 10 for x in range(10, 105, 5)]

    for ds, pid_dict in data_map.items():
        n = len(pid_dict)
        plt.figure(figsize=(8, 5))
        for method in ['fpocket', 'p2rank', 'purnet']:
            rates = []
            for th in thresholds:
                succ = 0
                for pid, pdata in pid_dict.items():
                    tc = true_centroids.get(pid, [])
                    if not tc:
                        continue
                    top1 = [p for p in pdata if p['tool'] == method and p['rank'] == 1]
                    if top1 and min(euclidean(top1[0]['center'], c) for c in tc) <= th:
                        succ += 1
                rates.append(succ / n * 100 if n else 0)
            plt.plot(thresholds, rates, marker='o', ms=3, label=method)
        plt.axvline(4.0, color='gray', ls='--', alpha=0.6, label='4 Å cutoff')
        plt.title(f"DCA Sensitivity — {ds}")
        plt.xlabel('Threshold (Å)')
        plt.ylabel('Success rate (%)')
        plt.ylim(0, 100)
        plt.grid(ls=':', alpha=0.5)
        plt.legend()
        plt.tight_layout()
        plt.savefig(fig_dir / f"sensitivity_{ds}.png", dpi=150)
        plt.close()
    print(f"  Sensitivity plots → {fig_dir}")


# ══════════════════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description='SaliDock Unified Preprocessing Benchmark',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Phases:
  1   Preprocessing only  (download + clean PDBs — NO tools)
  2   Tool sweep          (fpocket / P2Rank / PUResNet on prepared PDBs)
  3   Compile             (master TSV + DCA labels)
  4   Optimise            (Optuna weight optimisation)
  5   Ablation            (tool contribution analysis)
  6   Sensitivity         (DCA curves)
  all Run all phases in order
""",
    )
    parser.add_argument(
        '--phase', choices=['1', '2', '3', '4', '5', '6', 'all'], default='1',
        help='Phase to run (default: 1)',
    )
    parser.add_argument(
        '--dataset', choices=list(DATASETS.keys()), default=None,
        help='Restrict Phase 1 to a single dataset',
    )
    args = parser.parse_args()

    BENCH_DIR.mkdir(parents=True, exist_ok=True)

    # Detect P2Rank binary
    if sys.platform.startswith('win'):
        p2rank_exe = str(BASE_DIR / 'backend' / 'p2rank_2.4.2' / 'prank.bat')
    else:
        p2rank_exe = str(BASE_DIR / 'backend' / 'p2rank_2.4.2' / 'prank.sh')
        if not Path(p2rank_exe).exists():
            p2rank_exe = str(BASE_DIR / 'backend' / 'p2rank_2.4.2' / 'prank')

    use_puresnet = bool(shutil.which('docker'))

    datasets_to_run = [args.dataset] if args.dataset else list(DATASETS.keys())

    if args.phase in ('1', 'all'):
        run_phase_1(datasets_to_run)
    if args.phase in ('2', 'all'):
        run_phase_2(p2rank_exe, use_puresnet)
    if args.phase in ('3', 'all'):
        run_phase_3()
    if args.phase in ('4', 'all'):
        run_phase_4()
    if args.phase in ('5', 'all'):
        run_phase_5()
    if args.phase in ('6', 'all'):
        run_phase_6()

    print('\nBenchmark complete.')


if __name__ == '__main__':
    main()
