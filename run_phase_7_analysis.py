#!/usr/bin/env python3
"""
run_phase_7_analysis.py
=======================
Phase 7 — Supplementary Weight Analysis for SaliDock.

Runs Optuna weight optimization on each dataset individually and
compares the resulting per-dataset optimal weights to the global
optimal weight vector to calculate deviation and assess robustness.
"""

import os
import sys
import json
import numpy as np
from pathlib import Path
from collections import defaultdict

# ── Path setup ────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
BENCH_DIR = BASE_DIR / 'salidock_benchmark' / 'preproc_benchmark'
sys.path.insert(0, str(BASE_DIR))

# ── Dynamic imports ──────────────────────────────────────────────────────────
try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
except ImportError:
    print("[ERROR] Optuna not installed. Run: pip install optuna")
    sys.exit(1)

# Import wRRF predict and euclidean helpers from benchmark script
sys.path.append(str(BASE_DIR))
from run_unified_preprocessing_benchmark import wrrf_predict_top1, euclidean

def main():
    print('=' * 80)
    print('  PHASE 7 — SUPPLEMENTARY WEIGHT ANALYSIS (Per-Dataset Optimization)')
    print('=' * 80)

    # ── Load Paths ────────────────────────────────────────────────────────────
    global_weights_path = BENCH_DIR / 'optuna_results' / 'best_weights.json'
    master_path = BENCH_DIR / 'master_distance_matrix.tsv'
    cent_path = BENCH_DIR / 'true_centroids.json'
    out_dir = BENCH_DIR / 'optuna_results'

    if not global_weights_path.exists():
        print(f"[ERROR] Global weights file not found: {global_weights_path}. Run Phase 4 first.")
        sys.exit(1)
    if not master_path.exists():
        print(f"[ERROR] Master distance matrix not found: {master_path}. Run Phase 3 first.")
        sys.exit(1)
    if not cent_path.exists():
        print(f"[ERROR] True centroids file not found: {cent_path}. Run Phase 1 first.")
        sys.exit(1)

    # ── Load Global Weights ───────────────────────────────────────────────────
    global_data = json.loads(global_weights_path.read_text(encoding='utf-8'))
    g_weights = global_data['weights']
    
    # Normalize global weights for fair comparison
    g_sum = sum(g_weights.values())
    global_norm = {
        'w_fp': g_weights['w_fpocket'] / g_sum,
        'w_p2r': g_weights['w_p2rank'] / g_sum,
        'w_pur': g_weights['w_puresnet'] / g_sum
    }

    # ── Load Centroids and Master Distance Data ───────────────────────────────
    true_centroids = json.loads(cent_path.read_text(encoding='utf-8'))
    
    rows = []
    with open(master_path, encoding='utf-8') as fh:
        next(fh)  # skip header
        for line in fh:
            parts = line.strip().split('\t')
            if len(parts) < 9:
                continue
            rows.append({
                'protein_id': parts[0],
                'dataset': parts[1],
                'tool': parts[2],
                'rank': int(parts[3]),
                'center': [float(parts[4]), float(parts[5]), float(parts[6])],
                'score': float(parts[7]),
                'dist': float(parts[8])
            })

    # Group by dataset -> protein_id -> predictions
    dataset_data = defaultdict(lambda: defaultdict(list))
    for r in rows:
        dataset_data[r['dataset']][r['protein_id']].append(r)

    print(f"Loaded {len(rows)} prediction rows across {len(dataset_data)} datasets.")
    print(f"Global weights (normalized):")
    print(f"  fpocket : {global_norm['w_fp']:.4f}")
    print(f"  p2rank  : {global_norm['w_p2r']:.4f}")
    print(f"  puresnet: {global_norm['w_pur']:.4f}")
    print(f"Global DCA@4Å: {global_data['dca_4A']*100:.2f}%\n")

    per_ds_results = {}

    for ds_name, pid_dict in dataset_data.items():
        print(f"Optimizing weights for dataset: {ds_name} ({len(pid_dict)} proteins)...")

        def dca_rate(wf: float, wp: float, wu: float) -> float:
            successes = 0
            total = 0
            for pid, preds in pid_dict.items():
                tc = true_centroids.get(pid)
                if not tc:
                    continue
                pred_center = wrrf_predict_top1(preds, wf, wp, wu)
                if pred_center is None:
                    continue
                min_d = min(euclidean(pred_center, c) for c in tc)
                if min_d <= 4.0:
                    successes += 1
                total += 1
            return successes / total if total else 0.0

        def objective(trial):
            wf = trial.suggest_float('w_fpocket', 0.0, 1.0)
            wp = trial.suggest_float('w_p2rank', 0.0, 1.0)
            wu = trial.suggest_float('w_puresnet', 0.0, 1.0)
            # Minimize negative success rate
            return -dca_rate(wf, wp, wu)

        study = optuna.create_study(direction='minimize')
        study.optimize(objective, n_trials=500)

        best = study.best_params
        best_val = -study.best_value
        
        # Normalize local weights
        l_sum = sum(best.values())
        if l_sum > 0:
            local_norm = {
                'w_fp': best['w_fpocket'] / l_sum,
                'w_p2r': best['w_p2rank'] / l_sum,
                'w_pur': best['w_puresnet'] / l_sum
            }
        else:
            local_norm = {'w_fp': 0.0, 'w_p2r': 0.0, 'w_pur': 0.0}

        # Calculate deviations
        dev_fp = abs(global_norm['w_fp'] - local_norm['w_fp'])
        dev_p2r = abs(global_norm['w_p2r'] - local_norm['w_p2r'])
        dev_pur = abs(global_norm['w_pur'] - local_norm['w_pur'])
        avg_dev = (dev_fp + dev_p2r + dev_pur) / 3.0

        per_ds_results[ds_name] = {
            'raw_optuna_weights': best,
            'normalized_weights': local_norm,
            'dca_4A': best_val,
            'deviations': {
                'dev_fpocket': dev_fp,
                'dev_p2rank': dev_p2r,
                'dev_puresnet': dev_pur,
                'avg_deviation': avg_dev
            }
        }

        print(f"  Optuna results for {ds_name}:")
        print(f"    Weights (normalized): fp={local_norm['w_fp']:.4f}, p2r={local_norm['w_p2r']:.4f}, pur={local_norm['w_pur']:.4f}")
        print(f"    DCA@4Å: {best_val*100:.2f}%")
        print(f"    Deviations: fp={dev_fp:.4f}, p2r={dev_p2r:.4f}, pur={dev_pur:.4f} (avg={avg_dev:.4f})")
        print()

    # ── Save Results ──────────────────────────────────────────────────────────
    out_path = out_dir / 'phase7_deviations.json'
    out_path.write_text(json.dumps({
        'global_normalized_weights': global_norm,
        'global_dca_4A': global_data['dca_4A'],
        'per_dataset_results': per_ds_results
    }, indent=2), encoding='utf-8')
    print(f"Saved Phase 7 results to: {out_path}")

    # ── Print Final Summary Table ─────────────────────────────────────────────
    print("\n" + "="*80)
    print("PHASE 7 SUMMARY — PER-DATASET WEIGHT DEVIATION")
    print("="*80)
    print(f"{'Dataset':<15} | {'w_fp (dev)':<14} | {'w_p2r (dev)':<14} | {'w_pur (dev)':<14} | {'Avg Dev':<8} | {'DCA@4Å':<8}")
    print("-"*80)
    for ds_name, res in sorted(per_ds_results.items()):
        ln = res['normalized_weights']
        dv = res['deviations']
        print(f"{ds_name:<15} | "
              f"{ln['w_fp']:.3f} ({dv['dev_fpocket']:+.3f}) | "
              f"{ln['w_p2r']:.3f} ({dv['dev_p2rank']:+.3f}) | "
              f"{ln['w_pur']:.3f} ({dv['dev_puresnet']:+.3f}) | "
              f"{dv['avg_deviation']:.3f}   | "
              f"{res['dca_4A']*100:.1f}%")
    print("="*80)

if __name__ == '__main__':
    main()
