import os
import sys
import pickle
import json
import urllib.request
from pathlib import Path
import numpy as np
import pandas as pd
import math

# Zenodo record URLs
URLS = {
    'fpocket': 'https://zenodo.org/api/records/13121414/files/fpocket_pockets_DEF_TRANS.pkl/content',
    'p2rank': 'https://zenodo.org/api/records/13121414/files/P2Rank_pockets_DEF_TRANS.pkl/content',
    'puresnet': 'https://zenodo.org/api/records/13121414/files/PURESNET_pockets_DEF_TRANS.pkl/content',
    'sites': 'https://zenodo.org/api/records/13121414/files/LIGYSIS_sites_DEF_TRANS.pkl/content'
}

def download_file(url, out_path):
    if Path(out_path).exists():
        return
    print(f"Downloading {Path(out_path).name} from Zenodo...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla'})
    with urllib.request.urlopen(req) as response, open(out_path, 'wb') as f:
        f.write(response.read())

def euclidean_distance(c1, c2):
    return float(np.linalg.norm(np.array(c1) - np.array(c2)))

def wilson_score_interval(n_success, n_total, confidence=0.95):
    if n_total == 0:
        return 0.0, 0.0
    z = 1.95996  # for 95% confidence
    p_hat = n_success / n_total
    denominator = 1 + (z**2) / n_total
    p_mid = (p_hat + (z**2) / (2 * n_total)) / denominator
    interval = (z * math.sqrt((p_hat * (1 - p_hat) / n_total) + (z**2) / (4 * n_total**2))) / denominator
    return max(0.0, p_mid - interval), min(1.0, p_mid + interval)

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
    benchmark_dir = Path(__file__).resolve().parent
    opt_dir = benchmark_dir / "optuna"
    opt_dir.mkdir(exist_ok=True)
    
    # Download files if they do not exist
    file_names = {
        'fpocket': 'fpocket_pockets_DEF_TRANS.pkl',
        'p2rank': 'P2Rank_pockets_DEF_TRANS.pkl',
        'puresnet': 'PURESNET_pockets_DEF_TRANS.pkl',
        'sites': 'LIGYSIS_sites_DEF_TRANS.pkl'
    }
    for key, url in URLS.items():
        download_file(url, opt_dir / file_names[key])
        
    # Load optimal weights
    weights_path = opt_dir / "optimal_weights.json"
    with open(weights_path, 'r', encoding='utf-8') as f:
        opt_w = json.load(f)
    w_fp = opt_w['w_fpocket']
    w_p2r = opt_w['w_p2rank']
    w_pur = opt_w['w_puresnet']
    
    print(f"Optimal weights configuration:")
    print(f"  w_fpocket  : {w_fp:.4f}")
    print(f"  w_p2rank   : {w_p2r:.4f}")
    print(f"  w_puresnet : {w_pur:.4f}\n")
    
    # Load dataframes
    print("Loading dataframes (this might take a few seconds)...")
    fp_df = pd.read_pickle(opt_dir / file_names['fpocket'])
    p2r_df = pd.read_pickle(opt_dir / file_names['p2rank'])
    pur_df = pd.read_pickle(opt_dir / file_names['puresnet'])
    sites_df = pd.read_pickle(opt_dir / file_names['sites'])
    print("Dataframes loaded successfully.\n")
    
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
    
    print("Processing fpocket predictions...")
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
        
    print("Processing P2Rank predictions...")
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
        
    print("Processing PUResNet predictions...")
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
    
    successes = {t: 0 for t in ['fpocket', 'p2rank', 'puresnet', 'consensus']}
    
    print("Evaluating success rates...")
    for pid, pdata in results_map.items():
        t_centers = true_sites[pid]
        
        # Individual tool top-1 evaluations
        for t in ['fpocket', 'p2rank', 'puresnet']:
            t_ranks = [p for p in pdata if p['tool'] == t and p['rank'] == 1]
            t_ok = 0
            if t_ranks:
                min_d = min(euclidean_distance(t_ranks[0]['center'], tc) for tc in t_centers)
                if min_d <= 4.0:
                    t_ok = 1
            successes[t] += t_ok
            
        # Consensus top-1 evaluation
        c_pred = wrrf_predict_top1(pdata, w_fp, w_p2r, w_pur)
        c_ok = 0
        if c_pred is not None:
            min_d = min(euclidean_distance(c_pred, tc) for tc in t_centers)
            if min_d <= 4.0:
                c_ok = 1
        successes['consensus'] += c_ok
        
    print("\n" + "=" * 90)
    print(f"{'LIGYSIS-2024 CONFORMATIONAL ALIGNED CONSENSUS RESULTS':^90}")
    print("=" * 90)
    print(f"Total evaluated complexes: {n_evaluated}")
    print("-" * 90)
    print(f"Consensus DCA@top-1 success rate : {successes['consensus']/n_evaluated*100:6.2f}%")
    ci_lo, ci_hi = wilson_score_interval(successes['consensus'], n_evaluated)
    print(f"Consensus 95% Confidence Interval: {ci_lo*100:5.1f}% – {ci_hi*100:5.1f}%")
    print("-" * 90)
    
    for t in ['fpocket', 'p2rank', 'puresnet']:
        acc = successes[t]/n_evaluated*100
        print(f"Tool: {t:10} | Standalone: {acc:6.2f}%")
    print("=" * 90)

if __name__ == '__main__':
    main()
