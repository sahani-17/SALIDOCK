import os
import sys
import json
import urllib.request
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# Add current workspace directory to python path for imports
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from salidock.cavity.runners import run_fpocket, run_p2rank, run_puresnet
from salidock.cavity.fusion import fuse_predictions

# ---------------------------------------------------------
# Full CASF-2016 Dataset (285 structures)
# ---------------------------------------------------------
CASF_2016_PDB_IDS = [
    '1a30', '1bcu', '1bzc', '1c5z', '1e66', '1eby', '1g2k', '1gpk', '1gpn', '1h22',
    '1h23', '1k1i', '1lpg', '1mq6', '1nc1', '1nc3', '1nvq', '1o0h', '1o3f', '1o5b',
    '1owh', '1oyt', '1p1n', '1p1q', '1ps3', '1pxn', '1q8t', '1q8u', '1qf1', '1qkt',
    '1r5y', '1s38', '1sqa', '1syi', '1u1b', '1uto', '1vso', '1w4o', '1y6r', '1yc1',
    '1ydr', '1ydt', '1z6e', '1z95', '1z9g', '2al5', '2br1', '2brb', '2c3i', '2cbv',
    '2cet', '2fvd', '2fxs', '2hb1', '2iwx', '2j78', '2j7h', '2p15', '2p4y', '2pog',
    '2qbp', '2qbq', '2qbr', '2qe4', '2qnq', '2r9w', '2v00', '2v7a', '2vkm', '2vvn',
    '2vw5', '2w4x', '2w66', '2wbg', '2wca', '2weg', '2wer', '2wn9', '2wnc', '2wtv',
    '2wvt', '2x00', '2xb8', '2xbv', '2xdl', '2xii', '2xj7', '2xnb', '2xys', '2y5h',
    '2yfe', '2yge', '2yki', '2ymd', '2zb1', '2zcq', '2zcr', '2zda', '2zy1', '3acw',
    '3ag9', '3ao4', '3arp', '3arq', '3aru', '3arv', '3ary', '3b1m', '3b27', '3b5r',
    '3b65', '3b68', '3bgz', '3bv9', '3cj4', '3coy', '3coz', '3d4z', '3d6q', '3dd0',
    '3dx1', '3dx2', '3dxg', '3e5a', '3e92', '3e93', '3ebp', '3ehy', '3ejr', '3f3a',
    '3f3c', '3f3d', '3f3e', '3fcq', '3fur', '3fv1', '3fv2', '3g0w', '3g2n', '3g2z',
    '3g31', '3gbb', '3gc5', '3ge7', '3gnw', '3gr2', '3gv9', '3gy4', '3ivg', '3jvr',
    '3jvs', '3jya', '3k5v', '3kgp', '3kr8', '3kwa', '3l7b', '3lka', '3mss', '3myg',
    '3n76', '3n7a', '3n86', '3nq9', '3nw9', '3nx7', '3o9i', '3oe4', '3oe5', '3ozs',
    '3ozt', '3p5o', '3prs', '3pww', '3pxf', '3pyy', '3qgy', '3qqs', '3r88', '3rlr',
    '3rr4', '3rsx', '3ryj', '3syr', '3tsk', '3twp', '3u5j', '3u8k', '3u8n', '3u9q',
    '3udh', '3ueu', '3uev', '3uew', '3uex', '3ui7', '3uo4', '3up2', '3uri', '3utu',
    '3uuo', '3wtj', '3wz8', '3zdg', '3zso', '3zsx', '3zt2', '4abg', '4agn', '4agp',
    '4agq', '4bkt', '4cig', '4ciw', '4cr9', '4cra', '4crc', '4ddh', '4ddk', '4de1',
    '4de2', '4de3', '4djv', '4dld', '4dli', '4e5w', '4e6q', '4ea2', '4eky', '4eo8',
    '4eor', '4f09', '4f2w', '4f3c', '4f9w', '4gfm', '4gid', '4gkm', '4gr0', '4hge',
    '4ih5', '4ih7', '4ivb', '4ivc', '4ivd', '4j21', '4j28', '4j3l', '4jfs', '4jia',
    '4jsz', '4jxs', '4k18', '4k77', '4kz6', '4kzq', '4kzu', '4llx', '4lzs', '4m0y',
    '4m0z', '4mgd', '4mme', '4ogj', '4owm', '4pcs', '4qac', '4qd6', '4rfm', '4tmn',
    '4twp', '4ty7', '4u4s', '4w9c', '4w9h', '4w9i', '4w9l', '4wiv', '4x6p', '5a7b',
    '5aba', '5c28', '5c2h', '5dwr', '5tmn'
]

# ---------------------------------------------------------
# PDBbind-v2020 time-split subset (50 structures)
# ---------------------------------------------------------
PDBBIND_V2020_PDB_IDS = [
    '6qqw', '6d08', '6jap', '6np2', '6uvp', '6oxq', '6jsn', '6hzb', '6qrc', '6oio',
    '6jag', '6moa', '6hld', '6i9a', '6e4c', '6g24', '6jb4', '6s55', '6seo', '6dyz',
    '5zk5', '6jid', '5ze6', '6qlu', '6a6k', '6qgf', '6e3z', '6te6', '6pka', '6g2o',
    '6jsf', '5zxk', '6qxd', '6n97', '6jt3', '6qtr', '6oy1', '6n96', '6qzh', '6qqz',
    '6qmt', '6ibx', '6hmt', '5zk7', '6k3l', '6cjs', '6n9l', '6ibz', '6ott', '6gge'
]

HETATM_EXCLUDE = {
    'HOH', 'WAT', 'DOD',  # waters
    'SO4', 'PO4', 'GOL', 'EDO', 'PEG',  # crystallization buffer agents
    'CL', 'NA', 'MG', 'ZN', 'CA', 'FE', 'ACT' # ions/common salts
}

# ---------------------------------------------------------
# Helper to download PDB structures
# ---------------------------------------------------------
def download_pdb(pdb_id, output_dir):
    pdb_path = Path(output_dir) / f"{pdb_id}.pdb"
    if pdb_path.exists():
        return pdb_path
    
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    try:
        print(f"Downloading {pdb_id.upper()} from RCSB PDB...")
        urllib.request.urlretrieve(url, pdb_path)
        return pdb_path
    except Exception as e:
        print(f"Error downloading {pdb_id}: {e}")
        return None

# ---------------------------------------------------------
# Extract true ligand centroids from the PDB structure
# ---------------------------------------------------------
def extract_true_ligand_centers(pdb_path):
    centers = []
    
    # 1. Try HETATM organic ligand extraction
    ligands = {}
    with open(pdb_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if line.startswith("HETATM"):
                try:
                    resname = line[17:20].strip()
                    chain = line[21:22].strip() or 'A'
                    resnum = line[22:26].strip()
                    x = float(line[30:38])
                    y = float(line[38:46])
                    z = float(line[46:54])
                    
                    if resname in HETATM_EXCLUDE:
                        continue
                        
                    res_id = (resname, chain, resnum)
                    if res_id not in ligands:
                        ligands[res_id] = []
                    ligands[res_id].append([x, y, z])
                except (ValueError, IndexError):
                    continue
                    
    for res_id, coords in ligands.items():
        if len(coords) >= 5:
            centroid = np.mean(coords, axis=0)
            centers.append(centroid.tolist())
            
    # 2. Fallback: Parse small peptide chains (represented as ATOM records, e.g., Glu-X-Leu)
    if not centers:
        chain_coords = {}
        with open(pdb_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.startswith("ATOM"):
                    try:
                        chain = line[21:22].strip() or 'A'
                        x = float(line[30:38])
                        y = float(line[38:46])
                        z = float(line[46:54])
                        if chain not in chain_coords:
                            chain_coords[chain] = []
                        chain_coords[chain].append([x, y, z])
                    except (ValueError, IndexError):
                        continue
                        
        for chain, coords in chain_coords.items():
            # If a separate chain is small (between 5 and 100 atoms), it's likely a peptide ligand
            if 5 <= len(coords) <= 100:
                centroid = np.mean(coords, axis=0)
                centers.append(centroid.tolist())
                
    return centers

# ---------------------------------------------------------
# Calculate Euclidean distance
# ---------------------------------------------------------
def euclidean_distance(c1, c2):
    return float(np.linalg.norm(np.array(c1) - np.array(c2)))

# ---------------------------------------------------------
# Main Execution Block
# ---------------------------------------------------------
def main():
    print("=" * 80)
    print("      SALIDOCK: UNIFIED BENCHMARKING SWEEP (CASF-2016 & PDBbind-v2020)      ")
    print("=" * 80)
    
    # Path configuration
    base_dir = Path(__file__).resolve().parent
    work_dir = base_dir / "real_benchmarks"
    pdb_dir = work_dir / "pdb"
    pdb_dir.mkdir(parents=True, exist_ok=True)
    
    cache_path = work_dir / "benchmark_cache.json"
    
    # OS-independent P2Rank resolution
    if os.name == 'nt':
        p2rank_exe = str(base_dir / "backend" / "p2rank_2.4.2" / "prank.bat")
    else:
        # On Linux/Ubuntu, prank or prank.sh in the backend directory
        p2rank_exe = str(base_dir / "backend" / "p2rank_2.4.2" / "prank")
        if not os.path.exists(p2rank_exe):
            p2rank_exe = str(base_dir / "backend" / "p2rank_2.4.2" / "prank.sh")
            
    # Candidate Weight Configurations
    candidate_weights = {
        'Vector A (PUResNet-Dominant)': {
            'fpocket': 0.1039,
            'p2rank': 0.2297,
            'puresnet': 0.6665
        },
        'Vector B (P2Rank-Dominant)': {
            'fpocket': 0.0939,
            'p2rank': 0.6364,
            'puresnet': 0.2696
        }
    }
    
    # Load cache if it exists
    cache = {}
    if cache_path.exists():
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            print(f"[INFO] Loaded predictions cache for {len(cache)} targets.")
        except Exception as e:
            print(f"[WARNING] Failed to load cache: {e}. Starting fresh.")
            
    # Compile targets to run
    datasets = {
        'CASF-2016': CASF_2016_PDB_IDS,
        'PDBbind-v2020': PDBBIND_V2020_PDB_IDS
    }
    
    total_structures = sum(len(ids) for ids in datasets.values())
    processed_count = 0
    
    for ds_name, pdb_ids in datasets.items():
        print(f"\nEvaluating dataset: {ds_name} ({len(pdb_ids)} structures)...")
        
        for idx, pdb_id in enumerate(pdb_ids, 1):
            processed_count += 1
            print(f"[{processed_count}/{total_structures}] Processing {pdb_id.upper()} in {ds_name}...")
            
            # Step 1: Download or Retrieve from Cache
            pdb_path = pdb_dir / f"{pdb_id}.pdb"
            
            if pdb_id in cache:
                true_centers = cache[pdb_id]['true_centers']
                fp_pockets = cache[pdb_id]['fpocket']
                p2r_pockets = cache[pdb_id]['p2rank']
                pur_pockets = cache[pdb_id]['puresnet']
            else:
                # Download PDB
                pdb_path = download_pdb(pdb_id, pdb_dir)
                if not pdb_path or not pdb_path.exists():
                    print(f"[ERROR] Skip {pdb_id.upper()}: download failed.")
                    continue
                
                # Extract true centroids
                true_centers = extract_true_ligand_centers(pdb_path)
                if not true_centers:
                    print(f"[WARNING] Skip {pdb_id.upper()}: No valid heavy-atom ligands found.")
                    continue
                
                # Run tools locally
                fp_raw = run_fpocket(str(pdb_path))
                fp_pockets = [
                    {'center': p['center'].tolist(), 'score': float(p['score']), 'volume': float(p['volume'])}
                    for p in fp_raw
                ]
                
                p2r_raw = run_p2rank(str(pdb_path), p2rank_path=p2rank_exe)
                p2r_pockets = [
                    {'center': p['center'].tolist(), 'score': float(p['score']), 'volume': float(p['volume'])}
                    for p in p2r_raw
                ]
                
                pur_raw = run_puresnet(str(pdb_path), docker_image="salidock-puresnet-cpu:latest")
                pur_pockets = [
                    {'center': p['center'].tolist(), 'score': float(p['score']), 'volume': float(p['volume'])}
                    for p in pur_raw
                ]
                
                # Save to cache
                cache[pdb_id] = {
                    'true_centers': true_centers,
                    'fpocket': fp_pockets,
                    'p2rank': p2r_pockets,
                    'puresnet': pur_pockets
                }
                
                # Write cache updates
                try:
                    with open(cache_path, 'w', encoding='utf-8') as f:
                        json.dump(cache, f, indent=2)
                except Exception as e:
                    print(f"[ERROR] Failed to save cache: {e}")
            
    # ---------------------------------------------------------
    # Evaluation Sweep on Cached Predictions
    # ---------------------------------------------------------
    print("\n" + "="*80)
    print("               RUNNING FUSION ACCURACY METRICS EVALUATION               ")
    print("=" * 80)
    
    results = {}
    
    for ds_name, pdb_ids in datasets.items():
        results[ds_name] = {
            'evaluated': 0,
            'top1_success': {c: 0 for c in candidate_weights},
            'top5_success': {c: 0 for c in candidate_weights}
        }
        
        for pdb_id in pdb_ids:
            if pdb_id not in cache:
                continue
                
            entry = cache[pdb_id]
            true_centers = entry['true_centers']
            
            # Reconstruct list with np.ndarray coordinates for fusion engine
            fp_pockets = [{'center': np.array(p['center']), 'score': p['score'], 'volume': p['volume']} for p in entry['fpocket']]
            p2r_pockets = [{'center': np.array(p['center']), 'score': p['score'], 'volume': p['volume']} for p in entry['p2rank']]
            pur_pockets = [{'center': np.array(p['center']), 'score': p['score'], 'volume': p['volume']} for p in entry['puresnet']]
            
            results[ds_name]['evaluated'] += 1
            
            for c_name, weights in candidate_weights.items():
                consensus_results = fuse_predictions(
                    fpocket_pockets=fp_pockets,
                    p2rank_pockets=p2r_pockets,
                    puresnet_pockets=pur_pockets,
                    weights=weights,
                    pdb_path=None, # skip residue annotation to speed up evaluation
                    top_n=10
                )
                
                if not consensus_results:
                    continue
                    
                top1_ok = False
                top5_ok = False
                
                for rank_idx, result in enumerate(consensus_results):
                    pred_center = np.array(result.center)
                    
                    for tc in true_centers:
                        dist = euclidean_distance(pred_center, tc)
                        if dist <= 4.0:
                            if rank_idx == 0:
                                top1_ok = True
                            if rank_idx < 5:
                                top5_ok = True
                                
                if top1_ok:
                    results[ds_name]['top1_success'][c_name] += 1
                if top5_ok:
                    results[ds_name]['top5_success'][c_name] += 1
                    
    # ---------------------------------------------------------
    # Report final results
    # ---------------------------------------------------------
    print("\n" + "="*95)
    print(f"{'FINAL COMPILING BENCHMARK RESULTS':^95}")
    print("="*95)
    
    overall_top1 = {c: 0 for c in candidate_weights}
    overall_top5 = {c: 0 for c in candidate_weights}
    overall_evaluated = 0
    
    chart_data = {
        'labels': [],
        'Vector A Top1': [], 'Vector B Top1': [],
        'Vector A Top5': [], 'Vector B Top5': []
    }
    
    for ds_name in datasets:
        eval_count = results[ds_name]['evaluated']
        print(f"Dataset: {ds_name} | Evaluated complexes: {eval_count}")
        print("-" * 95)
        
        if eval_count == 0:
            print("No structures successfully evaluated for this dataset.")
            print("-" * 95)
            continue
            
        chart_data['labels'].append(ds_name)
        overall_evaluated += eval_count
        
        for c_name in candidate_weights:
            top1_succ = results[ds_name]['top1_success'][c_name]
            top5_succ = results[ds_name]['top5_success'][c_name]
            
            overall_top1[c_name] += top1_succ
            overall_top5[c_name] += top5_succ
            
            acc_top1 = (top1_succ / eval_count) * 100
            acc_top5 = (top5_succ / eval_count) * 100
            
            print(f"  {c_name:30} | DCA@top1: {acc_top1:6.2f}% | DCA@top5: {acc_top5:6.2f}%")
            
            if c_name == 'Vector A (PUResNet-Dominant)':
                chart_data['Vector A Top1'].append(acc_top1)
                chart_data['Vector A Top5'].append(acc_top5)
            else:
                chart_data['Vector B (P2Rank-Dominant)'].append(acc_top1)
                chart_data['Vector B Top5'].append(acc_top5)
        print("-" * 95)
        
    print("\n" + "="*95)
    print(f"{'OVERALL COMBINED PERFORMANCE SUMMARY':^95}")
    print("="*95)
    print(f"Total complexes evaluated: {overall_evaluated}")
    print("-" * 95)
    
    for c_name in candidate_weights:
        tot_top1 = (overall_top1[c_name] / overall_evaluated) * 100 if overall_evaluated > 0 else 0
        tot_top5 = (overall_top5[c_name] / overall_evaluated) * 100 if overall_evaluated > 0 else 0
        print(f"  {c_name:30} | DCA@top1: {tot_top1:6.2f}% | DCA@top5: {tot_top5:6.2f}%")
    print("="*95)
    
    # Final recommendation
    score_a = overall_top1['Vector A (PUResNet-Dominant)'] + overall_top5['Vector A (PUResNet-Dominant)']
    score_b = overall_top1['Vector B (P2Rank-Dominant)'] + overall_top5['Vector B (P2Rank-Dominant)']
    
    print("\n" + "="*80)
    print(f"{'DEFAULT CAVITY WEIGHTS DECISION':^80}")
    print("="*80)
    if score_a > score_b:
        print("RECOMMENDATION: Vector A (PUResNet-Dominant) wins the sweep.")
        print("Set default configurations to: w_fpocket = 0.1039, w_p2rank = 0.2297, w_puresnet = 0.6665")
    elif score_b > score_a:
        print("RECOMMENDATION: Vector B (P2Rank-Dominant) wins the sweep.")
        print("Set default configurations to: w_fpocket = 0.0939, w_p2rank = 0.6364, w_puresnet = 0.2696")
    else:
        print("RECOMMENDATION: Tie. Select Vector A (PUResNet-Dominant) due to superior overall validation profiles.")
    print("="*80)
    
    # ---------------------------------------------------------
    # Plot comparative chart
    # ---------------------------------------------------------
    if len(chart_data['labels']) > 0:
        x = np.arange(len(chart_data['labels']))
        width = 0.35
        
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), dpi=150)
        
        # Plot top-1
        ax1.bar(x - width/2, chart_data['Vector A Top1'], width, label='Vector A (PUResNet-Dom)', color='#6B46C1', edgecolor='black', linewidth=0.5)
        ax1.bar(x + width/2, chart_data['Vector B (P2Rank-Dom)'], width, label='Vector B (P2Rank-Dom)', color='#4299E1', edgecolor='black', linewidth=0.5)
        ax1.set_title('Empirical Comparison: DCA@top-1 Success Rate', fontsize=12, fontweight='bold')
        ax1.set_xticks(x)
        ax1.set_xticklabels(chart_data['labels'], fontsize=10)
        ax1.set_ylabel('Success Rate (%)')
        ax1.set_ylim(0, 100)
        ax1.grid(axis='y', linestyle='--', alpha=0.5)
        ax1.legend(frameon=True, facecolor='#F7FAFC')
        
        # Plot top-5
        ax2.bar(x - width/2, chart_data['Vector A Top5'], width, label='Vector A (PUResNet-Dom)', color='#6B46C1', edgecolor='black', linewidth=0.5)
        ax2.bar(x + width/2, chart_data['Vector B (P2Rank-Dom)'], width, label='Vector B (P2Rank-Dom)', color='#4299E1', edgecolor='black', linewidth=0.5)
        ax2.set_title('Empirical Comparison: DCA@top-5 Success Rate', fontsize=12, fontweight='bold')
        ax2.set_xticks(x)
        ax2.set_xticklabels(chart_data['labels'], fontsize=10)
        ax2.set_ylabel('Success Rate (%)')
        ax2.set_ylim(0, 100)
        ax2.grid(axis='y', linestyle='--', alpha=0.5)
        ax2.legend(frameon=True, facecolor='#F7FAFC')
        
        plt.tight_layout()
        plt.savefig(str(work_dir / "benchmark_results.png"), dpi=300)
        print(f"\nConsensus benchmarking plot saved successfully at {work_dir / 'benchmark_results.png'}")

if __name__ == '__main__':
    main()
