import os
import sys
import json
import pickle
from pathlib import Path
import numpy as np
import math

HETATM_EXCLUDE = {
    'HOH', 'WAT', 'DOD',  # waters
    'SO4', 'PO4', 'GOL', 'EDO', 'PEG',  # crystallization buffer agents
    'CL', 'NA', 'MG', 'ZN', 'CA', 'FE', 'ACT' # ions/common salts
}

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

def mcnemar_exact_p_value(b, c):
    total = b + c
    if total == 0:
        return 1.0
    from scipy.stats import binom
    p_val = binom.cdf(min(b, c), total, 0.5) * 2
    return min(1.0, p_val)

def extract_true_ligand_centers_for_chain(pdb_path, chain_id):
    centers = []
    ligands = {}
    
    with open(pdb_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if line.startswith("HETATM"):
                try:
                    resname = line[17:20].strip()
                    line_chain = line[21:22].strip() or 'A'
                    if line_chain != chain_id:
                        continue
                    resnum = line[22:26].strip()
                    x = float(line[30:38])
                    y = float(line[38:46])
                    z = float(line[46:54])
                    
                    if resname in HETATM_EXCLUDE:
                        continue
                        
                    res_id = (resname, line_chain, resnum)
                    if res_id not in ligands:
                        ligands[res_id] = []
                    ligands[res_id].append([x, y, z])
                except (ValueError, IndexError):
                    continue
                    
    for res_id, coords in ligands.items():
        if len(coords) >= 5:
            centroid = np.mean(coords, axis=0)
            centers.append(centroid.tolist())
            
    # Fallback to small peptide chains in ATOM records
    if not centers:
        chain_coords = {}
        with open(pdb_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.startswith("ATOM"):
                    try:
                        line_chain = line[21:22].strip() or 'A'
                        if line_chain != chain_id:
                            continue
                        x = float(line[30:38])
                        y = float(line[38:46])
                        z = float(line[46:54])
                        if line_chain not in chain_coords:
                            chain_coords[line_chain] = []
                        chain_coords[line_chain].append([x, y, z])
                    except (ValueError, IndexError):
                        continue
                        
        for chain, coords in chain_coords.items():
            if 5 <= len(coords) <= 100:
                centroid = np.mean(coords, axis=0)
                centers.append(centroid.tolist())
                
    return centers

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
    weights_path = benchmark_dir / "optuna" / "optimal_weights.json"
    pdb_dir = benchmark_dir / "pdb"
    raw_dir = benchmark_dir / "raw_results"
    
    with open(weights_path, 'r', encoding='utf-8') as f:
        opt_w = json.load(f)
        
    w_fp = opt_w['w_fpocket']
    w_p2r = opt_w['w_p2rank']
    w_pur = opt_w['w_puresnet']
    
    print(f"Optimal weights configuration:")
    print(f"  w_fpocket  : {w_fp:.4f}")
    print(f"  w_p2rank   : {w_p2r:.4f}")
    print(f"  w_puresnet : {w_pur:.4f}\n")
    
    # Compilation
    results_map = {}
    for tool in ['fpocket', 'p2rank', 'purnet']:
        tsv_path = raw_dir / tool / "LIGYSIS.tsv"
        if not tsv_path.exists():
            print(f"[WARNING] TSV path for {tool} not found: {tsv_path}")
            continue
        with open(tsv_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for line in lines[1:]:
                parts = line.strip().split('\t')
                if len(parts) >= 9:
                    pid, ds, tool_name, rank, px, py, pz, conf, dist = parts
                    rank = int(rank)
                    px, py, pz = float(px), float(py), float(pz)
                    if pid not in results_map:
                        results_map[pid] = []
                    results_map[pid].append({
                        'tool': tool_name,
                        'rank': rank,
                        'center': np.array([px, py, pz]),
                        'dist_to_true': float(dist)
                    })
                    
    n_evaluated = len(results_map)
    if n_evaluated == 0:
        print("[ERROR] No LIGYSIS targets successfully evaluated.")
        sys.exit(1)
        
    successes = {t: 0 for t in ['fpocket', 'p2rank', 'puresnet', 'consensus']}
    vectors = {t: [] for t in ['fpocket', 'p2rank', 'puresnet', 'consensus']}
    
    print("Computing actual ligand centroids from PDB files...", flush=True)
    real_true_centroids = {}
    skipped_count = 0
    
    for idx, (pid, pdata) in enumerate(results_map.items(), 1):
        if idx % 500 == 0:
            print(f"  Processed {idx}/{n_evaluated} structures...")
            
        pdb_id, chain_id = pid.split('_')
        pdb_path = pdb_dir / f"{pdb_id}.pdb"
        
        if not pdb_path.exists():
            skipped_count += 1
            continue
            
        centers = extract_true_ligand_centers_for_chain(pdb_path, chain_id)
        if not centers:
            skipped_count += 1
            continue
            
        real_true_centroids[pid] = centers

    print(f"Evaluation dataset filtered: {len(real_true_centroids)} valid complexes (skipped {skipped_count} due to missing structure or no chain ligand).")
    
    final_evaluated = len(real_true_centroids)
    if final_evaluated == 0:
        print("[ERROR] No complexes had valid ligand centroids.")
        sys.exit(1)

    for pid in list(results_map.keys()):
        if pid not in real_true_centroids:
            continue
            
        pdata = results_map[pid]
        true_centers = real_true_centroids[pid]
        
        # Individual tool top-1 evaluations
        for t in ['fpocket', 'p2rank', 'puresnet']:
            t_ranks = [p for p in pdata if p['tool'] == t and p['rank'] == 1]
            t_ok = 0
            if t_ranks:
                min_d = min(euclidean_distance(t_ranks[0]['center'], tc) for tc in true_centers)
                if min_d <= 4.0:
                    t_ok = 1
            successes[t] += t_ok
            vectors[t].append(t_ok)
            
        # Consensus top-1 evaluation
        c_pred = wrrf_predict_top1(pdata, w_fp, w_p2r, w_pur)
        c_ok = 0
        if c_pred is not None:
            min_d = min(euclidean_distance(c_pred, tc) for tc in true_centers)
            if min_d <= 4.0:
                c_ok = 1
        successes['consensus'] += c_ok
        vectors['consensus'].append(c_ok)
        
    print("\n" + "=" * 90)
    print(f"{'LIGYSIS-2024 DYNAMIC LIGAND VALIDATION SWEEP FINAL RESULTS':^90}")
    print("=" * 90)
    print(f"Total evaluated complexes: {final_evaluated}")
    print("-" * 90)
    print(f"Consensus DCA@top-1 success rate : {successes['consensus']/final_evaluated*100:6.2f}%")
    ci_lo, ci_hi = wilson_score_interval(successes['consensus'], final_evaluated)
    print(f"Consensus 95% Confidence Interval: {ci_lo*100:5.1f}% – {ci_hi*100:5.1f}%")
    print("-" * 90)
    
    for t in ['fpocket', 'p2rank', 'puresnet']:
        acc = successes[t]/final_evaluated*100
        b = sum((c == 1 and u == 0) for c, u in zip(vectors['consensus'], vectors[t]))
        c = sum((c == 0 and u == 1) for c, u in zip(vectors['consensus'], vectors[t]))
        p_val = mcnemar_exact_p_value(b, c)
        sig_str = " (Significant)" if p_val < 0.05 else " (NS)"
        print(f"Tool: {t:10} | Standalone: {acc:6.2f}% | McNemar vs Consensus: p={p_val:.4f}{sig_str}")
    print("=" * 90)

if __name__ == '__main__':
    main()
