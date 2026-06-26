import os
import sys
import urllib.request
import numpy as np
from pathlib import Path

# Add current workspace directory to python path for imports
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from salidock.cavity.runners import run_fpocket, run_p2rank, run_puresnet
from salidock.cavity.fusion import fuse_predictions

# ---------------------------------------------------------
# Curated list of 30 diverse representative PDB complexes from the CASF-2016 core set
# ---------------------------------------------------------
PDB_IDS = [
    '1a30', '1bzc', '1e66', '1o5a', '1yc5', '3gep', '3zvt', '5tmn', '3uev', '1u1b',
    '2br1', '1bcd', '3ptb', '1e6t', '1gpn', '1hsg', '1lpz', '1n2v', '2rmy', '3c2f',
    '1gsa', '1foa', '1atl', '1blc', '1eve', '1fjs', '1gwx', '1h1p', '1jcl', '1k22'
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
    # Dictionary to group coordinates by residue id: (resname, chain, resnum)
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
        # Keep only ligands with at least 5 heavy atoms to avoid small ions or fragments
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
    print("            SALIDOCK: REAL BLIND BENCHMARKING VALIDATION SWEEP             ")
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
        print("[INFO] Docker detected. Running with fpocket + P2Rank + PUResNet.")
    else:
        print("[INFO] Docker not found. Running with fpocket + P2Rank (weights will self-renormalize).")
        
    # Candidate Weight Configurations
    candidate_weights = {
        'Vector A (PUResNet-Dominant / sc-PDB CV)': {
            'fpocket': 0.1039,
            'p2rank': 0.2297,
            'puresnet': 0.6665
        },
        'Vector B (P2Rank-Dominant / HOLO4K CV)': {
            'fpocket': 0.0939,
            'p2rank': 0.6364,
            'puresnet': 0.2696
        }
    }
    
    # Track statistics
    evaluated_count = 0
    top1_success = {c: 0 for c in candidate_weights}
    top5_success = {c: 0 for c in candidate_weights}
    
    for pdb_id in PDB_IDS:
        print(f"\n--- Processing target: {pdb_id.upper()} ---")
        
        # 1. Download PDB
        pdb_path = download_pdb(pdb_id, pdb_dir)
        if not pdb_path:
            continue
            
        # 2. Extract true centers
        true_centers = extract_true_ligand_centers(pdb_path)
        if not true_centers:
            print(f"Skipping {pdb_id.upper()}: No valid heavy-atom ligands found.")
            continue
            
        # 3. Run individual tool prediction tasks
        print("Running fpocket cavity prediction...")
        fp_pockets = run_fpocket(str(pdb_path))
        
        print("Running P2Rank cavity prediction...")
        p2r_pockets = run_p2rank(str(pdb_path))
        
        pur_pockets = []
        if use_docker:
            print("Running PUResNet Docker cavity prediction...")
            pur_pockets = run_puresnet(str(pdb_path))
            
        if not fp_pockets and not p2r_pockets and not pur_pockets:
            print(f"Skipping {pdb_id.upper()}: All cavity tools returned empty predictions.")
            continue
            
        evaluated_count += 1
        
        # 4. Evaluate each weight configuration
        for c_name, weights in candidate_weights.items():
            # Run the consensus fusion engine
            consensus_results = fuse_predictions(
                fpocket_pockets=fp_pockets,
                p2rank_pockets=p2r_pockets,
                puresnet_pockets=pur_pockets,
                weights=weights if use_docker else {k: v for k, v in weights.items() if k != 'puresnet'},
                pdb_path=str(pdb_path),
                top_n=10
            )
            
            if not consensus_results:
                continue
                
            # Evaluate DCA@top-1 and DCA@top-5 success rates against true centers
            # Success is defined as distance <= 4.0 Å to any true ligand centroid
            top1_success_found = False
            top5_success_found = False
            
            for rank_idx, result in enumerate(consensus_results):
                center = np.array(result.center)
                for true_center in true_centers:
                    dist = euclidean_distance(center, true_center)
                    if dist <= 4.0:
                        if rank_idx == 0:
                            top1_success_found = True
                        if rank_idx < 5:
                            top5_success_found = True
                            
            if top1_success_found:
                top1_success[c_name] += 1
            if top5_success_found:
                top5_success[c_name] += 1
                
            # Log results for this complex
            res_str = f"[{c_name}] true pocket found? Top-1: {top1_success_found}, Top-5: {top5_success_found}"
            print(res_str)

    # ---------------------------------------------------------
    # Report final results
    # ---------------------------------------------------------
    if evaluated_count == 0:
        print("\n[ERROR] No complexes successfully evaluated.")
        return
        
    print("\n" + "="*90)
    print(f"{'FINAL COMPILING BENCHMARK RESULTS':^90}")
    print("="*90)
    print(f"Total protein-ligand complexes successfully evaluated: {evaluated_count}")
    print("-" * 90)
    
    for c_name in candidate_weights:
        acc_top1 = (top1_success[c_name] / evaluated_count) * 100
        acc_top5 = (top5_success[c_name] / evaluated_count) * 100
        print(f"{c_name:40} | DCA@top1: {acc_top1:5.2f}% | DCA@top5: {acc_top5:5.2f}%")
        
    print("="*90)
    
    # Recommend default configuration
    score_a = top1_success['Vector A (PUResNet-Dominant / sc-PDB CV)'] + top5_success['Vector A (PUResNet-Dominant / sc-PDB CV)']
    score_b = top1_success['Vector B (P2Rank-Dominant / HOLO4K CV)'] + top5_success['Vector B (P2Rank-Dominant / HOLO4K CV)']
    
    print("\n" + "="*80)
    print(f"{'BENCHMARKING RECOMMENDATION FOR DEFAULT WEIGHTS':^80}")
    print("="*80)
    if score_a > score_b:
        print("RECOMMENDATION: Vector A (PUResNet-Dominant) is the winner on this benchmark.")
    elif score_b > score_a:
        print("RECOMMENDATION: Vector B (P2Rank-Dominant) is the winner on this benchmark.")
    else:
        print("RECOMMENDATION: Tied results. Both vectors perform equally well.")
    print("="*80)

if __name__ == '__main__':
    main()
