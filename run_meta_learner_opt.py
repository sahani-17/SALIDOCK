import json
from pathlib import Path
import numpy as np

bench = Path('/mnt/d/SALIDOCK/salidock_benchmark/preproc_benchmark')
master_path = bench / 'master_distance_matrix.tsv'
cent_path = bench / 'true_centroids.json'
prep_dir = bench / 'preprocessed_pdb'
BASE_DIR = Path(__file__).resolve().parent

try:
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import KFold
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False
    print("[WARN] scikit-learn not found. We will implement a lightweight Decision Tree in pure NumPy/Python.")

from run_unified_preprocessing_benchmark import wrrf_predict_top1, euclidean

# 1. Load data
print("Loading true centroids and PDB sizes...")
true_centroids = json.loads(cent_path.read_text(encoding='utf-8'))

# Cache PDB sizes
pid_sizes = {}
for p in prep_dir.glob('*_prep.pdb'):
    pid = p.name.replace('_prep.pdb', '')
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

# Read master TSV
print("Reading master distance matrix...")
rows = []
with open(master_path, encoding='utf-8') as fh:
    next(fh)
    for line in fh:
        parts = line.strip().split('\t')
        if len(parts) < 9:
            continue
        rows.append({
            'pid': parts[0],
            'tool': parts[2],
            'rank': int(parts[3]),
            'center': [float(parts[4]), float(parts[5]), float(parts[6])],
            'score': float(parts[7]),
            'dist': float(parts[8])
        })

pid_dict = {}
for r in rows:
    pid = r['pid']
    if pid not in pid_dict:
        pid_dict[pid] = []
    pid_dict[pid].append(r)

# 2. Build feature matrix (X) and targets (y)
print("Building Meta-Learner training set...")
X_data = []
y_fp = []
y_p2r = []
y_pur = []
pids_clean = []
raw_preds = {}

for pid, preds in pid_dict.items():
    if pid not in pid_sizes:
        continue
        
    # Get top-1 prediction for each tool
    top1_fp = [p for p in preds if p['tool'] == 'fpocket' and p['rank'] == 1]
    top1_p2r = [p for p in preds if p['tool'] == 'p2rank' and p['rank'] == 1]
    top1_pur = [p for p in preds if p['tool'] == 'purnet' and p['rank'] == 1]
    
    # We require at least P2Rank and fpocket to have run (since PUResNet could be disabled in some NMR/empty cases)
    if not top1_fp or not top1_p2r:
        continue
        
    # Default values for missing PUResNet
    fp_score = top1_fp[0]['score']
    p2r_score = top1_p2r[0]['score']
    pur_score = top1_pur[0]['score'] if top1_pur else 0.0
    
    c_fp = np.array(top1_fp[0]['center'])
    c_p2r = np.array(top1_p2r[0]['center'])
    c_pur = np.array(top1_pur[0]['center']) if top1_pur else c_p2r.copy()
    
    # Pairwise distances between tool top-1 centers
    dist_fp_p2r = float(np.linalg.norm(c_fp - c_p2r))
    dist_fp_pur = float(np.linalg.norm(c_fp - c_pur))
    dist_p2r_pur = float(np.linalg.norm(c_p2r - c_pur))
    
    n_res = pid_sizes[pid]
    
    # Feature vector: [fp_score, p2r_score, pur_score, dist_fp_p2r, dist_fp_pur, dist_p2r_pur, n_res]
    features = [fp_score, p2r_score, pur_score, dist_fp_p2r, dist_fp_pur, dist_p2r_pur, n_res]
    X_data.append(features)
    
    # Target: 1 if tool top-1 is within 4.0 Å, else 0
    y_fp.append(int(top1_fp[0]['dist'] <= 4.0 and top1_fp[0]['dist'] >= 0))
    y_p2r.append(int(top1_p2r[0]['dist'] <= 4.0 and top1_p2r[0]['dist'] >= 0))
    y_pur.append(int(top1_pur[0]['dist'] <= 4.0 and top1_pur[0]['dist'] >= 0) if top1_pur else 0)
    
    pids_clean.append(pid)
    raw_preds[pid] = preds

X = np.array(X_data)
y_fp = np.array(y_fp)
y_p2r = np.array(y_p2r)
y_pur = np.array(y_pur)
pids_clean = np.array(pids_clean)

print(f"Dataset compiled: {len(X)} samples, {X.shape[1]} features.")

# 3. Cross-Validation Evaluation
if HAS_SKLEARN:
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    
    global_successes = 0
    meta_successes = 0
    total_evals = 0
    
    global_weights = {'fpocket': 0.0758, 'p2rank': 0.4922, 'puresnet': 0.5671}
    
    print("\nTraining Meta-Learners using 5-Fold Cross-Validation...")
    for fold, (train_idx, test_idx) in enumerate(kf.split(X), 1):
        X_train, X_test = X[train_idx], X[test_idx]
        pids_test = pids_clean[test_idx]
        
        # Train a Random Forest for each tool to predict success probability
        clf_fp = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
        clf_p2r = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
        clf_pur = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
        
        clf_fp.fit(X_train, y_fp[train_idx])
        clf_p2r.fit(X_train, y_p2r[train_idx])
        clf_pur.fit(X_train, y_pur[train_idx])
        
        # Predict success probabilities on test fold
        prob_fp = clf_fp.predict_proba(X_test)[:, 1]
        prob_p2r = clf_p2r.predict_proba(X_test)[:, 1]
        prob_pur = clf_pur.predict_proba(X_test)[:, 1]
        
        # Evaluate wRRF using dynamic weights vs global weights
        for idx, pid in enumerate(pids_test):
            tc = true_centroids.get(pid)
            if not tc:
                continue
                
            preds = raw_preds[pid]
            
            # 1. Global weights consensus
            p_global = wrrf_predict_top1(preds, global_weights['fpocket'], global_weights['p2rank'], global_weights['puresnet'])
            if p_global is not None:
                if min(euclidean(p_global, c) for c in tc) <= 4.0:
                    global_successes += 1
            
            # 2. Meta-Learner dynamic weights
            w_fp = prob_fp[idx]
            w_p2r = prob_p2r[idx]
            w_pur = prob_pur[idx]
            
            # Avoid all-zero weights
            if w_fp + w_p2r + w_pur == 0:
                w_fp, w_p2r, w_pur = global_weights['fpocket'], global_weights['p2rank'], global_weights['puresnet']
                
            p_meta = wrrf_predict_top1(preds, w_fp, w_p2r, w_pur)
            if p_meta is not None:
                if min(euclidean(p_meta, c) for c in tc) <= 4.0:
                    meta_successes += 1
                    
            total_evals += 1
            
        print(f"  Fold {fold} complete.")

    g_rate = global_successes / total_evals * 100
    m_rate = meta_successes / total_evals * 100
    
    print("\n" + "="*80)
    print("META-LEARNER ENSUBLE STACKING PERFORMANCE")
    print("="*80)
    print(f"Total Evaluated Proteins : {total_evals}")
    print(f"Global Weights DCA@4Å    : {g_rate:.2f}%")
    print(f"Meta-Learner DCA@4Å      : {m_rate:.2f}%")
    print(f"Absolute DCA Improvement : {m_rate - g_rate:+.2f}%")
    
    # Train final models on entire dataset for production export
    print("\nTraining final Meta-Learner models for export...")
    model_fp = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
    model_p2r = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
    model_pur = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
    
    model_fp.fit(X, y_fp)
    model_p2r.fit(X, y_p2r)
    model_pur.fit(X, y_pur)
    
    # Save the Random Forest parameters / weights in a compact representation
    # (since we cannot easily serialize sklearn models to json directly, we save them as pickle)
    import pickle
    model_dir = BASE_DIR / 'backend' / 'config'
    model_dir.mkdir(exist_ok=True)
    
    with open(model_dir / 'meta_learner_fp.pkl', 'wb') as f:
        pickle.dump(model_fp, f)
    with open(model_dir / 'meta_learner_p2r.pkl', 'wb') as f:
        pickle.dump(model_p2r, f)
    with open(model_dir / 'meta_learner_pur.pkl', 'wb') as f:
        pickle.dump(model_pur, f)
        
    print(f"Models successfully serialized to {model_dir}/")
    
else:
    # Pure Python decision rule fallback optimization
    print("Evaluating custom analytical decision logic...")
    # Let's test a simple heuristic:
    # If P2Rank has a huge score (> 10) and P2Rank/PUResNet are in agreement, trust P2Rank.
    # If P2Rank/PUResNet disagree and protein is large, trust PUResNet.
    successes = 0
    total = 0
    for pid in pids_clean:
        tc = true_centroids.get(pid)
        if not tc:
            continue
        preds = raw_preds[pid]
        
        # Extract features
        top1_fp = [p for p in preds if p['tool'] == 'fpocket' and p['rank'] == 1]
        top1_p2r = [p for p in preds if p['tool'] == 'p2rank' and p['rank'] == 1]
        top1_pur = [p for p in preds if p['tool'] == 'purnet' and p['rank'] == 1]
        
        c_p2r = np.array(top1_p2r[0]['center'])
        c_pur = np.array(top1_pur[0]['center']) if top1_pur else c_p2r
        dist = float(np.linalg.norm(c_p2r - c_pur))
        n_res = pid_sizes[pid]
        p2r_score = top1_p2r[0]['score']
        
        # Adaptive logic
        if dist <= 3.0:
            # High agreement -> 50% P2Rank / 50% PUResNet
            w_fp, w_p2r, w_pur = 0.0, 0.5, 0.5
        elif n_res >= 300:
            # Large protein, disagreement -> trust PUResNet
            w_fp, w_p2r, w_pur = 0.05, 0.15, 0.80
        elif p2r_score > 12.0:
            # High geometric confidence -> trust P2Rank
            w_fp, w_p2r, w_pur = 0.05, 0.85, 0.10
        else:
            # Default global optimal weights
            w_fp, w_p2r, w_pur = 0.0758, 0.4922, 0.5671
            
        p_res = wrrf_predict_top1(preds, w_fp, w_p2r, w_pur)
        if p_res is not None:
            if min(euclidean(p_res, c) for c in tc) <= 4.0:
                successes += 1
        total += 1
        
    print(f"Heuristic Decision Logic DCA@4Å: {successes/total*100:.2f}%")
