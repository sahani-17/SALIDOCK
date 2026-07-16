import json
from pathlib import Path
import numpy as np

bench = Path('/mnt/d/SALIDOCK/salidock_benchmark/preproc_benchmark')
master_path = bench / 'master_distance_matrix.tsv'
cent_path = bench / 'true_centroids.json'
prep_dir = bench / 'preprocessed_pdb'

try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
except ImportError:
    print("[ERROR] Optuna not installed.")
    sys.exit(1)

from run_unified_preprocessing_benchmark import wrrf_predict_top1, euclidean

# 1. Load true centroids and PDB sizes
print("Loading true centroids and preprocessed PDB structural features...")
true_centroids = json.loads(cent_path.read_text(encoding='utf-8'))

# Pre-calculate protein residue count for all preprocessed files
pid_sizes = {}
for p in prep_dir.glob('*_prep.pdb'):
    pid = p.name.replace('_prep.pdb', '')
    # Count unique (chain, resnum)
    residues = set()
    with open(p) as f:
        for line in f:
            if line.startswith('ATOM'):
                try:
                    chain = line[21:22].strip()
                    resnum = line[22:26].strip()
                    residues.add((chain, resnum))
                except:
                    pass
    pid_sizes[pid] = len(residues)

# 2. Load Master Distance matrix rows
print("Loading master distance matrix...")
rows = []
with open(master_path, encoding='utf-8') as fh:
    next(fh)
    for line in fh:
        parts = line.strip().split('\t')
        if len(parts) < 9:
            continue
        rows.append({
            'protein_id': parts[0],
            'tool': parts[2],
            'rank': int(parts[3]),
            'center': [float(parts[4]), float(parts[5]), float(parts[6])],
            'dist': float(parts[8])
        })

pid_dict = {}
for r in rows:
    pid = r['protein_id']
    if pid not in pid_dict:
        pid_dict[pid] = []
    pid_dict[pid].append(r)

# 3. Stratify by size brackets
brackets = {
    'small':      [], # < 150
    'medium':     [], # 150 - 300
    'large':      [], # 300 - 500
    'very_large': []  # >= 500
}

for pid, preds in pid_dict.items():
    if pid not in pid_sizes:
        continue
    sz = pid_sizes[pid]
    if sz < 150:
        brackets['small'].append((pid, preds))
    elif sz < 300:
        brackets['medium'].append((pid, preds))
    elif sz < 500:
        brackets['large'].append((pid, preds))
    else:
        brackets['very_large'].append((pid, preds))

print(f"Stratification Results:")
for k, v in brackets.items():
    print(f"  {k:<10}: {len(v)} proteins")

# 4. Run Optuna per bracket
adaptive_weights = {}

for name, subset in brackets.items():
    if not subset:
        continue
    print(f"\nRunning Optuna for bracket '{name}' ({len(subset)} proteins)...")
    
    def dca_rate(wf: float, wp: float, wu: float) -> float:
        successes = 0
        total = 0
        for pid, preds in subset:
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
        return -dca_rate(wf, wp, wu)

    study = optuna.create_study(direction='minimize')
    study.optimize(objective, n_trials=500)
    
    best = study.best_params
    best_val = -study.best_value
    
    # Normalize weights
    w_sum = sum(best.values())
    norm_w = {k: v/w_sum for k, v in best.items()} if w_sum > 0 else {'w_fpocket':0.0, 'w_p2rank':0.0, 'w_puresnet':0.0}
    
    adaptive_weights[name] = {
        'raw_weights': best,
        'normalized_weights': norm_w,
        'dca_4A': best_val
    }
    print(f"  Best normalized weights for '{name}':")
    print(f"    fpocket  : {norm_w['w_fpocket']:.4f}")
    print(f"    p2rank   : {norm_w['w_p2rank']:.4f}")
    print(f"    puresnet : {norm_w['w_puresnet']:.4f}")
    print(f"    DCA@4Å   : {best_val*100:.2f}%")

# 5. Evaluate overall performance of Size-Adaptive Consensus vs Global Weights
global_weights = {
    'w_fpocket': 0.0758,
    'w_p2rank': 0.4922,
    'w_puresnet': 0.5671
}

print("\n" + "="*80)
print("EVALUATING OVERALL GENERALIZATION PERFORMANCE")
print("="*80)

# Evaluate Global Weights on full dataset
total_proteins = 0
global_successes = 0
adaptive_successes = 0

for name, subset in brackets.items():
    local_w = adaptive_weights[name]['raw_weights']
    for pid, preds in subset:
        tc = true_centroids.get(pid)
        if not tc:
            continue
            
        # Global weights prediction
        pred_global = wrrf_predict_top1(preds, global_weights['w_fpocket'], global_weights['w_p2rank'], global_weights['w_puresnet'])
        if pred_global is not None:
            min_dg = min(euclidean(pred_global, c) for c in tc)
            if min_dg <= 4.0:
                global_successes += 1
                
        # Adaptive weights prediction
        pred_adaptive = wrrf_predict_top1(preds, local_w['w_fpocket'], local_w['w_p2rank'], local_w['w_puresnet'])
        if pred_adaptive is not None:
            min_da = min(euclidean(pred_adaptive, c) for c in tc)
            if min_da <= 4.0:
                adaptive_successes += 1
                
        total_proteins += 1

global_rate = global_successes / total_proteins * 100
adaptive_rate = adaptive_successes / total_proteins * 100

print(f"Total Proteins Evaluated: {total_proteins}")
print(f"Global weights DCA@4Å    : {global_rate:.2f}%")
print(f"Size-Adaptive DCA@4Å     : {adaptive_rate:.2f}%")
print(f"Absolute DCA Improvement : {adaptive_rate - global_rate:+.2f}%")

# Save adaptive weights
out_path = bench / 'optuna_results' / 'size_adaptive_weights.json'
out_path.write_text(json.dumps(adaptive_weights, indent=2), encoding='utf-8')
print(f"\nSaved size-adaptive weights to: {out_path}")
