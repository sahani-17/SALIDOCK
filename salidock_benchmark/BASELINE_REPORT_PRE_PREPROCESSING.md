# SaliDock Baseline Benchmark Report (Pre-Preprocessing)
**Generated:** June 25, 2026  
**Purpose:** Historical reference — results from running tools on **RAW PDB files** (no preprocessing applied).  
**Status:** These results are superseded by the preprocessing benchmark. New weights will be re-optimised after the preprocessing sweep completes.

---

> [!IMPORTANT]
> This report documents the **pre-preprocessing baseline**. All numbers below were produced by running fpocket, P2Rank, and PUResNet directly on raw PDB files — with HETATM ligands, water molecules, and hydrogen atoms still present. The preprocessing benchmark will show how much each metric improves after applying the 5-step cleaning pipeline.

---

## Optimal Weights (Pre-Preprocessing, Bayesian-Optimised)

These weights were produced by `manage_benchmark.py` Phase 3 (Optuna, 500 trials) on the raw-PDB predictions:

| Tool | Weight |
|---|---|
| fpocket | **0.0947** |
| P2Rank | **0.4054** |
| PUResNet | **0.4999** |

**Source file (now archived):** `salidock_benchmark/optuna/optimal_weights.json`

---

## Dataset Coverage

| Dataset | Proteins Evaluated | fpocket rows | P2Rank rows | PUResNet rows |
|---|---|---|---|---|
| CHEN11 | ~246 | 1,234 | 412 | 254 |
| CASF-2016 | ~280 | 1,404 | 1,168 | 478 |
| COACH420 | ~414 | 2,074 | 1,220 | 440 |
| PDBbind-v2020 | ~49 | 248 | 180 | 81 |
| HOLO4K | ~3,982 | 19,910 | 15,709 | 6,515 |
| LIGYSIS-2024 | ~3,183 | 15,918 | 12,894 | 5,417 |

**Note:** PUResNet row counts are lower than fpocket/P2Rank because some structures failed Docker execution or exceeded the memory limit for the CPU image.

---

## DCA Accuracy (Raw PDB — Best Individual Rank across tools)

> DCA success = predicted pocket center within **4.0 Å** of true ligand centroid.

| Dataset | N | DCA@top-1 | DCA@top-5 |
|---|---|---|---|
| CHEN11 | 251 | **88.45%** | **93.23%** |
| CASF-2016 | 281 | **87.54%** | **91.10%** |
| PDBbind-v2020 | 50 | **82.00%** | **86.00%** |
| HOLO4K | 4,008 | **85.88%** | **90.34%** |
| COACH420 | 419 | **72.55%** | **76.37%** |

---

## Ablation Analysis (Raw PDB)

Tool contribution when removed from the 3-tool consensus:

| Tool | ΔDCA on removal | Decision |
|---|---|---|
| fpocket | **−0.08 pp** | PRUNE CANDIDATE (< 1 pp contribution) |
| P2Rank | **+1.28 pp** | RETAIN |
| PUResNet | **+16.01 pp** | RETAIN (dominant contributor) |

> [!WARNING]
> fpocket was identified as a **prune candidate** on raw PDB. This is expected — fpocket's alpha-sphere algorithm is most severely impacted by hydrogen atoms filling pocket space. The preprocessing benchmark is specifically designed to test whether fpocket's contribution recovers after H-atom removal. If it does, the cascade architecture (fpocket as fallback) is validated. If it doesn't, the cascade weight may remain near zero.

---

## Key Observations (Pre-Preprocessing)

1. **PUResNet dominance**: 16 percentage points of DCA@top-1 are attributable to PUResNet alone on raw PDB. Its volumetric CNN approach is less sensitive to hydrogens than fpocket's alpha-sphere method.

2. **fpocket near-zero contribution**: On raw PDB, fpocket adds essentially nothing to the consensus (Δ = −0.08 pp, meaning it very slightly *hurts* by adding noise). The 15% silent failure rate documented in the reference plan (caused by H-atoms suppressing alpha-sphere generation) is the root cause.

3. **COACH420 is the hardest dataset**: DCA@top-1 of 72.55% vs 85–88% on other datasets, likely due to more diverse pocket geometries.

4. **LIGYSIS excluded from DCA table**: LIGYSIS uses rotation/translation alignment for evaluation — a separate aligned evaluation script is required.

---

## What Changes After Preprocessing

The new `run_unified_preprocessing_benchmark.py` will:
1. Apply the 5-step preprocessing before any tool runs
2. Measure DCA improvements per tool and per dataset
3. Re-run Optuna to get new weights reflecting the cleaned-protein performance
4. Determine whether fpocket's weight increases significantly (validating the cascade design)

The delta (preprocessed − raw) for each cell in the table above will be the key output.

---

*SaliDock Baseline Benchmark — Historical Reference Document*  
*Antigravity AI / SaliDock Core Team — June 25, 2026*
