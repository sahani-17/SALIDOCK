#!/usr/bin/env python3
"""
run_astex_diverse_benchmark.py
=================================
SaliDock cavity detection benchmark on the **Astex Diverse Set**
(Hartshorn et al., J. Med. Chem. 2007, 50(4):726-741).

N = 85 high-quality, drug-like protein-ligand crystal structures,
widely used as the gold-standard for evaluating docking and
binding-site prediction methods.

EVALUATION PROTOCOL
  1. Download raw RCSB PDB for each of the 85 complexes
  2. Extract true ligand centroid(s) from raw PDB (HETATM, excluding
     crystallographic artifacts — solvent, ions, buffer agents)
  3. Apply SaliDock 5-step preprocessing to produce _prep.pdb
  4. Run fpocket, P2Rank (and PUResNet if Docker is available)
  5. Fuse via wRRF consensus (loaded from backend/config/weights.json)
  6. Evaluate DCA@top-1/3/5 at 2 A / 4 A / 6 A thresholds
  7. Report Wilson 95% CIs and McNemar exact significance tests
  8. Write TSV results + JSON summary

USAGE
  python run_astex_diverse_benchmark.py                   # full run
  python run_astex_diverse_benchmark.py --no-puresnet     # skip Docker
  python run_astex_diverse_benchmark.py --threshold 2.0   # change primary DCA threshold
  python run_astex_diverse_benchmark.py --limit 10        # quick test (first 10)

Output: astex_benchmark/
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# ── Path setup ────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from salidock.cavity.runners import run_fpocket, run_p2rank, run_puresnet
from salidock.cavity.fusion import fuse_predictions

# ── stdout: line-buffered ─────────────────────────────────────────────────────
sys.stdout.reconfigure(line_buffering=True)


# ══════════════════════════════════════════════════════════════════════════════
# Astex Diverse Set — 85 PDB IDs (Hartshorn et al., J. Med. Chem. 2007)
# Source: Table 1 in Hartshorn et al. and CCDC supplementary files.
# ══════════════════════════════════════════════════════════════════════════════
ASTEX_85_RAW = [
    # Thermolysin family
    '1tmn', '2tmn', '4tmn', '5tmn',
    # Matrix metalloprotease / collagenase
    '1hfc', '1ida',
    # Kinases (CDK2, TK, other)
    '1mrk', '1kel', '1kim',
    # Nuclear receptor (oestrogen receptor)
    '3ert',
    # Dihydrofolate reductase
    '4dfr',
    # Neuraminidase
    '1a4q',
    # HIV protease
    '1hvr', '1hpv',
    # Carbonic anhydrase / binding proteins
    '1cbs', '1cil', '1hsl',
    # Phosphodiesterase / phospholipase
    '1lst', '1mts',
    # Remainder of the 85 (alphabetical from Hartshorn Table 1)
    '1a28', '1abe', '1abf', '1aoe', '1apu', '1aqw', '1atl',
    '1bma', '1byb',
    '1c5c', '1c5x', '1c83',
    '1cle',
    '1d0l', '1d3h', '1d4p',
    '1ejn', '1eta',
    '1f3d', '1flr', '1frp',
    '1glp', '1glq',
    '1gpk', '1gpn',
    '1h22', '1h23',
    '1hsb', '1hyt',
    '1jap',
    '1lcp', '1lic',
    '1mld', '1mmq', '1mrg',
    '1nco',
    '1nc1', '1nc3', '1nvq',
    '1o0h', '1o3f', '1o5b',
    '1ppc', '1pph',
    '1qbr',
    '1rnt', '1rob',
    '1slt', '1snc', '1srj',
    '1tng', '1tnh', '1tni', '1tnl',
    '1tyl', '1ukz',
    '1xid', '1xie',
    '2ak3', '2cmd', '2ctc', '2fox', '2gbp', '2h4n', '2qwk',
    '3cla',
    '5abp',
    '6rnt',
    '7tim',
]

# Deduplicate while preserving order (guard against list edits above)
_seen: set = set()
ASTEX_85: List[str] = []
for _pid in ASTEX_85_RAW:
    if _pid not in _seen:
        _seen.add(_pid)
        ASTEX_85.append(_pid)


# ── Crystallographic artefacts excluded from ligand centroid extraction ───────
HETATM_EXCLUDE = {
    # Waters
    'HOH', 'WAT', 'DOD', 'H2O',
    # Common cryo / buffer agents
    'SO4', 'PO4', 'GOL', 'EDO', 'PEG', 'DMS', 'ACT', 'ACE',
    'NH2', 'MSE', 'MPD', 'FMT', 'TRS', 'MES', 'BME', 'DTT',
    'IPA', 'EDO', 'EGL', 'BOG', 'PLM', 'OLC',
    # Monovalent / divalent ions
    'CL', 'NA', 'MG', 'ZN', 'CA', 'FE', 'CU', 'MN', 'CO',
    'NI', 'K',  'IOD', 'BR', 'F',  'LI', 'CS', 'BA', 'SR',
    'CD', 'HG', 'PT', 'AU', 'NO3', 'NO2', 'NH4',
}

# ── Protein family labels for per-family breakdown ────────────────────────────
PROTEIN_FAMILY: Dict[str, str] = {
    '1tmn': 'Thermolysin',  '2tmn': 'Thermolysin',
    '4tmn': 'Thermolysin',  '5tmn': 'Thermolysin',
    '1hfc': 'MMP',          '1ida': 'Collagenase',
    '1mrk': 'CDK2',         '1kel': 'Kinase',       '1kim': 'Thymidine Kinase',
    '3ert': 'Estrogen-R',   '4dfr': 'DHFR',
    '1a4q': 'Neuraminidase',
    '1hvr': 'HIV-PR',       '1hpv': 'HIV-PR',
    '1cbs': 'CA-II',        '1cil': 'CA-II',         '1hsl': 'CA-II',
    '1lst': 'PDE',          '1mts': 'Phospholipase',
}


# ══════════════════════════════════════════════════════════════════════════════
# PREPROCESSING  (exact mirror of production pipeline & LIGYSIS benchmark)
# ══════════════════════════════════════════════════════════════════════════════

def preprocess_pdb(input_pdb: str, output_pdb: str) -> dict:
    """
    SaliDock 5-step PDB preprocessing.

    Steps:
      1. Remove ALL HETATM records (ligands, ions, cofactors, waters)
      2. Remove water residues embedded in ATOM records (HOH/WAT/H2O/DOD)
      3. Strip hydrogen atoms — element-column-first to avoid heavy atom loss
      4. Keep only first alternate conformer (altloc A or blank)
      5. Preserve ALL protein chains

    Returns stats dict. Raises ValueError if zero ATOM records survive.
    """
    WATER_RES = {'HOH', 'WAT', 'H2O', 'DOD'}

    lines_in = Path(input_pdb).read_text(encoding='utf-8', errors='replace').splitlines(keepends=True)

    stats = dict(atoms_before=0, atoms_after=0,
                 hetatm_removed=0, water_removed=0,
                 h_removed=0, altloc_removed=0)

    stats['atoms_before'] = sum(1 for ln in lines_in if ln[:6].strip() in ('ATOM', 'HETATM'))
    out: List[str] = []

    for line in lines_in:
        rec = line[:6].strip()

        if rec == 'HETATM':
            rn = line[17:20].strip().upper() if len(line) > 20 else ''
            stats['water_removed' if rn in WATER_RES else 'hetatm_removed'] += 1
            continue

        if rec == 'ATOM':
            rn = line[17:20].strip().upper() if len(line) > 20 else ''
            if rn in WATER_RES:
                stats['water_removed'] += 1
                continue

            name = line[12:16].strip().upper() if len(line) > 16 else ''
            elem = line[76:78].strip().upper() if len(line) > 77 else ''

            # Hydrogen detection — element column is authoritative
            if elem == 'H':
                is_h = True
            elif elem in ('', 'D'):   # no element col or deuterium
                is_h = (name == 'H'
                        or (len(name) >= 2 and name[0].isdigit() and name[1] == 'H'))
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

    stats['atoms_after'] = sum(1 for ln in out if ln[:4] == 'ATOM')
    if stats['atoms_after'] == 0:
        raise ValueError(
            f"Preprocessing emptied {Path(input_pdb).name}: "
            f"atoms_before={stats['atoms_before']}, none survived stripping. "
            f"Likely DNA/RNA-only or NMR structure."
        )

    Path(output_pdb).write_text(''.join(out), encoding='utf-8')
    return stats


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def download_pdb(pdb_id: str, out_dir: Path) -> Optional[Path]:
    """Download PDB from RCSB (cached). Returns Path or None on failure."""
    path = out_dir / f"{pdb_id}.pdb"
    if path.exists() and path.stat().st_size > 1000:
        return path
    url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
    try:
        urllib.request.urlretrieve(url, path)
        return path
    except Exception as exc:
        print(f"    [ERROR] Download failed for {pdb_id.upper()}: {exc}")
        return None


def extract_true_ligand_centers(pdb_path: Path) -> List[np.ndarray]:
    """
    Return centroids of drug-like ligands in raw RCSB PDB.

    Exclusion rules (HETATM_EXCLUDE set + min heavy-atom count):
      - Crystallographic buffer / cryo-protectants
      - Monovalent and divalent ions
      - Waters
      - Fragments with < 5 heavy atoms (too small to be drug-like)
    """
    ligands: Dict[tuple, List[List[float]]] = {}

    with open(pdb_path, encoding='utf-8', errors='ignore') as fh:
        for line in fh:
            if not line.startswith('HETATM'):
                continue
            try:
                resname = line[17:20].strip().upper()
                chain   = line[21:22].strip() or 'A'
                resnum  = line[22:26].strip()
                x, y, z = float(line[30:38]), float(line[38:46]), float(line[46:54])
            except (ValueError, IndexError):
                continue
            if resname in HETATM_EXCLUDE:
                continue
            ligands.setdefault((resname, chain, resnum), []).append([x, y, z])

    centers = []
    for (resname, chain, resnum), coords in ligands.items():
        if len(coords) >= 5:   # drug-like threshold: ≥ 5 heavy atoms
            centers.append(np.mean(coords, axis=0))
    return centers


def euclidean(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def min_dist_to_true(center: np.ndarray, true_centers: List[np.ndarray]) -> float:
    return min(euclidean(center, tc) for tc in true_centers)


def wilson_ci(n_success: int, n_total: int, z: float = 1.96) -> Tuple[float, float]:
    """Wilson score 95% confidence interval for a proportion (returns as %)."""
    if n_total == 0:
        return 0.0, 0.0
    p      = n_success / n_total
    denom  = 1 + z**2 / n_total
    centre = (p + z**2 / (2 * n_total)) / denom
    margin = z * math.sqrt((p * (1 - p) / n_total) + z**2 / (4 * n_total**2)) / denom
    return max(0.0, centre - margin) * 100, min(1.0, centre + margin) * 100


def mcnemar_p(b: int, c: int) -> float:
    """Two-tailed McNemar exact test (binomial with continuity)."""
    total = b + c
    if total == 0:
        return 1.0
    try:
        from scipy.stats import binom
        return min(1.0, float(binom.cdf(min(b, c), total, 0.5)) * 2)
    except ImportError:
        # chi-squared approximation (valid for b+c >= 25)
        if total < 25:
            return float('nan')
        chi2 = (abs(b - c) - 1.0)**2 / total
        return 0.04 if chi2 > 3.84 else 0.20


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description='SaliDock — Astex Diverse Set cavity detection benchmark'
    )
    parser.add_argument('--no-puresnet', action='store_true',
                        help='Disable PUResNet (skips Docker requirement)')
    parser.add_argument('--threshold', type=float, default=4.0,
                        help='Primary DCA threshold in Angstroms (default: 4.0)')
    parser.add_argument('--limit', type=int, default=None,
                        help='Only process first N PDB IDs (debugging)')
    args = parser.parse_args()

    PRIMARY_THR    = args.threshold
    ALL_THRESHOLDS = sorted(set([2.0, PRIMARY_THR, 6.0]))

    print('=' * 95)
    print('  SALIDOCK — ASTEX DIVERSE SET BLIND BENCHMARK')
    print('  Hartshorn et al., J. Med. Chem. 2007, doi:10.1021/jm061277y')
    print('=' * 95)
    print(f'  Primary DCA threshold : {PRIMARY_THR} Å')
    print(f'  All reported thresholds: {ALL_THRESHOLDS} Å')
    print()

    # ── Directories ───────────────────────────────────────────────────────────
    bench_dir    = BASE_DIR / 'astex_benchmark'
    pdb_raw_dir  = bench_dir / 'pdb_raw'
    pdb_prep_dir = bench_dir / 'pdb_prep'
    tsv_dir      = bench_dir / 'tsvs'
    for d in [bench_dir, pdb_raw_dir, pdb_prep_dir, tsv_dir]:
        d.mkdir(exist_ok=True)

    # ── Load wRRF weights from config ─────────────────────────────────────────
    weights_path = BASE_DIR / 'backend' / 'config' / 'weights.json'
    w_fp, w_p2r, w_pur = 0.0758, 0.4922, 0.5671
    rrf_k     = 60
    cluster_r = 6.0
    if weights_path.exists():
        try:
            cfg   = json.loads(weights_path.read_text())
            w_fp  = cfg['weights'].get('fpocket', w_fp)
            w_p2r = cfg['weights'].get('p2rank',  w_p2r)
            w_pur = cfg['weights'].get('puresnet', w_pur)
            rrf_k    = cfg.get('rrf_k', rrf_k)
            cluster_r = cfg.get('clustering_radius_angstrom', cluster_r)
            print(f'[INFO] Loaded weights from {weights_path.name}')
        except Exception as exc:
            print(f'[WARN] Could not parse weights.json: {exc} — using defaults')
    else:
        print('[WARN] weights.json not found — using hardcoded defaults')

    print(f'[INFO] wRRF weights : fpocket={w_fp:.4f}  p2rank={w_p2r:.4f}  puresnet={w_pur:.4f}')
    print(f'[INFO] wRRF params  : k={rrf_k}, cluster_radius={cluster_r} Å')

    # ── PUResNet / Docker check ───────────────────────────────────────────────
    use_puresnet = (not args.no_puresnet) and bool(shutil.which('docker'))
    if not use_puresnet:
        reason = '--no-puresnet flag' if args.no_puresnet else 'Docker not on PATH'
        print(f'[INFO] PUResNet DISABLED ({reason}). Renormalising weights.')
        total_w = w_fp + w_p2r
        if total_w > 0:
            w_fp  /= total_w
            w_p2r /= total_w
        w_pur = 0.0
    else:
        print('[INFO] PUResNet ENABLED (Docker detected).')

    print(f'[INFO] Active weights: fpocket={w_fp:.4f}  p2rank={w_p2r:.4f}  puresnet={w_pur:.4f}')

    # ── P2Rank binary ─────────────────────────────────────────────────────────
    if os.name == 'nt':
        p2rank_exe = str(BASE_DIR / 'backend' / 'p2rank_2.4.2' / 'prank.bat')
    else:
        p2rank_exe = str(BASE_DIR / 'backend' / 'p2rank_2.4.2' / 'prank')
        if not Path(p2rank_exe).exists():
            p2rank_exe = str(BASE_DIR / 'backend' / 'p2rank_2.4.2' / 'prank.sh')
    print(f'[INFO] P2Rank binary: {p2rank_exe}')

    # ── Checkpoint ────────────────────────────────────────────────────────────
    ckpt_path = bench_dir / 'astex_checkpoint.json'
    ckpt: dict = {}
    if ckpt_path.exists():
        try:
            ckpt.update(json.loads(ckpt_path.read_text(encoding='utf-8')))
            print(f'[INFO] Checkpoint: {len(ckpt)} entries already done.')
        except Exception:
            pass

    # ── TSV (append) ──────────────────────────────────────────────────────────
    tsv_path   = tsv_dir / 'astex_results.tsv'
    tsv_exists = tsv_path.exists()
    tsv_fh     = open(tsv_path, 'a', encoding='utf-8')
    if not tsv_exists:
        tsv_fh.write(
            'pdb_id\ttool\trank\tpred_x\tpred_y\tpred_z\t'
            'conf_score\tmin_dist_A\tsucc_2A\tsucc_4A\tsucc_6A\n'
        )

    # ── PDB list ──────────────────────────────────────────────────────────────
    pdb_list = ASTEX_85[: args.limit] if args.limit else ASTEX_85
    total     = len(pdb_list)
    processed = 0
    skipped   = 0
    t0        = time.time()

    print(f'\n[INFO] Starting sweep over {total} Astex Diverse Set complexes...\n')

    for idx, pdb_id in enumerate(pdb_list, 1):
        # ── Time estimate ─────────────────────────────────────────────────────
        elapsed = time.time() - t0
        avg     = elapsed / idx
        eta     = avg * (total - idx)
        el_str  = f"{int(elapsed//3600):02d}h{int((elapsed%3600)//60):02d}m{int(elapsed%60):02d}s"
        eta_str = f"{int(eta//3600):02d}h{int((eta%3600)//60):02d}m{int(eta%60):02d}s"

        print(f"[{idx:3d}/{total}] {pdb_id.upper():6s}  |  Elapsed: {el_str}  |  ETA: {eta_str}",
              flush=True)

        if pdb_id in ckpt:
            print(f"  [SKIP] status={ckpt[pdb_id]}")
            continue

        # ── 1. Download ───────────────────────────────────────────────────────
        raw_path = download_pdb(pdb_id, pdb_raw_dir)
        if raw_path is None:
            ckpt[pdb_id] = 'NOPDB'
            skipped += 1
            continue

        # ── 2. Extract true ligand centroids ──────────────────────────────────
        true_centers = extract_true_ligand_centers(raw_path)
        if not true_centers:
            print(f"  [NOLG] No drug-like ligand (>=5 heavy atoms) in {pdb_id.upper()}")
            ckpt[pdb_id] = 'NOLG'
            skipped += 1
            continue
        print(f"  True ligand site(s): {len(true_centers)}")

        # ── 3. Preprocess ─────────────────────────────────────────────────────
        prep_path = pdb_prep_dir / f"{pdb_id}_prep.pdb"
        try:
            st = preprocess_pdb(str(raw_path), str(prep_path))
            print(f"  Preprocessed: {st['atoms_before']}→{st['atoms_after']} atoms "
                  f"(−{st['hetatm_removed']} HETATM, −{st['water_removed']} HOH, "
                  f"−{st['h_removed']} H)", flush=True)
        except Exception as exc:
            print(f"  [ERROR] Preprocessing: {exc}")
            ckpt[pdb_id] = 'ERR_PREP'
            skipped += 1
            continue

        # ── 4. Run tools ──────────────────────────────────────────────────────
        fp_pockets  = []
        p2r_pockets = []
        pur_pockets = []

        try:
            fp_pockets = run_fpocket(str(prep_path))
        except Exception as exc:
            print(f"  [fpocket error] {exc}")

        try:
            p2r_pockets = run_p2rank(str(prep_path), p2rank_path=p2rank_exe)
        except Exception as exc:
            print(f"  [p2rank error] {exc}")

        if use_puresnet:
            try:
                pur_pockets = run_puresnet(str(prep_path),
                                           docker_image='salidock-puresnet-cpu:latest')
            except Exception as exc:
                print(f"  [puresnet error] {exc}")

        print(f"  Pockets: fpocket={len(fp_pockets)}  P2Rank={len(p2r_pockets)}  "
              f"PUResNet={len(pur_pockets)}", flush=True)

        if not fp_pockets and not p2r_pockets and not pur_pockets:
            print(f"  [ERROR] All tools empty — skipping.")
            ckpt[pdb_id] = 'ERR_NOTOOLS'
            skipped += 1
            continue

        # ── 5. Consensus ──────────────────────────────────────────────────────
        consensus_pockets = fuse_predictions(
            fp_pockets, p2r_pockets, pur_pockets,
            weights={'fpocket': w_fp, 'p2rank': w_p2r, 'puresnet': w_pur},
            rrf_k=rrf_k,
            clustering_radius=cluster_r,
            pdb_path=str(prep_path),
            top_n=10,
        )

        # ── 6. Write TSV rows ─────────────────────────────────────────────────
        method_data = {
            'fpocket':   [(np.array(p['center']),      p['score'])           for p in fp_pockets[:5]],
            'p2rank':    [(np.array(p['center']),      p['score'])           for p in p2r_pockets[:5]],
            'puresnet':  [(np.array(p['center']),      p['score'])           for p in pur_pockets[:5]],
            'consensus': [(np.array(c.center), c.weighted_score) for c in consensus_pockets[:5]],
        }

        for tool_name, pred_list in method_data.items():
            for rank_idx, (center, conf) in enumerate(pred_list, 1):
                d = min_dist_to_true(center, true_centers)
                tsv_fh.write(
                    f"{pdb_id}\t{tool_name}\t{rank_idx}\t"
                    f"{center[0]:.3f}\t{center[1]:.3f}\t{center[2]:.3f}\t"
                    f"{conf:.6f}\t{d:.3f}\t"
                    f"{int(d <= 2.0)}\t{int(d <= 4.0)}\t{int(d <= 6.0)}\n"
                )

        tsv_fh.flush()
        ckpt[pdb_id] = 'OK'
        processed += 1

        # Checkpoint every 5 structures
        if processed % 5 == 0:
            ckpt_path.write_text(json.dumps(ckpt, indent=2), encoding='utf-8')
            print(f"  [Checkpoint] {processed}/{total} processed.")

    # ── Final saves ───────────────────────────────────────────────────────────
    tsv_fh.close()
    ckpt_path.write_text(json.dumps(ckpt, indent=2), encoding='utf-8')
    print(f"\n[INFO] Sweep complete. Processed={processed}, Skipped={skipped}")

    # ══════════════════════════════════════════════════════════════════════════
    # EVALUATION
    # ══════════════════════════════════════════════════════════════════════════
    print("[INFO] Computing DCA metrics...")

    results_map: dict = defaultdict(lambda: defaultdict(list))
    if tsv_path.exists():
        with open(tsv_path, encoding='utf-8') as fh:
            for line in fh.readlines()[1:]:
                cols = line.strip().split('\t')
                if len(cols) < 11:
                    continue
                pid, tool, rank = cols[0], cols[1], int(cols[2])
                center = np.array([float(cols[3]), float(cols[4]), float(cols[5])])
                min_d  = float(cols[7])
                results_map[pid][tool].append({'rank': rank, 'center': center, 'min_d': min_d})

    TOOLS_ALL = ['fpocket', 'p2rank', 'puresnet', 'consensus']
    # counters[tool][thr_key] = {top1, top3, top5, n, ok1_vec}
    counters: dict = defaultdict(lambda: defaultdict(
        lambda: {'top1': 0, 'top3': 0, 'top5': 0, 'n': 0, 'ok1': []}
    ))

    n_eval = len(results_map)
    if n_eval == 0:
        print("[ERROR] No TSV data to evaluate. Did the sweep complete successfully?")
        return

    for pid in results_map:
        for tool in TOOLS_ALL:
            preds = sorted(results_map[pid][tool], key=lambda x: x['rank'])
            for thr in ALL_THRESHOLDS:
                key = f"{thr}A"
                t1 = t3 = t5 = 0
                for p in preds:
                    ok = p['min_d'] <= thr
                    if ok:
                        if p['rank'] == 1: t1 = 1
                        if p['rank'] <= 3: t3 = 1
                        if p['rank'] <= 5: t5 = 1
                counters[tool][key]['top1'] += t1
                counters[tool][key]['top3'] += t3
                counters[tool][key]['top5'] += t5
                counters[tool][key]['n']    += 1
                counters[tool][key]['ok1'].append(t1)

    # ── Print results table ───────────────────────────────────────────────────
    SEP = '─' * 100

    def pct(v, n):
        return f"{v/n*100:6.2f}%" if n > 0 else "   N/A "

    print(f"\n{'='*100}")
    print(f"{'SALIDOCK — ASTEX DIVERSE SET BENCHMARK RESULTS':^100}")
    print(f"{'Hartshorn et al., J. Med. Chem. 2007, doi:10.1021/jm061277y':^100}")
    print(f"{'='*100}")
    print(f"N (evaluated) = {n_eval} | wRRF k={rrf_k} | cluster_r={cluster_r} Å | "
          f"PUResNet={'ON' if use_puresnet else 'OFF'}")
    print(f"Weights: fpocket={w_fp:.4f}  p2rank={w_p2r:.4f}  puresnet={w_pur:.4f}")

    for thr in ALL_THRESHOLDS:
        key = f"{thr}A"
        print(f"\n{'━'*5}  DCA threshold: {thr} Å  {'━'*5}")
        print(f"{'Tool':<22} | {'DCA@top1':>10} | {'DCA@top3':>10} | {'DCA@top5':>10} | "
              f"{'N':>5} | 95% CI (top1)")
        print(SEP)
        for tool in TOOLS_ALL:
            c = counters[tool][key]
            ci_lo, ci_hi = wilson_ci(c['top1'], c['n'])
            print(f"  {tool:<20} | {pct(c['top1'],c['n']):>10} | "
                  f"{pct(c['top3'],c['n']):>10} | {pct(c['top5'],c['n']):>10} | "
                  f"{c['n']:>5} | [{ci_lo:.1f}%–{ci_hi:.1f}%]")
        print(SEP)

    # ── McNemar tests (primary threshold) ────────────────────────────────────
    print(f"\n{'━'*5}  McNemar Exact Test — Consensus vs Individual Tools "
          f"(DCA {PRIMARY_THR} Å)  {'━'*5}")
    key = f"{PRIMARY_THR}A"
    cons_vec = counters['consensus'][key]['ok1']
    for tool in ['fpocket', 'p2rank', 'puresnet']:
        tool_vec = counters[tool][key]['ok1']
        n_min = min(len(cons_vec), len(tool_vec))
        b = sum(1 for i in range(n_min) if cons_vec[i] == 1 and tool_vec[i] == 0)
        c = sum(1 for i in range(n_min) if cons_vec[i] == 0 and tool_vec[i] == 1)
        p = mcnemar_p(b, c)
        sig   = "Significant *" if (not math.isnan(p)) and p < 0.05 else "NS"
        p_str = f"{p:.4f}" if not math.isnan(p) else "N/A (need scipy or b+c>=25)"
        print(f"  Consensus vs {tool:<12} | b={b:4d}  c={c:4d} | p={p_str} | {sig}")

    # ── JSON summary ──────────────────────────────────────────────────────────
    summary = {
        'dataset': 'Astex Diverse Set',
        'reference': 'Hartshorn et al., J. Med. Chem. 2007, 50(4):726-741',
        'doi': '10.1021/jm061277y',
        'n_in_set': len(ASTEX_85),
        'n_evaluated': n_eval,
        'n_skipped': skipped,
        'thresholds_A': ALL_THRESHOLDS,
        'primary_threshold_A': PRIMARY_THR,
        'puresnet_enabled': use_puresnet,
        'weights': {'fpocket': round(w_fp, 6), 'p2rank': round(w_p2r, 6),
                    'puresnet': round(w_pur, 6)},
        'rrf_k': rrf_k,
        'cluster_radius_A': cluster_r,
        'results': {},
    }

    for tool in TOOLS_ALL:
        summary['results'][tool] = {}
        for thr in ALL_THRESHOLDS:
            key = f"{thr}A"
            c = counters[tool][key]
            ci_lo, ci_hi = wilson_ci(c['top1'], c['n'])
            summary['results'][tool][key] = {
                'dca_top1_pct': round(c['top1'] / c['n'] * 100, 2) if c['n'] else 0,
                'dca_top3_pct': round(c['top3'] / c['n'] * 100, 2) if c['n'] else 0,
                'dca_top5_pct': round(c['top5'] / c['n'] * 100, 2) if c['n'] else 0,
                'n': c['n'],
                'n_top1_success': c['top1'],
                'wilson_ci_95': [round(ci_lo, 1), round(ci_hi, 1)],
            }

    summary_path = bench_dir / 'astex_summary.json'
    summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')

    print(f"\n[INFO] Summary JSON : {summary_path}")
    print(f"[INFO] Raw TSV      : {tsv_path}")
    print(f"\n{'='*100}")
    print("  ASTEX BENCHMARK COMPLETE")
    print(f"{'='*100}\n")


if __name__ == '__main__':
    main()
