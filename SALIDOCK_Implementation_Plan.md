# SALIDOCK Benchmarking & Ensemble Optimization — Full Implementation Plan
**Prepared by:** Antigravity AI / SaliDock Core Dev Team  
**Date:** June 22, 2026  
**Status:** Pre-submission validation pipeline

---

## Overview

This document defines the complete, ordered implementation plan for scientifically validating the SaliDock wRRF consensus ensemble. The guiding principle across all phases is:

> **Run everything first → freeze data → optimize on frozen data → validate blind**

No optimization decision is made until all benchmark data is collected.

---

## Phase 0 — Infrastructure Setup
*Before any benchmark run begins*

### 0.1 Directory Structure

```
salidock_benchmark/
├── raw_results/               # Phase 1 output — never modified after collection
│   ├── fpocket/
│   │   ├── CHEN11.tsv
│   │   ├── COACH420.tsv
│   │   ├── JOINED560.tsv
│   │   ├── scPDB.tsv
│   │   └── HOLO4K.tsv
│   ├── p2rank/
│   │   └── [same structure]
│   └── purnet/
│       └── [same structure]
├── master_distance_matrix.tsv  # Phase 2 output — single source of truth
├── dca_labels/                 # Phase 2 output — binary success labels
│   ├── threshold_3A.tsv
│   ├── threshold_4A.tsv
│   └── threshold_5A.tsv
├── optuna/                     # Phase 3 output
│   ├── global_optimization.db
│   ├── optimal_weights.json
│   └── ablation_results.json
├── figures/                    # Phase 5 output
└── ligysis_validation/         # Phase 6 output — blind test, opened last
```

### 0.2 Per-Protein Raw Result Schema

Every tool's output for every protein must be stored in this exact format:

```
protein_id  | dataset   | tool    | rank | pred_x | pred_y | pred_z | confidence | dist_to_true
1ABC_A      | COACH420  | fpocket | 1    | 12.3   | 4.5    | 8.9    | 0.847      | 2.31
1ABC_A      | COACH420  | fpocket | 2    | 18.1   | 9.2    | 3.4    | 0.712      | 7.84
...
1ABC_A      | COACH420  | p2rank  | 1    | 11.9   | 4.8    | 9.1    | 0.923      | 1.98
```

**Critical:** Store top-5 predictions per tool per protein. wRRF operates on ranks — if you only store top-1 you cannot reconstruct fusion scores for all weight configurations during Optuna.

**True ligand centroid** must also be stored per protein (computed once from PDB HETATM records).

### 0.3 Execution Order (Smallest to Largest)

| Order | Dataset    | N     | Reason |
|-------|-----------|-------|--------|
| 1     | CHEN11    | 111   | Fastest — confirms pipeline is working |
| 2     | CASF-2016 | 285   | Real run target |
| 3     | COACH420  | 420   | Standard benchmark |
| 4     | JOINED-560 | 560  | Overlapping coverage test |
| 5     | PDBbind-v2020 | 500 | Real run target |
| 6     | sc-PDB    | 2000  | Large — run overnight |
| 7     | HOLO4K    | 4000  | Largest — run on cluster/overnight |

---

## Phase 1 — Pure Data Collection
*Collect per-protein raw distances. No optimization. No aggregation yet.*

### 1.1 fpocket

```bash
# For each protein PDB file in dataset:
fpocket -f protein.pdb

# Parse output: extract pocket center coordinates and druggability scores
# Store top-5 pockets by druggability score per protein
python parse_fpocket.py --input fpocket_out/ \
                        --ligand_centroids centroids.tsv \
                        --output raw_results/fpocket/DATASET.tsv
```

### 1.2 P2Rank

```bash
# P2Rank batch mode:
./prank predict-eval \
    -f dataset.ds \
    -o p2rank_output/ \
    -threads 4

# Parse predictions.csv — extract top-5 pocket centers + scores per protein
python parse_p2rank.py --input p2rank_output/predictions.csv \
                       --ligand_centroids centroids.tsv \
                       --output raw_results/p2rank/DATASET.tsv
```

### 1.3 PUResNet (CPU Docker Mode)

```bash
# Run CPU-only Docker for each protein:
docker run --rm \
    -v $(pwd)/pdb_files:/input \
    -v $(pwd)/purnet_output:/output \
    purresnet:cpu-fixed \
    python predict.py --input /input/protein.pdb --output /output/

# Parse voxel probability outputs → pocket centers
python parse_purresnet.py --input purnet_output/ \
                          --ligand_centroids centroids.tsv \
                          --output raw_results/purnet/DATASET.tsv
```

### 1.4 CPU vs GPU Validation Check (CHEN11 only)

Run CHEN11 on both CPU Docker and a GPU environment (Google Colab T4 is sufficient).
Compare predicted pocket coordinates. If mean coordinate shift < 1.0 Å and DCA success
rate difference < 2%, add one sentence to Methods confirming CPU-mode parity.
This closes the reviewer question permanently with a single afternoon of work.

### 1.5 Data Integrity Checks (After Each Dataset)

```python
# Run after every dataset completes — before moving to the next:
assert all proteins have top-5 entries for ALL THREE tools
assert no NaN in confidence scores
assert true ligand centroid present for every protein_id
assert distance values are Euclidean and in Angstroms (sanity: range 0–50 Å)
```

**Do not proceed to the next dataset if any check fails.**

---

## Phase 2 — Freeze and Compute Labels
*Runs once, after all 7 datasets complete. No tools run after this point.*

### 2.1 Build Master Distance Matrix

```python
# merge_master.py
import pandas as pd

datasets = ['CHEN11', 'CASF2016', 'COACH420', 'JOINED560',
            'PDBbind2020', 'scPDB', 'HOLO4K']
tools    = ['fpocket', 'p2rank', 'purnet']

frames = []
for ds in datasets:
    for tool in tools:
        df = pd.read_csv(f'raw_results/{tool}/{ds}.tsv', sep='\t')
        frames.append(df)

master = pd.concat(frames).reset_index(drop=True)
master.to_csv('master_distance_matrix.tsv', sep='\t', index=False)
print(f"Master matrix: {len(master)} rows")
# Expected: ~7 datasets × ~1,300 avg proteins × 3 tools × 5 ranks ≈ 136,500 rows
```

**After this line, the master file is read-only. Never overwrite it.**

### 2.2 Compute DCA Labels at All Thresholds

```python
# compute_dca_labels.py
for threshold in [3.0, 4.0, 5.0]:
    labels = master.copy()
    labels['dca_success'] = (labels['dist_to_true'] <= threshold).astype(int)
    # Keep only rank=1 rows for top-1 labels
    top1 = labels[labels['rank'] == 1]
    top1.to_csv(f'dca_labels/threshold_{threshold}A.tsv', sep='\t', index=False)
```

---

## Phase 3 — Global Size-Weighted Optuna Optimization
*Pure computation on frozen data. Runs in minutes to hours. No tool inference.*

### 3.1 Objective Function

```python
import optuna
import numpy as np
import pandas as pd

master = pd.read_csv('master_distance_matrix.tsv', sep='\t')

# Dataset sizes for weighting
DATASET_SIZES = {
    'CHEN11': 111, 'CASF2016': 285, 'COACH420': 420,
    'JOINED560': 560, 'PDBbind2020': 500, 'scPDB': 2000, 'HOLO4K': 4000
}
TOTAL_N = sum(DATASET_SIZES.values())

def wrrf_score(protein_data, w_fp, w_p2r, w_pur, k=60, cluster_radius=6.0):
    """
    Compute wRRF consensus top-1 DCA success for one protein.
    protein_data: rows from master for this protein_id, all tools, all ranks
    Returns: 1 if consensus top-1 within 4.0Å, else 0
    """
    weights = {'fpocket': w_fp, 'p2rank': w_p2r, 'purnet': w_pur}
    # [Full wRRF spatial clustering implementation here]
    # Returns binary DCA success at 4.0Å threshold
    pass

def objective(trial):
    # Sample weights — constrained to sum to 1.0
    w_fp  = trial.suggest_float('w_fp',  0.0, 0.4)
    w_p2r = trial.suggest_float('w_p2r', 0.0, 0.8)
    w_pur = trial.suggest_float('w_pur', 0.0, 0.9)
    total = w_fp + w_p2r + w_pur
    if total == 0:
        return 0.0
    w_fp, w_p2r, w_pur = w_fp/total, w_p2r/total, w_pur/total

    weighted_dca = 0.0
    for dataset, n in DATASET_SIZES.items():
        dataset_proteins = master[master['dataset'] == dataset]['protein_id'].unique()
        successes = 0
        for pid in dataset_proteins:
            pdata = master[master['protein_id'] == pid]
            successes += wrrf_score(pdata, w_fp, w_p2r, w_pur)
        dataset_dca = successes / n
        # Size-weighted contribution
        weighted_dca += (n / TOTAL_N) * dataset_dca

    return weighted_dca  # Optuna maximizes this

study = optuna.create_study(
    direction='maximize',
    storage='sqlite:///optuna/global_optimization.db',
    study_name='salidock_global_wrrf'
)
study.optimize(objective, n_trials=5000, n_jobs=4)

optimal = study.best_params
print(f"Optimal weights: fpocket={optimal['w_fp']:.4f}, "
      f"p2rank={optimal['w_p2r']:.4f}, purnet={optimal['w_pur']:.4f}")
```

### 3.2 What to Record

After optimization completes, record and save:
- Best weights `w*` as `optuna/optimal_weights.json`
- Optuna importance plot (which weight had most influence on objective)
- Per-dataset DCA at `w*` (this is your Table 3 equivalent)
- Full weight-space visualization for supplementary material

---

## Phase 4 — Contribution Ablation and Pruning

```python
# ablation.py
import json

with open('optuna/optimal_weights.json') as f:
    w_opt = json.load(f)  # {'w_fp': x, 'w_p2r': y, 'w_pur': z}

def evaluate_global(w_fp, w_p2r, w_pur):
    """Evaluate size-weighted global DCA at given weights using frozen master."""
    # Same logic as objective() above but deterministic
    pass

baseline_dca = evaluate_global(**w_opt)

ablation_results = {}
for tool, zero_key in [('fpocket','w_fp'), ('p2rank','w_p2r'), ('purnet','w_pur')]:
    # Zero out this tool and renormalize
    ablated = {k: v for k, v in w_opt.items()}
    ablated[zero_key] = 0.0
    total = sum(ablated.values())
    ablated = {k: v/total for k, v in ablated.items()}

    ablated_dca = evaluate_global(**ablated)
    delta = baseline_dca - ablated_dca

    ablation_results[tool] = {
        'delta_DCA': delta,
        'pruned': delta < 0.01  # < 1% drop → prune
    }
    print(f"{tool}: ΔDCA = {delta:.4f} ({'PRUNE' if delta < 0.01 else 'RETAIN'})")

with open('optuna/ablation_results.json', 'w') as f:
    json.dump(ablation_results, f, indent=2)
```

### 4.1 Decision Rules

| Ablation Result | Action |
|---|---|
| All three tools: ΔDCA ≥ 1% | Keep flat 3-tool wRRF with re-optimized weights |
| fpocket only: ΔDCA < 1% | Cascade design — P2Rank + PUResNet primary, fpocket fallback |
| P2Rank or PUResNet: ΔDCA < 1% | Unexpected — investigate dataset-specific behavior before deciding |

### 4.2 If Cascade Design Is Confirmed (Expected Outcome)

The cascade fallback trigger uses **spatial consensus disagreement**:

```python
def cascade_predict(protein, w_p2r, w_pur, k=60, cluster_radius=6.0):
    """
    Primary: P2Rank + PUResNet wRRF
    Fallback: fpocket when primary tools disagree spatially
    """
    p2rank_top1 = get_top1(protein, 'p2rank')
    purnet_top1  = get_top1(protein, 'purnet')

    spatial_distance = euclidean(p2rank_top1.coords, purnet_top1.coords)

    if spatial_distance <= cluster_radius:
        # Tools agree — use two-tool wRRF consensus
        return wrrf_consensus(protein, w_p2r, w_pur)
    else:
        # Tools disagree — fallback to fpocket
        return get_top1(protein, 'fpocket')
```

**Record fallback rate per dataset** — this is a required table in the paper.

---

## Phase 5 — Statistical Validation
*Runs on frozen per-protein binary success vectors. All tests cost minutes.*

### 5.1 McNemar's Test (Pairwise)

For every pairwise comparison (Vector A vs B, consensus vs best individual, etc.):

```python
from statsmodels.stats.contingency_tables import mcnemar
import numpy as np

def mcnemar_comparison(method_a_successes, method_b_successes, protein_ids):
    """
    method_a_successes, method_b_successes: binary arrays (1=success, 0=fail)
    per protein, same order
    """
    # Contingency table
    both_right    = sum((a==1 and b==1) for a,b in zip(method_a_successes, method_b_successes))
    a_right_b_wrong = sum((a==1 and b==0) for a,b in zip(method_a_successes, method_b_successes))
    a_wrong_b_right = sum((a==0 and b==1) for a,b in zip(method_a_successes, method_b_successes))
    both_wrong    = sum((a==0 and b==0) for a,b in zip(method_a_successes, method_b_successes))

    table = [[both_right, a_right_b_wrong],
             [a_wrong_b_right, both_wrong]]

    result = mcnemar(table, exact=True)  # exact=True for N<25 discordant pairs
    return result.pvalue

# Run for every dataset and every comparison pair
```

**Required comparisons per dataset:**
- Consensus (final) vs P2Rank standalone
- Consensus (final) vs PUResNet standalone
- Consensus (final) vs fpocket standalone
- Vector A vs Vector B (if applicable)
- Cascade design vs flat wRRF (if cascade adopted)

### 5.2 95% Confidence Intervals on DCA Success Rates

```python
from scipy.stats import binom

def dca_confidence_interval(n_success, n_total, confidence=0.95):
    """Wilson score interval — more reliable than normal approximation for proportions"""
    from statsmodels.stats.proportion import proportion_confint
    lo, hi = proportion_confint(n_success, n_total, alpha=1-confidence, method='wilson')
    return lo, hi
```

Every reported DCA value in every table must include ± CI.

### 5.3 DCA Sensitivity Curve

```python
import matplotlib.pyplot as plt
import numpy as np

# For each method, compute DCA success rate at thresholds 0.5Å to 8.0Å
thresholds = np.arange(0.5, 8.1, 0.5)
methods = ['fpocket', 'p2rank', 'purnet', 'consensus_A', 'consensus_B']

for dataset in DATASETS:
    fig, ax = plt.subplots(figsize=(8, 5))
    for method in methods:
        rates = [compute_dca_at_threshold(dataset, method, t) for t in thresholds]
        ax.plot(thresholds, rates, label=method)
    ax.axvline(x=4.0, color='gray', linestyle='--', alpha=0.5, label='Standard 4Å cutoff')
    ax.set_xlabel('DCA Threshold (Å)')
    ax.set_ylabel('Success Rate (%)')
    ax.set_title(f'DCA Sensitivity — {dataset}')
    ax.legend()
    plt.savefig(f'figures/dca_sensitivity_{dataset}.png', dpi=300)
```

---

## Phase 6 — LIGYSIS-2024 Blind Validation
*This dataset is opened only after Phase 5 is fully complete.*

**Rule:** The weight vector finalized in Phase 4 must not change after this point.
LIGYSIS-2024 is a true held-out test set. Its results are reported as-is.

```bash
# Run all three tools on LIGYSIS-2024 (50-structure human target subset)
# Same pipeline as Phase 1 — store per-protein raw distances
# Apply final weight vector → compute DCA@top-1 and DCA@top-5
# Apply McNemar's test vs best individual tool on this subset
```

**This is the headline generalizability result of the paper.**

---

## Phase 7 — Supplementary Weight Analysis

After all results are finalized, run per-dataset optimal weights (Optuna on each
dataset individually) and compare to global weight vector:

```python
# For each dataset independently:
study_per_ds = optuna.create_study(direction='maximize')
study_per_ds.optimize(lambda t: objective_single_dataset(t, dataset), n_trials=2000)
per_ds_optimal[dataset] = study_per_ds.best_params

# Compute deviation from global optimal:
for dataset in DATASETS:
    for weight in ['w_fp', 'w_p2r', 'w_pur']:
        deviation = abs(global_optimal[weight] - per_ds_optimal[dataset][weight])
        print(f"{dataset} | {weight}: deviation = {deviation:.4f}")
```

If all deviations are < 0.05 (5% weight difference), this is strong evidence that
the global vector is genuinely robust — not a compromise. Include as Supplementary Table.

---

## Paper Table Structure (Post-Implementation)

### Main Text Tables

| Table | Content |
|---|---|
| Table 1 | Individual tool DCA@top-1 and DCA@top-5 across all datasets (with 95% CI) |
| Table 2 | Global Optuna optimal weights + per-dataset optimal weights |
| Table 3 | Consensus DCA@top-1 comparison: final vector vs baselines (with p-values) |
| Table 4 | Ablation results: ΔDCA when each tool is removed |
| Table 5 | Cascade fallback rate and fallback success rate per dataset |
| Table 6 | LIGYSIS-2024 blind validation results |

### Supplementary Tables

| Table | Content |
|---|---|
| S1 | DCA@top-1 at 3.0Å and 5.0Å thresholds |
| S2 | Full per-dataset optimal weight vectors vs global vector |
| S3 | McNemar's test p-values for all pairwise comparisons |
| S4 | CPU vs GPU PUResNet parity check on CHEN11 |

### Main Text Figures

| Figure | Content |
|---|---|
| Fig 1 | Pipeline architecture diagram (wRRF cascade) |
| Fig 2 | Bar chart: individual vs consensus DCA@top-1 per dataset |
| Fig 3 | DCA sensitivity curves (0–8Å) for all methods |
| Fig 4 | Optuna weight space heatmap (w_p2r vs w_pur) |
| Fig 5 | LIGYSIS-2024 blind validation result |

---

## Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| PUResNet CPU-mode produces different coordinates than GPU | Medium | CHEN11 parity check in Phase 1.4 |
| fpocket ablation shows ΔDCA < 1% (cascade justified but not clear improvement) | Medium | Frame as robustness guarantee — document fallback rate |
| HOLO4K runtime too long for CPU PUResNet | High | Run on server/cluster; estimate 40+ hours on CPU — plan accordingly |
| CHEN11 shows Vector B >> Vector A (anomaly from current report) | Medium | Per-protein analysis to identify structural cause; add to limitations |
| Optuna overfits to size-weighted objective | Low | LIGYSIS-2024 blind test directly tests this |

---

## Completion Checklist

- [ ] Phase 0: Directory structure created, schema confirmed
- [ ] Phase 1: All 7 datasets collected, per-protein TSVs verified
- [ ] Phase 1.4: CPU/GPU parity check completed on CHEN11
- [ ] Phase 2: Master distance matrix built and frozen
- [ ] Phase 2: DCA labels computed at 3.0, 4.0, 5.0 Å
- [ ] Phase 3: Global size-weighted Optuna complete (≥5000 trials)
- [ ] Phase 4: Ablation complete, architecture decision made
- [ ] Phase 4: Final weight vector saved and locked
- [ ] Phase 5: McNemar's tests complete for all comparisons
- [ ] Phase 5: 95% CI computed for all DCA values
- [ ] Phase 5: DCA sensitivity curves generated
- [ ] Phase 6: LIGYSIS-2024 blind validation run and recorded
- [ ] Phase 7: Per-dataset weight deviation analysis complete
- [ ] All figures at 300 DPI, colorblind-safe palette (Wong 2011)
- [ ] All tables include 95% CI and p-values
- [ ] Methods section updated to reflect final architecture
