import os
import sys
import pickle
import json
from pathlib import Path
import numpy as np
import pandas as pd

try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
except ImportError:
    print("[ERROR] Optuna not installed. Run: pip install optuna")
    sys.exit(1)

def euclidean_distance(c1, c2):
    return float(np.linalg.norm(np.array(c1) - np.array(c2)))

def wrrf_predict_top1(pdata, w_fp, w_p2r, w_pur, k=60, cluster_radius=6.0):
    weights = {'fpocket': w_fp, 'p2rank': w_p2r, 'puresnet': w_pur}
    all_pockets = []
    
    for p in pdata:
        tool = p['tool']
        if weights.get(tool, 0.0) > 0.0:
            all_pockets.append(p)
            
    if not all_pockets:
        return None
        
    clusters = []
    for pocket in all_pockets:
        center = pocket['center']
        assigned = False
        for c in clusters:
            dist = float(np.linalg.norm(center - c['center']))
            if dist <= cluster_radius:
                c['members'].append(pocket)
                all_centers = np.array([m['center'] for m in c['members']])
                c['center'] = all_centers.mean(axis=0)
                c['tools'].add(pocket['tool'])
                assigned = True
                break
        if not assigned:
            clusters.append({
                'center': center.copy(),
                'members': [pocket],
                'tools': {pocket['tool']}
            })
            
    for c in clusters:
        wrrf = 0.0
        for tool, w in weights.items():
            tool_members = [m for m in c['members'] if m['tool'] == tool]
            if not tool_members:
                continue
            best_rank = min(m['rank'] for m in tool_members)
            wrrf += w * (1.0 / (k + best_rank))
        c['wrrf_score'] = wrrf
        
    clusters.sort(key=lambda c: c['wrrf_score'], reverse=True)
    return clusters[0]['center'] if clusters else None

def main():
    benchmark_dir = Path(__file__).resolve().parent / "salidock_benchmark"
    opt_dir = benchmark_dir / "optuna"
    
    file_names = {
        'fpocket': 'fpocket_pockets_DEF_TRANS.pkl',
        'p2rank': 'P2Rank_pockets_DEF_TRANS.pkl',
        'puresnet': 'PURESNET_pockets_DEF_TRANS.pkl',
        'sites': 'LIGYSIS_sites_DEF_TRANS.pkl'
    }
    
    # Verify datafiles exist
    for key, name in file_names.items():
        p = opt_dir / name
        if not p.exists():
            print(f"[ERROR] Required LIGYSIS data file missing: {p}")
            print("Run python salidock_benchmark/run_consensus_ligysis_evaluation.py first to download them.")
            return

    # Load dataframes
    print("Loading LIGYSIS datasets (this may take a few seconds)...")
    fp_df = pd.read_pickle(opt_dir / file_names['fpocket'])
    p2r_df = pd.read_pickle(opt_dir / file_names['p2rank'])
    pur_df = pd.read_pickle(opt_dir / file_names['puresnet'])
    sites_df = pd.read_pickle(opt_dir / file_names['sites'])
    
    # Extract true sites centers
    true_sites = {}
    for idx, row in sites_df.iterrows():
        rep = row['rep_chain']
        c = np.array(row['centre'])
        if rep not in true_sites:
            true_sites[rep] = []
        true_sites[rep].append(c)
        
    # Group predictions by rep_chain
    results_map = {}
    for idx, row in fp_df.iterrows():
        rep = row['rep_chain']
        if rep not in true_sites:
            continue
        if rep not in results_map:
            results_map[rep] = []
        results_map[rep].append({
            'tool': 'fpocket',
            'rank': int(row['RANK']),
            'center': np.array(row['centre'])
        })
        
    for idx, row in p2r_df.iterrows():
        rep = row['rep_chain']
        if rep not in true_sites:
            continue
        if rep not in results_map:
            results_map[rep] = []
        results_map[rep].append({
            'tool': 'p2rank',
            'rank': int(row['RANK']),
            'center': np.array(row['centre_trans'])
        })
        
    for idx, row in pur_df.iterrows():
        rep = row['rep_chain']
        if rep not in true_sites:
            continue
        if rep not in results_map:
            results_map[rep] = []
        rank = int(row['ID'])
        results_map[rep].append({
            'tool': 'puresnet',
            'rank': rank,
            'center': np.array(row['centre_mat'])
        })
        
    n_evaluated = len(results_map)
    print(f"Loaded {n_evaluated} valid complexes for optimization.\n")

    # 1. Evaluate performance with current GLOBAL weights
    g_fp, g_p2r, g_pur = 0.0758, 0.4922, 0.5671
    g_success = 0
    for pid, pdata in results_map.items():
        t_centers = true_sites[pid]
        c_pred = wrrf_predict_top1(pdata, g_fp, g_p2r, g_pur)
        if c_pred is not None:
            min_d = min(euclidean_distance(c_pred, tc) for tc in t_centers)
            if min_d <= 4.0:
                g_success += 1
    g_rate = (g_success / n_evaluated) * 100
    print(f"Global Weights Reference (fp=0.0758, p2r=0.4922, pur=0.5671):")
    print(f"  DCA@4Å success rate : {g_rate:.2f}% ({g_success}/{n_evaluated})\n")

    # 2. Run Optuna to optimize weights specifically for the LIGYSIS-2024 set
    print("Running Optuna weight optimization on LIGYSIS-2024 dataset (500 trials)...")
    
    def dca_rate(wf, wp, wu):
        successes = 0
        for pid, pdata in results_map.items():
            t_centers = true_sites[pid]
            pred = wrrf_predict_top1(pdata, wf, wp, wu)
            if pred is not None:
                min_d = min(euclidean_distance(pred, tc) for tc in t_centers)
                if min_d <= 4.0:
                    successes += 1
        return successes / n_evaluated

    def objective(trial):
        wf = trial.suggest_float('w_fp', 0.0, 1.0)
        wp = trial.suggest_float('w_p2r', 0.0, 1.0)
        wu = trial.suggest_float('w_pur', 0.0, 1.0)
        return -dca_rate(wf, wp, wu)

    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=500)
    
    best = study.best_params
    best_rate = -study.best_value * 100
    
    # Normalize local best weights
    total = best['w_fp'] + best['w_p2r'] + best['w_pur']
    norm_best = {
        'w_fp': best['w_fp'] / total,
        'w_p2r': best['w_p2r'] / total,
        'w_pur': best['w_pur'] / total
    }

    print("=" * 80)
    print("OPTUNA OPTIMIZATION COMPLETE")
    print("=" * 80)
    print(f"Dataset-Specific Optimal Weights (LIGYSIS-2024):")
    print(f"  w_fpocket  : {norm_best['w_fp']:.4f}")
    print(f"  w_p2rank   : {norm_best['w_p2r']:.4f}")
    print(f"  w_puresnet : {norm_best['w_pur']:.4f}")
    print(f"  DCA@4Å Rate: {best_rate:.2f}%\n")
    
    print(f"Comparison:")
    print(f"  Global Weights DCA@4Å: {g_rate:.2f}%")
    print(f"  Local Optimal DCA@4Å : {best_rate:.2f}%")
    print(f"  Absolute Improvement : {best_rate - g_rate:+.2f}%")
    print("=" * 80)

if __name__ == '__main__':
    main()
