#!/usr/bin/env python
"""
run_ligysis_benchmark.py — Standalone runner for the LIGYSIS-2024 blind validation sweep.
"""

import os
import sys
import json
import pickle
import urllib.request
from pathlib import Path
import numpy as np
import pandas as pd
import math

# Add current workspace directory to python path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from salidock.cavity.runners import run_fpocket, run_p2rank, run_puresnet


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


def isolate_chain(raw_pdb_path, isolated_pdb_path, chain_id):
    with open(raw_pdb_path, 'r', encoding='utf-8', errors='ignore') as f_in:
        lines = f_in.readlines()
    isolated_lines = []
    for line in lines:
        if line.startswith(("ATOM", "HETATM")):
            line_chain = line[21].strip() or 'A'
            if line_chain == chain_id:
                isolated_lines.append(line)
    isolated_lines.append("END\n")
    with open(isolated_pdb_path, 'w', encoding='utf-8') as f_out:
        f_out.writelines(isolated_lines)


def main():
    print("=" * 80)
    print("             LIGYSIS-2024 BLIND VALIDATION STANDALONE BENCHMARK              ")
    print("=" * 80)
    
    benchmark_dir = Path(__file__).resolve().parent
    chains_path = benchmark_dir / "optuna" / "LIGYSIS_3448_chains.pkl"
    rot_matrices_path = benchmark_dir / "optuna" / "PDB_rot_matrices_ALL_CLUST.pkl"
    translation_path = benchmark_dir / "optuna" / "translation_vectors.json"
    sites_path = benchmark_dir / "optuna" / "LIGYSIS_sites_DEF_TRANS.pkl"
    weights_path = benchmark_dir / "optuna" / "optimal_weights.json"
    pdb_dir = benchmark_dir / "pdb"
    pdb_isolated_dir = benchmark_dir / "pdb_isolated"
    pdb_isolated_dir.mkdir(exist_ok=True)
    raw_dir = benchmark_dir / "raw_results"
    checkpoint_path = raw_dir / "LIGYSIS_checkpoint.json"
    
    if not all(p.exists() for p in [chains_path, rot_matrices_path, translation_path, sites_path, weights_path]):
        print("[ERROR] LIGYSIS dataset files, transformation vectors, or optimal weights missing.")
        sys.exit(1)
        
    with open(chains_path, 'rb') as f:
        chains = pickle.load(f)
    with open(rot_matrices_path, 'rb') as f:
        rot_matrices = pickle.load(f)
    with open(translation_path, 'r', encoding='utf-8') as f:
        translation_vectors = json.load(f)
    sites_df = pd.read_pickle(sites_path)
    with open(weights_path, 'r', encoding='utf-8') as f:
        opt_w = json.load(f)
        
    # Extract true sites centers
    true_sites = {}
    for idx, row in sites_df.iterrows():
        rep = row['rep_chain']
        c = np.array(row['centre'])
        if rep not in true_sites:
            true_sites[rep] = []
        true_sites[rep].append(c)
        
    w_fp = opt_w['w_fpocket']
    w_p2r = opt_w['w_p2rank']
    w_pur = opt_w['w_puresnet']
    
    print(f"Optimal weights configuration detected:")
    print(f"  w_fpocket  : {w_fp:.4f}")
    print(f"  w_p2rank   : {w_p2r:.4f}")
    print(f"  w_puresnet : {w_pur:.4f}\n")
    
    # Load checkpoints
    checkpoint = {}
    if checkpoint_path.exists():
        try:
            with open(checkpoint_path, 'r', encoding='utf-8') as f:
                checkpoint = json.load(f)
            print(f"[INFO] Loaded checkpoint for {len(checkpoint)} targets.")
        except Exception:
            pass

    # Open tool TSVs in append mode
    tsvs = {}
    for tool in ['fpocket', 'p2rank', 'purnet']:
        (raw_dir / tool).mkdir(parents=True, exist_ok=True)
        tsv_path = raw_dir / tool / "LIGYSIS.tsv"
        exists = tsv_path.exists()
        tsvs[tool] = open(tsv_path, "a", encoding="utf-8")
        if not exists:
            tsvs[tool].write("protein_id\tdataset\ttool\trank\tpred_x\tpred_y\tpred_z\tconfidence\tdist_to_true\n")

    # Setup P2Rank binary path
    if os.name == 'nt':
        p2rank_exe = str(benchmark_dir.parent / "backend" / "p2rank_2.4.2" / "prank.bat")
    else:
        p2rank_exe = str(benchmark_dir.parent / "backend" / "p2rank_2.4.2" / "prank")
        if not os.path.exists(p2rank_exe):
            p2rank_exe = str(benchmark_dir.parent / "backend" / "p2rank_2.4.2" / "prank.sh")

    total_targets = len(chains)
    processed = len(checkpoint)
    
    print(f"Beginning validation sweep for {total_targets} LIGYSIS human target chains...")
    
    for idx, target_chain in enumerate(chains, 1):
        if target_chain in checkpoint:
            continue
            
        print(f"[{idx}/{total_targets}] Processing target chain: {target_chain} ...", flush=True)
            
        pdb_id, chain_id = target_chain.split('_')
        pdb_path = pdb_dir / f"{pdb_id}.pdb"
        
        if not pdb_path.exists():
            # Try to download on-the-fly
            url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
            try:
                urllib.request.urlretrieve(url, pdb_path)
            except Exception:
                print(f"[ERROR] Skip {target_chain}: PDB file download failed.")
                continue
                
        # Look up rotation and translation vectors
        if target_chain not in rot_matrices or target_chain not in translation_vectors:
            print(f"[WARNING] Skip {target_chain}: No rotation/translation vector found.")
            continue
            
        if target_chain not in true_sites:
            print(f"[WARNING] Skip {target_chain}: No true sites found in sites dictionary.")
            continue
            
        R = np.array(rot_matrices[target_chain])
        T = np.array(translation_vectors[target_chain])
        chain_true_sites = true_sites[target_chain]
        
        # Isolate the target chain structure
        isolated_pdb_path = pdb_isolated_dir / f"{target_chain}.pdb"
        try:
            isolate_chain(pdb_path, isolated_pdb_path, chain_id)
        except Exception as e:
            print(f"[ERROR] Skip {target_chain}: Chain isolation failed: {e}")
            continue
            
        try:
            # 1. Run fpocket
            print("  -> Running fpocket...", flush=True)
            fp_raw = run_fpocket(str(isolated_pdb_path))
            fp_raw = fp_raw[:5]
            for r_idx, p in enumerate(fp_raw, 1):
                p_center_aligned = R.dot(p['center']) + T
                px, py, pz = p_center_aligned
                d = min(euclidean_distance(p_center_aligned, tc) for tc in chain_true_sites)
                tsvs['fpocket'].write(f"{target_chain}\tLIGYSIS\tfpocket\t{r_idx}\t{px:.3f}\t{py:.3f}\t{pz:.3f}\t{p['score']:.4f}\t{d:.3f}\n")
                
            # 2. Run P2Rank
            print("  -> Running P2Rank...", flush=True)
            p2r_raw = run_p2rank(str(isolated_pdb_path), p2rank_path=p2rank_exe)
            p2r_raw = p2r_raw[:5]
            for r_idx, p in enumerate(p2r_raw, 1):
                p_center_aligned = R.dot(p['center']) + T
                px, py, pz = p_center_aligned
                d = min(euclidean_distance(p_center_aligned, tc) for tc in chain_true_sites)
                tsvs['p2rank'].write(f"{target_chain}\tLIGYSIS\tp2rank\t{r_idx}\t{px:.3f}\t{py:.3f}\t{pz:.3f}\t{p['score']:.4f}\t{d:.3f}\n")
                
            # 3. Run PUResNet
            print("  -> Running PUResNet...", flush=True)
            pur_raw = run_puresnet(str(isolated_pdb_path), docker_image="salidock-puresnet-cpu:latest")
            pur_raw = pur_raw[:5]
            for r_idx, p in enumerate(pur_raw, 1):
                p_center_aligned = R.dot(p['center']) + T
                px, py, pz = p_center_aligned
                d = min(euclidean_distance(p_center_aligned, tc) for tc in chain_true_sites)
                tsvs['purnet'].write(f"{target_chain}\tLIGYSIS\tpuresnet\t{r_idx}\t{px:.3f}\t{py:.3f}\t{pz:.3f}\t{p['score']:.4f}\t{d:.3f}\n")
                
            checkpoint[target_chain] = True
            processed += 1
            
            # Save checkpoint
            if processed % 10 == 0:
                with open(checkpoint_path, 'w', encoding='utf-8') as cf:
                    json.dump(checkpoint, cf, indent=2)
                for f in tsvs.values():
                    f.flush()
                print(f"Progress: {processed}/{total_targets} target chains processed.")
                
        except Exception as e:
            print(f"[ERROR] Failed predictions for {target_chain}: {e}")
            continue

    # Close TSVs
    for f in tsvs.values():
        f.close()
        
    print("\nLIGYSIS Validation data collection complete! Re-evaluating final accuracies...")
    
    # ── Compilation & Reporting ──
    results_map = {}
    for tool in ['fpocket', 'p2rank', 'purnet']:
        tsv_path = raw_dir / tool / "LIGYSIS.tsv"
        if not tsv_path.exists():
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
    
    for pid, pdata in results_map.items():
        chain_true_sites = true_sites.get(pid)
        if not chain_true_sites:
            continue
            
        # Individual tool top-1 evaluations
        for t in ['fpocket', 'p2rank', 'puresnet']:
            t_ranks = [p for p in pdata if p['tool'] == t and p['rank'] == 1]
            t_ok = 0
            if t_ranks:
                min_d = min(euclidean_distance(t_ranks[0]['center'], tc) for tc in chain_true_sites)
                if min_d <= 4.0:
                    t_ok = 1
            successes[t] += t_ok
            vectors[t].append(t_ok)
            
        # Consensus top-1 evaluation
        c_pred = wrrf_predict_top1(pdata, w_fp, w_p2r, w_pur)
        c_ok = 0
        if c_pred is not None:
            min_d = min(euclidean_distance(c_pred, tc) for tc in chain_true_sites)
            if min_d <= 4.0:
                c_ok = 1
        successes['consensus'] += c_ok
        vectors['consensus'].append(c_ok)
        
    print("\n" + "=" * 90)
    print(f"{'LIGYSIS-2024 BLIND VALIDATION SWEEP FINAL RESULTS':^90}")
    print("=" * 90)
    print(f"Total evaluated complexes: {n_evaluated}")
    print("-" * 90)
    print(f"Consensus DCA@top-1 success rate : {successes['consensus']/n_evaluated*100:6.2f}%")
    ci_lo, ci_hi = wilson_score_interval(successes['consensus'], n_evaluated)
    print(f"Consensus 95% Confidence Interval: {ci_lo*100:5.1f}% – {ci_hi*100:5.1f}%")
    print("-" * 90)
    
    for t in ['fpocket', 'p2rank', 'puresnet']:
        acc = successes[t]/n_evaluated*100
        b = sum((c == 1 and u == 0) for c, u in zip(vectors['consensus'], vectors[t]))
        c = sum((c == 0 and u == 1) for c, u in zip(vectors['consensus'], vectors[t]))
        p_val = mcnemar_exact_p_value(b, c)
        sig_str = " (Significant)" if p_val < 0.05 else " (NS)"
        print(f"Tool: {t:10} | Standalone: {acc:6.2f}% | McNemar vs Consensus: p={p_val:.4f}{sig_str}")
    print("=" * 90)


if __name__ == '__main__':
    main()
