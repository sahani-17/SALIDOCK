#!/usr/bin/env python
"""
run_ligysis_preprocessing_benchmark.py
=======================================
LIGYSIS-2024 blind validation — measures preprocessing impact on DCA@top-1.

Preprocessing is applied AFTER chain isolation (not before), since:
  - LIGYSIS evaluates single-chain units against cluster-superimposed true sites
  - Chain isolation itself is part of the LIGYSIS protocol
  - Preprocessing cleans the isolated chain (remove H, HETATM, waters, ALTLOC)

Two prediction modes run in parallel for each target chain:
  A. Raw isolated chain  (baseline — matches original run_ligysis_benchmark.py)
  B. Preprocessed chain  (H-free, HETATM-free, water-free, single ALTLOC)

Outputs (written to salidock_benchmark/preprocessing_results/):
  - ligysis_preprocessing_checkpoint_raw.json
  - ligysis_preprocessing_checkpoint_prep.json
  - ligysis_preprocessing_report.txt
  - ligysis_preprocessing_delta.png
"""

from __future__ import annotations

import os
import sys
import json
import math
import pickle
import shutil
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

import numpy as np

# ── Path setup ───────────────────────────────────────────────────────────────
benchmark_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(benchmark_dir.parent))

from salidock.cavity.runners import run_fpocket, run_p2rank, run_puresnet
from salidock.cavity.fusion import fuse_predictions

# ── Constants ────────────────────────────────────────────────────────────────
DCA_THRESHOLD = 4.0   # Angstroms

CONSENSUS_WEIGHTS = {
    'fpocket':  0.0947,
    'p2rank':   0.4054,
    'puresnet': 0.4999,
}


# ── Preprocessing ─────────────────────────────────────────────────────────────

def preprocess_pdb(input_pdb: str, output_pdb: str) -> dict:
    """
    5-step SaliDock preprocessing (pure Python, no external deps):
      1. Remove HETATM records (ligands, cofactors, ions)
      2. Remove water molecules (HOH, WAT, H2O)
      3. Remove hydrogen atoms
      4. Keep only first alternate conformation (ALTLOC A or blank)
      5. Keep all chains (no-op — already isolated)
    """
    WATER_RESNAMES = {'HOH', 'WAT', 'H2O', 'DOD'}
    H_PREFIXES = ('H', '1H', '2H', '3H', '4H', 'HD', 'HE', 'HG', 'HH', 'HZ')

    lines_in = Path(input_pdb).read_text(encoding='utf-8', errors='replace').splitlines(keepends=True)
    atoms_before = sum(1 for l in lines_in if l.startswith(('ATOM', 'HETATM')))

    hetatm_removed = water_removed = h_removed = altloc_removed = 0
    out_lines: list = []

    for line in lines_in:
        rec = line[:6].strip()

        if rec == 'HETATM':
            resname = line[17:20].strip().upper()
            if resname in WATER_RESNAMES:
                water_removed += 1
            else:
                hetatm_removed += 1
            continue

        if rec == 'ATOM':
            atom_name = line[12:16].strip().upper()
            element   = line[76:78].strip().upper() if len(line) > 76 else ''

            is_h = (
                element == 'H'
                or atom_name == 'H'
                or atom_name.startswith(H_PREFIXES)
                or (len(atom_name) >= 2 and atom_name[0].isdigit() and atom_name[1] == 'H')
            )
            if is_h:
                h_removed += 1
                continue

            altloc = line[16:17]
            if altloc not in (' ', 'A', ''):
                altloc_removed += 1
                continue

            out_lines.append(line)
            continue

        out_lines.append(line)

    atoms_after = sum(1 for l in out_lines if l.startswith('ATOM'))
    if atoms_after == 0:
        raise ValueError(f"Preprocessing removed ALL atoms from {input_pdb}")

    Path(output_pdb).write_text(''.join(out_lines), encoding='utf-8')
    return {
        'atoms_before':   atoms_before,
        'atoms_after':    atoms_after,
        'hetatm_removed': hetatm_removed,
        'water_removed':  water_removed,
        'h_removed':      h_removed,
        'altloc_removed': altloc_removed,
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def isolate_chain(raw_pdb_path: str, isolated_pdb_path: str, chain_id: str):
    with open(raw_pdb_path, encoding='utf-8', errors='ignore') as fh:
        lines = fh.readlines()
    out = [l for l in lines
           if not l.startswith(('ATOM', 'HETATM')) or (l[21].strip() or 'A') == chain_id]
    out.append('END\n')
    Path(isolated_pdb_path).write_text(''.join(out), encoding='utf-8')


def euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def wilson_ci(n_success: int, n_total: int, z: float = 1.96) -> Tuple[float, float]:
    if n_total == 0:
        return 0.0, 0.0
    p = n_success / n_total
    denom  = 1 + z**2 / n_total
    centre = (p + z**2 / (2 * n_total)) / denom
    margin = z * math.sqrt((p * (1 - p) / n_total) + z**2 / (4 * n_total**2)) / denom
    return max(0.0, centre - margin) * 100, min(1.0, centre + margin) * 100


def mcnemar_p(b: int, c: int) -> float:
    total = b + c
    if total == 0:
        return 1.0
    try:
        from scipy.stats import binom
        return min(1.0, binom.cdf(min(b, c), total, 0.5) * 2)
    except ImportError:
        return float('nan')


def run_tools(pdb_path: str, p2rank_exe: str, use_puresnet: bool) -> dict:
    """Run all three tools on a PDB and return pocket lists."""
    try:
        fp = run_fpocket(pdb_path)
    except Exception as exc:
        print(f"    [fpocket error] {exc}")
        fp = []
    try:
        p2r = run_p2rank(pdb_path, p2rank_path=p2rank_exe)
    except Exception as exc:
        print(f"    [p2rank error] {exc}")
        p2r = []
    pur = []
    if use_puresnet:
        try:
            pur = run_puresnet(pdb_path, docker_image='salidock-puresnet-cpu:latest')
        except Exception as exc:
            print(f"    [puresnet error] {exc}")
    return {'fpocket': fp, 'p2rank': p2r, 'puresnet': pur}


def wrrf_top1(
    fp: list, p2r: list, pur: list,
    weights: dict, k: int = 60, radius: float = 6.0
) -> Optional[np.ndarray]:
    """Compute wRRF top-1 centre directly (fast, skips residue annotation)."""
    all_pockets = []
    tool_map = {'fpocket': fp, 'p2rank': p2r, 'puresnet': pur}
    for tool_name, pockets in tool_map.items():
        w = weights.get(tool_name, 0.0)
        if w <= 0.0:
            continue
        for rank_0, p in enumerate(pockets):
            all_pockets.append({**p, 'tool': tool_name, 'rank': rank_0 + 1})

    if not all_pockets:
        return None

    clusters: list = []
    for pocket in all_pockets:
        center = pocket['center']
        assigned = False
        for c in clusters:
            if euclidean_distance(center, c['center']) <= radius:
                c['members'].append(pocket)
                c['center'] = np.mean([m['center'] for m in c['members']], axis=0)
                c['tools'].add(pocket['tool'])
                assigned = True
                break
        if not assigned:
            clusters.append({'center': center.copy(), 'members': [pocket], 'tools': {pocket['tool']}})

    for c in clusters:
        score = 0.0
        for tool_name, w in weights.items():
            tm = [m for m in c['members'] if m['tool'] == tool_name]
            if tm:
                score += w / (k + min(m['rank'] for m in tm))
        c['wrrf'] = score

    clusters.sort(key=lambda c: c['wrrf'], reverse=True)
    return clusters[0]['center']


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print('=' * 90)
    print('  LIGYSIS-2024 PREPROCESSING IMPACT BENCHMARK')
    print('=' * 90)

    out_dir       = benchmark_dir / 'preprocessing_results'
    pdb_dir       = benchmark_dir / 'pdb'
    pdb_iso_dir   = benchmark_dir / 'pdb_isolated'
    prep_iso_dir  = out_dir / 'pdb_isolated_preprocessed'
    out_dir.mkdir(exist_ok=True)
    pdb_dir.mkdir(exist_ok=True)
    pdb_iso_dir.mkdir(exist_ok=True)
    prep_iso_dir.mkdir(exist_ok=True)

    # ── Load LIGYSIS metadata ─────────────────────────────────────────────────
    optuna_dir = benchmark_dir / 'optuna'
    required = [
        optuna_dir / 'LIGYSIS_3448_chains.pkl',
        optuna_dir / 'PDB_rot_matrices_ALL_CLUST.pkl',
        optuna_dir / 'translation_vectors.json',
        optuna_dir / 'LIGYSIS_sites_DEF_TRANS.pkl',
        optuna_dir / 'optimal_weights.json',
    ]
    if not all(p.exists() for p in required):
        print('[ERROR] Required LIGYSIS data files missing in salidock_benchmark/optuna/')
        sys.exit(1)

    with open(required[0], 'rb') as f:
        chains = pickle.load(f)
    with open(required[1], 'rb') as f:
        rot_matrices = pickle.load(f)
    with open(required[2], encoding='utf-8') as f:
        translation_vectors = json.load(f)
    import pandas as pd
    sites_df = pd.read_pickle(required[3])
    with open(required[4], encoding='utf-8') as f:
        opt_w = json.load(f)

    # Use previously optimised weights (override defaults if available)
    w = {
        'fpocket':  opt_w.get('w_fpocket',  CONSENSUS_WEIGHTS['fpocket']),
        'p2rank':   opt_w.get('w_p2rank',   CONSENSUS_WEIGHTS['p2rank']),
        'puresnet': opt_w.get('w_puresnet', CONSENSUS_WEIGHTS['puresnet']),
    }
    print(f"Weights: fpocket={w['fpocket']:.4f}, p2rank={w['p2rank']:.4f}, puresnet={w['puresnet']:.4f}\n")

    # Build true_sites map
    true_sites: Dict[str, List[np.ndarray]] = defaultdict(list)
    for _, row in sites_df.iterrows():
        true_sites[row['rep_chain']].append(np.array(row['centre']))

    # ── P2Rank binary ─────────────────────────────────────────────────────────
    if os.name == 'nt':
        p2rank_exe = str(benchmark_dir.parent / 'backend' / 'p2rank_2.4.2' / 'prank.bat')
    else:
        p2rank_exe = str(benchmark_dir.parent / 'backend' / 'p2rank_2.4.2' / 'prank')
        if not Path(p2rank_exe).exists():
            p2rank_exe = str(benchmark_dir.parent / 'backend' / 'p2rank_2.4.2' / 'prank.sh')

    use_puresnet = bool(shutil.which('docker'))
    if not use_puresnet:
        print('[INFO] Docker not found — PUResNet disabled, weights renormalised')
        w['puresnet'] = 0.0
        total = w['fpocket'] + w['p2rank']
        w['fpocket'] /= total
        w['p2rank']  /= total

    # ── Checkpoint files ──────────────────────────────────────────────────────
    ckpt_raw_path  = out_dir / 'ligysis_ckpt_raw.json'
    ckpt_prep_path = out_dir / 'ligysis_ckpt_prep.json'

    ckpt_raw:  dict = {}
    ckpt_prep: dict = {}
    for path, d in [(ckpt_raw_path, ckpt_raw), (ckpt_prep_path, ckpt_prep)]:
        if path.exists():
            try:
                d.update(json.loads(path.read_text(encoding='utf-8')))
            except Exception:
                pass

    print(f"[INFO] Checkpoints: raw={len(ckpt_raw)}, preprocessed={len(ckpt_prep)} entries loaded")

    total = len(chains)
    tools_list = ['fpocket', 'p2rank', 'puresnet']

    # TSV file handles (append mode)
    tsv_dir = out_dir / 'tsvs'
    tsv_dir.mkdir(exist_ok=True)
    tsvs: dict = {}
    for mode in ['raw', 'preprocessed']:
        for tool in tools_list:
            key = f"{mode}_{tool}"
            tsv_path = tsv_dir / f"LIGYSIS_{mode}_{tool}.tsv"
            exists = tsv_path.exists()
            tsvs[key] = open(tsv_path, 'a', encoding='utf-8')
            if not exists:
                tsvs[key].write('protein_id\tmode\ttool\trank\tpred_x\tpred_y\tpred_z\tconf\tdist\n')

    # ── Main sweep ────────────────────────────────────────────────────────────
    processed = len(ckpt_raw)  # approx

    for idx, target_chain in enumerate(chains, 1):
        already_raw  = target_chain in ckpt_raw
        already_prep = target_chain in ckpt_prep
        if already_raw and already_prep:
            continue

        print(f"[{idx}/{total}] {target_chain}", flush=True)

        pdb_id, chain_id = target_chain.split('_')
        pdb_path = pdb_dir / f"{pdb_id}.pdb"

        # Download if needed
        if not pdb_path.exists():
            try:
                urllib.request.urlretrieve(
                    f"https://files.rcsb.org/download/{pdb_id}.pdb", pdb_path
                )
            except Exception:
                print(f"  [ERROR] Download failed for {pdb_id.upper()}")
                continue

        # Validity checks
        if target_chain not in rot_matrices or target_chain not in translation_vectors:
            print(f"  [SKIP] No R/T matrix for {target_chain}")
            continue
        if target_chain not in true_sites:
            print(f"  [SKIP] No true sites for {target_chain}")
            continue

        R = np.array(rot_matrices[target_chain])
        T = np.array(translation_vectors[target_chain])
        chain_true_sites = true_sites[target_chain]

        # Isolate chain
        iso_path = pdb_iso_dir / f"{target_chain}.pdb"
        try:
            if not iso_path.exists():
                isolate_chain(str(pdb_path), str(iso_path), chain_id)
        except Exception as exc:
            print(f"  [ERROR] Chain isolation failed: {exc}")
            continue

        # ── Mode A: Raw isolated chain ────────────────────────────────────────
        if not already_raw:
            print("  → Raw tools...", flush=True)
            try:
                pockets_raw = run_tools(str(iso_path), p2rank_exe, use_puresnet)
                for tool in tools_list:
                    key = f"raw_{tool}"
                    for r_idx, p in enumerate(pockets_raw[tool][:5], 1):
                        aligned = R.dot(p['center']) + T
                        d = min(euclidean_distance(aligned, tc) for tc in chain_true_sites)
                        ax, ay, az = aligned
                        tsvs[key].write(
                            f"{target_chain}\traw\t{tool}\t{r_idx}\t{ax:.3f}\t{ay:.3f}\t{az:.3f}\t{p['score']:.4f}\t{d:.3f}\n"
                        )
                ckpt_raw[target_chain] = True
            except Exception as exc:
                print(f"  [ERROR] Raw run failed: {exc}")

        # ── Mode B: Preprocessed isolated chain ───────────────────────────────
        if not already_prep:
            prep_path = prep_iso_dir / f"{target_chain}_prep.pdb"
            try:
                stats = preprocess_pdb(str(iso_path), str(prep_path))
                print(f"  → Preprocessed: {stats['atoms_before']}→{stats['atoms_after']} atoms "
                      f"(−{stats['hetatm_removed']} HETATM, −{stats['water_removed']} HOH, "
                      f"−{stats['h_removed']} H)", flush=True)
            except Exception as exc:
                print(f"  [ERROR] Preprocessing failed: {exc}")
                continue

            try:
                pockets_prep = run_tools(str(prep_path), p2rank_exe, use_puresnet)
                for tool in tools_list:
                    key = f"preprocessed_{tool}"
                    for r_idx, p in enumerate(pockets_prep[tool][:5], 1):
                        aligned = R.dot(p['center']) + T
                        d = min(euclidean_distance(aligned, tc) for tc in chain_true_sites)
                        ax, ay, az = aligned
                        tsvs[key].write(
                            f"{target_chain}\tpreprocessed\t{tool}\t{r_idx}\t{ax:.3f}\t{ay:.3f}\t{az:.3f}\t{p['score']:.4f}\t{d:.3f}\n"
                        )
                ckpt_prep[target_chain] = True
            except Exception as exc:
                print(f"  [ERROR] Preprocessed run failed: {exc}")

        # Save checkpoints every 10 structures
        processed += 1
        if processed % 10 == 0:
            ckpt_raw_path.write_text(json.dumps(ckpt_raw, indent=2), encoding='utf-8')
            ckpt_prep_path.write_text(json.dumps(ckpt_prep, indent=2), encoding='utf-8')
            for fh in tsvs.values():
                fh.flush()
            print(f"  [Progress] {processed}/{total} chains processed")

    # Final flush
    for fh in tsvs.values():
        fh.close()
    ckpt_raw_path.write_text(json.dumps(ckpt_raw, indent=2), encoding='utf-8')
    ckpt_prep_path.write_text(json.dumps(ckpt_prep, indent=2), encoding='utf-8')

    print('\n[INFO] Data collection complete. Computing metrics...')

    # ── Evaluation ────────────────────────────────────────────────────────────
    # results_map[target_chain][mode][tool] = list of {rank, center, dist}
    results_map: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    for mode in ['raw', 'preprocessed']:
        for tool in tools_list:
            tsv_path = tsv_dir / f"LIGYSIS_{mode}_{tool}.tsv"
            if not tsv_path.exists():
                continue
            with open(tsv_path, encoding='utf-8') as fh:
                for line in fh.readlines()[1:]:
                    parts = line.strip().split('\t')
                    if len(parts) < 9:
                        continue
                    pid, m, t, rank = parts[0], parts[1], parts[2], int(parts[3])
                    px, py, pz = float(parts[4]), float(parts[5]), float(parts[6])
                    dist = float(parts[8])
                    results_map[pid][m][t].append({
                        'rank': rank,
                        'center': np.array([px, py, pz]),
                        'dist':  dist,
                    })

    # Compute success rates
    counters: dict = defaultdict(lambda: defaultdict(lambda: {'top1': 0, 'top5': 0, 'n': 0, 'ok_vec': []}))

    all_chains_seen = set(results_map.keys())
    for pid in all_chains_seen:
        chain_true = true_sites.get(pid, [])
        if not chain_true:
            continue

        for mode in ['raw', 'preprocessed']:
            # Individual tools
            for tool in tools_list:
                preds = sorted(results_map[pid][mode][tool], key=lambda x: x['rank'])
                top1 = top5 = False
                for p in preds:
                    d = p['dist']
                    if d <= DCA_THRESHOLD:
                        if p['rank'] == 1:
                            top1 = True
                        if p['rank'] <= 5:
                            top5 = True
                counters[mode][tool]['top1'] += int(top1)
                counters[mode][tool]['top5'] += int(top5)
                counters[mode][tool]['n']    += 1
                counters[mode][tool]['ok_vec'].append(int(top1))

            # Consensus (reconstruct pocket lists)
            fp_preds  = results_map[pid][mode]['fpocket']
            p2r_preds = results_map[pid][mode]['p2rank']
            pur_preds = results_map[pid][mode]['puresnet']

            fp_l  = [{'center': p['center'], 'score': 1.0 / p['rank'], 'volume': 0.0, 'rank': p['rank']} for p in fp_preds]
            p2r_l = [{'center': p['center'], 'score': 1.0 / p['rank'], 'volume': 0.0, 'rank': p['rank']} for p in p2r_preds]
            pur_l = [{'center': p['center'], 'score': 1.0 / p['rank'], 'volume': 0.0, 'rank': p['rank']} for p in pur_preds]

            c1_pred = wrrf_top1(fp_l, p2r_l, pur_l, w)
            c1_ok = 0
            if c1_pred is not None:
                md = min(euclidean_distance(c1_pred, tc) for tc in chain_true)
                if md <= DCA_THRESHOLD:
                    c1_ok = 1
            counters[mode]['consensus']['top1'] += c1_ok
            counters[mode]['consensus']['n']    += 1
            counters[mode]['consensus']['ok_vec'].append(c1_ok)

    # ── Report ────────────────────────────────────────────────────────────────
    tools_all = tools_list + ['consensus']
    report_lines: List[str] = []

    def pct(v, n):
        return f"{v/n*100:6.2f}%" if n > 0 else "   N/A "

    def delta_str(rv, rn, pv, pn):
        if rn == 0 or pn == 0:
            return "   N/A"
        d = (pv/pn - rv/rn) * 100
        return f"{'+'if d>=0 else ''}{d:.2f}pp"

    hdr = (
        f"\n{'='*100}\n"
        f"{'LIGYSIS-2024 PREPROCESSING IMPACT RESULTS':^100}\n"
        f"{'='*100}\n"
        f"DCA threshold: {DCA_THRESHOLD} Å | N_chains={len(all_chains_seen)}\n"
        f"Weights: fpocket={w['fpocket']:.4f} p2rank={w['p2rank']:.4f} puresnet={w['puresnet']:.4f}\n"
        f"{'─'*100}"
    )
    report_lines.append(hdr)
    print(hdr)

    col = f"{'Tool':<12} | {'Mode':<14} | {'DCA@top1':>9} | {'DCA@top5':>9} | {'Δtop1':>9} | {'N':>6} | {'95%CI top1'}"
    report_lines.append(col)
    report_lines.append('─' * 100)
    print(col)
    print('─' * 100)

    for tool in tools_all:
        raw = counters['raw'][tool]
        pre = counters['preprocessed'][tool]
        ci_lo_r, ci_hi_r = wilson_ci(raw['top1'], raw['n'])
        ci_lo_p, ci_hi_p = wilson_ci(pre['top1'], pre['n'])

        # McNemar test
        raw_vec = counters['raw'][tool]['ok_vec']
        pre_vec = counters['preprocessed'][tool]['ok_vec']
        b = sum(r == 1 and p == 0 for r, p in zip(raw_vec, pre_vec))
        c = sum(r == 0 and p == 1 for r, p in zip(raw_vec, pre_vec))
        p_val = mcnemar_p(b, c)
        sig = '(p<0.05)' if p_val < 0.05 else '(NS)    '

        for mode, cnt, ci_lo, ci_hi in [
            ('raw',          raw, ci_lo_r, ci_hi_r),
            ('preprocessed', pre, ci_lo_p, ci_hi_p),
        ]:
            row = f"  {tool:<12} | {mode:<14} | {pct(cnt['top1'],cnt['n']):>9} | {pct(cnt['top5'],cnt['n']) if 'top5' in cnt else '   N/A ':>9}"
            if mode == 'preprocessed':
                row += f" | {delta_str(raw['top1'],raw['n'],pre['top1'],pre['n']):>9}"
                row += f" | {cnt['n']:>6}"
                row += f" | [{ci_lo:.1f}%–{ci_hi:.1f}%] McNemar {sig}"
            else:
                row += f" | {'':>9} | {cnt['n']:>6} | [{ci_lo:.1f}%–{ci_hi:.1f}%]"
            report_lines.append(row)
            print(row)

    report_lines.append('=' * 100)
    print('=' * 100)

    report_path = out_dir / 'ligysis_preprocessing_report.txt'
    report_path.write_text('\n'.join(report_lines), encoding='utf-8')
    print(f"\n[INFO] Report saved: {report_path}")

    # ── Plot ──────────────────────────────────────────────────────────────────
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(10, 5), dpi=150)
        fig.suptitle('LIGYSIS-2024 Preprocessing Impact\nDCA@top-1 Success Rate', fontsize=12, fontweight='bold')

        labels = [t.replace('puresnet', 'PUResNet').replace('p2rank', 'P2Rank')
                   .replace('fpocket', 'fpocket').replace('consensus', 'Consensus')
                  for t in tools_all]
        x = np.arange(len(labels))
        width = 0.35

        raw_vals = [counters['raw'][t]['top1'] / counters['raw'][t]['n'] * 100
                    if counters['raw'][t]['n'] > 0 else 0 for t in tools_all]
        pre_vals = [counters['preprocessed'][t]['top1'] / counters['preprocessed'][t]['n'] * 100
                    if counters['preprocessed'][t]['n'] > 0 else 0 for t in tools_all]

        ax.bar(x - width/2, raw_vals, width, label='Raw', color='#94a3b8', edgecolor='black', linewidth=0.5)
        ax.bar(x + width/2, pre_vals, width, label='Preprocessed', color='#3b82f6', edgecolor='black', linewidth=0.5)

        for i, (rv, pv) in enumerate(zip(raw_vals, pre_vals)):
            d = pv - rv
            s = '+' if d >= 0 else ''
            col = '#16a34a' if d > 0 else ('#dc2626' if d < 0 else '#6b7280')
            ax.text(x[i] + width/2, pv + 0.3, f'{s}{d:.1f}pp', ha='center', va='bottom',
                    fontsize=8, color=col, fontweight='bold')

        ax.set_xticks(x)
        ax.set_xticklabels(labels, fontsize=10)
        ax.set_ylabel('DCA@top-1 Success Rate (%)', fontsize=10)
        ax.set_ylim(0, 105)
        ax.grid(axis='y', linestyle='--', alpha=0.4)
        ax.legend(fontsize=9)

        plt.tight_layout()
        plot_path = out_dir / 'ligysis_preprocessing_delta.png'
        plt.savefig(str(plot_path), dpi=300, bbox_inches='tight')
        plt.close()
        print(f"[INFO] Plot saved: {plot_path}")
    except ImportError:
        print('[INFO] matplotlib not available — skipping plot')

    print('\nLIGYSIS preprocessing benchmark complete.')


if __name__ == '__main__':
    main()
