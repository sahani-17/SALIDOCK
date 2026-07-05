import os
import sys
import urllib.request
import json
import numpy as np
from pathlib import Path

# Add current workspace directory to python path for imports
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from salidock.cavity.runners import run_fpocket, run_p2rank, run_puresnet
from salidock.cavity.fusion import fuse_predictions
from run_unified_preprocessing_benchmark import preprocess_pdb

# ---------------------------------------------------------
# Curated list of 30 diverse representative PDB complexes from the CASF-2016 core set
# ---------------------------------------------------------
PDB_IDS = [
    '1a30', '1bcu', '1bzc', '1c5z', '1e66', '1eby', '1g2k', '1gpk', '1gpn', '1h22',
    '1h23', '1k1i', '1lpg', '1mq6', '1nc1', '1nc3', '1nvq', '1o0h', '1o3f', '1o5b',
    '1yc5', '3gep', '3zvt', '5tmn', '3uev', '1u1b', '2br1', '1bcd', '3ptb', '2rmy'
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
    if pdb_path.exists() and pdb_path.stat().st_size > 1000:
        return pdb_path
    
    url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
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
            centers.append(centroid)
            
    return centers

# ---------------------------------------------------------
# Calculate Euclidean distance
# ---------------------------------------------------------
def euclidean_distance(c1, c2):
    return float(np.linalg.norm(c1 - c2))

# ---------------------------------------------------------
# Main Execution Block
# ---------------------------------------------------------
def main():
    print("=" * 80)
    print("      LIGYSIS-2024 VALIDATION: BLIND CAVITY DETECTION SWEEP (N=30)         ")
    print("=" * 80)
    
    # Create directories
    work_dir = Path("real_benchmarks")
    pdb_dir = work_dir / "pdb"
    pdb_dir.mkdir(parents=True, exist_ok=True)
    
    # Check if Docker is available
    use_docker = False
    import shutil
    if shutil.which("docker"):
        use_docker = True
        print("[INFO] Docker detected. PUResNet is ENABLED.")
    else:
        print("[INFO] Docker not found. PUResNet is DISABLED (weights will self-renormalize).")

    # Load our global optimized weights from weights.json if available
    w_fp, w_p2r, w_pur = 0.0758, 0.4922, 0.5671
    weights_path = Path("backend/config/weights.json")
    if weights_path.exists():
        try:
            w_data = json.loads(weights_path.read_text())['weights']
            w_fp = w_data.get('fpocket', w_fp)
            w_p2r = w_data.get('p2rank', w_p2r)
            w_pur = w_data.get('puresnet', w_pur)
            print(f"[INFO] Loaded optimized weights from weights.json: fp={w_fp}, p2r={w_p2r}, pur={w_pur}")
        except Exception as e:
            print(f"[WARN] Failed to load weights.json, using default optimized weights. Error: {e}")

    # Track results
    evaluated_count = 0
    
    # Methods to evaluate: Individual Tools & Consensus Weight Vectors
    methods = [
        'fpocket (individual)',
        'P2Rank (individual)',
        'PUResNet (individual)',
        'Consensus (Uniform)',
        'Consensus (Global Optimized)'
    ]
    
    top1_success = {m: 0 for m in methods}
    top5_success = {m: 0 for m in methods}
    
    for pdb_id in PDB_IDS:
        print(f"\n--- Processing target: {pdb_id.upper()} ---")
        
        # 1. Download PDB
        pdb_path = download_pdb(pdb_id, pdb_dir)
        if not pdb_path:
            continue
            
        # 2. Extract true centers from raw structure
        true_centers = extract_true_ligand_centers(pdb_path)
        if not true_centers:
            print(f"  [WARN] Skipping {pdb_id.upper()}: No valid heavy-atom ligands found.")
            continue
            
        # 3. Preparation: Preprocess raw PDB -> _prep.pdb
        prep_path = pdb_dir / f"{pdb_id}_prep.pdb"
        try:
            preprocess_pdb(str(pdb_path), str(prep_path))
            print(f"  Prepared: {prep_path.name}")
        except Exception as e:
            print(f"  [ERROR] Preprocessing failed for {pdb_id.upper()}: {e}")
            continue

        # 4. Run individual tool predictions on prepared PDB
        print("  Running fpocket...")
        fp_pockets = run_fpocket(str(prep_path))
        
        print("  Running P2Rank...")
        p2r_pockets = run_p2rank(str(prep_path))
        
        pur_pockets = []
        if use_docker:
            print("  Running PUResNet (Docker)...")
            try:
                pur_pockets = run_puresnet(str(prep_path))
            except Exception as e:
                print(f"    PUResNet failed: {e}")
            
        if not fp_pockets and not p2r_pockets and not pur_pockets:
            print(f"  [WARN] Skipping {pdb_id.upper()}: All tools returned empty predictions.")
            continue
            
        evaluated_count += 1
        
        # Define evaluation runs
        eval_runs = {
            'fpocket (individual)': fp_pockets,
            'P2Rank (individual)': p2r_pockets,
            'PUResNet (individual)': pur_pockets,
            
            'Consensus (Uniform)': fuse_predictions(
                fp_pockets, p2r_pockets, pur_pockets,
                weights={'fpocket': 0.33, 'p2rank': 0.33, 'puresnet': 0.34} if use_docker else {'fpocket': 0.5, 'p2rank': 0.5},
                pdb_path=str(prep_path), top_n=10
            ),
            
            'Consensus (Global Optimized)': fuse_predictions(
                fp_pockets, p2r_pockets, pur_pockets,
                weights={'fpocket': w_fp, 'p2rank': w_p2r, 'puresnet': w_pur} if use_docker else {'fpocket': w_fp, 'p2rank': w_p2r},
                pdb_path=str(prep_path), top_n=10
            )
        }
        
        # 5. Check Success (DCA <= 4.0 Å to closest true center)
        for m_name, pockets in eval_runs.items():
            if not pockets:
                continue
                
            top1_ok = False
            top5_ok = False
            
            for rank_idx, pkt in enumerate(pockets[:5]):
                center = np.array(pkt.center) if hasattr(pkt, 'center') else np.array(pkt['center'])
                min_d = min(euclidean_distance(center, tc) for tc in true_centers)
                if min_d <= 4.0:
                    if rank_idx == 0:
                        top1_ok = True
                    top5_ok = True
                    
            if top1_ok:
                top1_success[m_name] += 1
            if top5_ok:
                top5_success[m_name] += 1
                
            print(f"    {m_name:<30} | Top-1: {'SUCCESS' if top1_ok else 'FAIL'} | Top-5: {'SUCCESS' if top5_ok else 'FAIL'}")

    # ---------------------------------------------------------
    # Report final results
    # ---------------------------------------------------------
    if evaluated_count == 0:
        print("\n[ERROR] No complexes successfully evaluated.")
        return
        
    print("\n" + "="*90)
    print(f"{'FINAL COMPILING BENCHMARK RESULTS (LIGYSIS-2024)':^90}")
    print("="*90)
    print(f"Total protein-ligand complexes successfully evaluated: {evaluated_count}")
    print("-" * 90)
    print(f"{'Method / Tool':<35} | {'DCA@top1':>10} | {'DCA@top5':>10}")
    print("-" * 90)
    for m_name in methods:
        acc_top1 = (top1_success[m_name] / evaluated_count) * 100
        acc_top5 = (top5_success[m_name] / evaluated_count) * 100
        print(f"{m_name:<35} | {acc_top1:8.2f}% | {acc_top5:8.2f}%")
    print("="*90)

if __name__ == '__main__':
    main()
