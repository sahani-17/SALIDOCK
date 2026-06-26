# SaliDock — Full Project Context Restore File
**Created:** 2026-06-26  
**Purpose:** Share this file with the AI after a laptop reset to resume the project from exactly where we left off.

> **HOW TO USE:** After laptop reset, open this file in your editor. Paste it into a new chat with the AI (Antigravity / Claude / Gemini) and say "Read this file and continue the SaliDock project."

---

## 1. What Is SaliDock?

SaliDock is a **protein cavity detection + molecular docking web application** built by you (Sahan). It runs a consensus ensemble of three cavity detection tools (fpocket, P2Rank, PUResNet) to predict binding sites on a protein, then uses those predicted cavities to guide AutoDock Vina for molecular docking.

**Stack:**
- **Backend:** Python (Flask), running in WSL2 (Ubuntu on Windows via `/mnt/d/SALIDOCK2`)
- **Frontend:** React (Vite) in `d:\SALIDOCK2\docking\`
- **Tools:** fpocket (installed in Ubuntu), P2Rank 2.4.2 (local binary), PUResNet (Docker CPU)
- **Conda env:** `docking_env` (Ubuntu WSL2)
- **Project root:** `d:\SALIDOCK2` (Windows) = `/mnt/d/SALIDOCK2` (Ubuntu WSL2)

---

## 2. Core Architecture — Finalized Decisions (DO NOT CHANGE THESE)

| Decision | Choice |
|---|---|
| Processing unit | Whole protein assembly (not per-chain) |
| Preprocessing | Applied BEFORE every tool — always |
| Primary tools | P2Rank + PUResNet |
| Fallback tool | fpocket (cascade only, not constant) |
| Consensus method | Weighted Reciprocal Rank Fusion (wRRF) |
| Clustering radius | 6.0 Å |
| wRRF constant k | 60 |
| Current weights | fpocket=0.0947, p2rank=0.4054, puresnet=0.4999 |

### Cascade wRRF Logic
```
1. Run P2Rank and PUResNet → get top-1 predictions
2. Measure distance between their top-1 centers
   ≤ 6.0 Å → agreement → run wRRF with P2Rank + PUResNet only
   > 6.0 Å → disagreement → include fpocket → run wRRF on all 3
3. Pool top-5 predictions from active tools
4. Greedy spatial clustering (6 Å radius, dynamic centroid update)
5. Score each cluster: S = Σ w_T × 1/(k + rank_T)
6. Return top-1 and top-5 clusters
```

---

## 3. Key File Locations

```
d:\SALIDOCK2\
├── run_unified_preprocessing_benchmark.py   ← MAIN BENCHMARK SCRIPT (see Section 5)
├── salidock\
│   ├── cavity\
│   │   ├── runners.py       ← run_fpocket(), run_p2rank(), run_puresnet()
│   │   ├── pipeline.py      ← CavityDetectionPipeline.detect_sync()
│   │   └── preprocessing.py ← preprocess_pdb() production version
│   └── ...
├── backend\
│   ├── app.py               ← Flask API (POST /api/cavities/detect/{session_id} at L1623)
│   ├── p2rank_2.4.2\        ← P2Rank binary (prank.sh on Linux)
│   └── p2rank-datasets\     ← Benchmark datasets
│       ├── chen11.ds
│       ├── coach420.ds
│       ├── joined.ds
│       └── holo4k.ds
├── docking\                 ← React frontend (Vite)
│   └── src\
│       ├── pages\Results.jsx
│       ├── components\MolecularViewer.jsx  ← Mol* viewer (focusOnPoint implemented)
│       └── ...
├── salidock_benchmark\
│   ├── preproc_benchmark\   ← Benchmark output (created when Phase 1 runs)
│   └── raw_results\         ← Older benchmark results from LIGYSIS dataset
```

---

## 4. What Has Been Implemented (Already Done ✅)

### Frontend
- [x] Full docking workflow UI (React + Vite)
- [x] Mol* molecular viewer with `focusOnPoint(x, y, z, radius)` — clicking a cavity in the results list now flies the camera to that binding site
- [x] Cavity selection passes `cavity_ids` to docking correctly
- [x] `POST /api/cavities/detect/{session_id}` endpoint is fully wired end-to-end

### Backend
- [x] `preprocess_pdb()` — strips HETATM / waters / H / altloc
- [x] `run_fpocket()` — runs fpocket, parses both v3 (center lines) and v4+ (alpha-sphere vertex centroid) output formats
- [x] `run_p2rank()` — runs P2Rank, parses `*_predictions.csv`
- [x] `run_puresnet()` — runs PUResNet via Docker CPU (monkey-patches torch.load for CPU-only machines)
- [x] `CavityDetectionPipeline.detect_sync()` — full cascade wRRF pipeline
- [x] API endpoint verified correct

### Benchmarking
- [x] Wrote `run_unified_preprocessing_benchmark.py` (see Section 5)
- [x] Older LIGYSIS-2024 benchmark done — baseline: consensus 42.85% top-1 DCA@4Å, 53.34% top-5

---

## 5. The Main Benchmark Script — MOST IMPORTANT

**File:** `d:\SALIDOCK2\run_unified_preprocessing_benchmark.py`

This is a 6-phase pipeline to benchmark all cavity detection tools across 6 standard datasets.

### Datasets (in order of size)
| Dataset | .ds file | Size |
|---|---|---|
| CHEN11 | chen11.ds | 251 proteins |
| COACH420 | coach420.ds | 420 proteins |
| CASF2016 | (hardcoded list) | 285 proteins |
| JOINED560 | joined.ds | ~560 proteins |
| PDBbind2020 | (hardcoded list) | 50 proteins |
| HOLO4K | holo4k.ds | ~4000 proteins |

### Phase Breakdown (CRITICAL — DO NOT MIX PHASES)

| Phase | Command | What It Does |
|---|---|---|
| **1** | `--phase 1` | **PREPROCESSING ONLY.** Download PDB → extract true ligand centroids from raw RCSB PDB → preprocess (strip HETATM/water/H/altloc) → save `*_prep.pdb`. **NO tools run here.** |
| **2** | `--phase 2` | **TOOL SWEEP.** Run fpocket + P2Rank + PUResNet on every `*_prep.pdb` from Phase 1. Write TSVs. |
| **3** | `--phase 3` | Compile master TSV + DCA label files at 3Å/4Å/5Å thresholds |
| **4** | `--phase 4` | Optuna Bayesian weight optimisation (500 trials) |
| **5** | `--phase 5` | Ablation / tool contribution analysis |
| **6** | `--phase 6` | Sensitivity curves (requires matplotlib) |

### How to Run (Ubuntu WSL2 terminal)
```bash
# Step 0: Clear any partial results to start fresh
rm -rf /mnt/d/SALIDOCK2/salidock_benchmark/preproc_benchmark/

# Step 1: Activate conda environment
conda activate docking_env

# Step 2: Run Phase 1 — preprocessing only (live in foreground)
cd /mnt/d/SALIDOCK2
python run_unified_preprocessing_benchmark.py --phase 1

# Step 3: After Phase 1 finishes, run Phase 2 (tool sweep)
python run_unified_preprocessing_benchmark.py --phase 2

# Can also run single dataset for testing:
python run_unified_preprocessing_benchmark.py --phase 1 --dataset CHEN11
```

### Progress Bar Meaning
```
[████████████░░░░░░░░░░░░░]  47.6%  120/252  ETA:0:18:45   RUN   1A30   (0:00:03)
```
- `RUN` = actively processing this protein right now
- `OK` = preprocessed successfully, ligand centroid found
- `NOLG` = preprocessed but no ligand in raw PDB (apo) — still preprocessed, dist_to_true = -1
- `ERR` = preprocessing failed (see below)
- `NOPDB` = could not download PDB from RCSB
- `SKIP` = already done (checkpoint loaded on resume)

### Ctrl+C Behavior
Pressing **Ctrl+C** saves checkpoint immediately and exits cleanly. Running the same command again resumes exactly where it stopped. Every protein is checkpointed individually (not every 10).

### Output Directory Structure
```
salidock_benchmark/preproc_benchmark/
├── phase1_checkpoint.json    ← {DATASET/pdbid: True/"nopdb"/"err"/"empty"}
├── phase2_checkpoint.json    ← same for tool sweep
├── true_centroids.json       ← {pdbid: [[x,y,z], ...]}
├── preprocessed_pdb/         ← {pdbid}_prep.pdb  (Phase 1 output)
├── pdb_cache/                ← downloaded tool-input PDBs
├── raw_pdb_cache/            ← downloaded raw RCSB PDBs (for centroid extraction)
├── raw_results/
│   ├── fpocket/{DATASET}.tsv
│   ├── p2rank/{DATASET}.tsv
│   └── purnet/{DATASET}.tsv
├── master_distance_matrix.tsv
├── dca_labels/
│   ├── threshold_3A.tsv
│   ├── threshold_4A.tsv
│   └── threshold_5A.tsv
└── optuna_results/best_weights.json
```

---

## 6. Critical Bug Fixes Already Applied

### Bug 1 — p2rank dataset PDBs have no HETATM (protein-only)
**Problem:** The p2rank `.ds` dataset files have all HETATM stripped. Using them as the source for centroid extraction always returned 0 centroids, silently skipping 75% of proteins.
**Fix:** Now uses **two separate PDB sources**:
- `raw_pdb_cache/` → always downloads raw RCSB PDB (with HETATM) → used only for centroid extraction
- `pdb_cache/` → local p2rank file preferred → used as tool input

### Bug 2 — Hydrogen detection too aggressive (ERR proteins)
**Problem:** Old code used `name.startswith(('HD','HE','HG','HH','HZ'))` which stripped real heavy atoms like delta carbons (HD1, HD2), epsilon nitrogens, and DNA/RNA atom names. This caused some proteins to end up empty after preprocessing (the "empty PDB after stripping" error you saw).
**Fix:** Hydrogen detection is now **element-column-first**:
```python
if elem == 'H':
    is_h = True          # element column is definitive — always strip
elif elem in ('', 'D'):  # no element column or deuterium
    is_h = (name == 'H' or (len(name)>=2 and name[0].isdigit() and name[1]=='H'))
else:
    is_h = False         # any other element → keep it
```
This correctly handles proteins AND DNA/RNA AND NMR structures.

### Bug 3 — Phase 1 was running cavity detection tools (wrong!)
**Problem:** Old Phase 1 ran fpocket/P2Rank/PUResNet inline during preprocessing. This mixed concerns, caused "no atoms" errors when preprocessed files had issues, and made the phase impossible to restart cleanly.
**Fix:** Phase 1 is now **preprocessing only**. Tools run in Phase 2 as a separate step.

---

## 7. What To Do Next (Pending Tasks)

### Benchmark (main priority)
1. **Clear all results** and restart from Phase 1:
   ```bash
   rm -rf /mnt/d/SALIDOCK2/salidock_benchmark/preproc_benchmark/
   python run_unified_preprocessing_benchmark.py --phase 1
   ```
2. After Phase 1: run Phase 2 (tool sweep)
3. After Phase 2: run Phase 3 (compile), Phase 4 (Optuna optimise)
4. Compare new weights vs current: `fpocket=0.0947, p2rank=0.4054, puresnet=0.4999`
5. Update `backend/config/weights.json` with new optimised weights

### Backend Implementation (waiting for new weights)
- **Phase A:** Implement fpocket conditional inclusion in cascade wRRF (currently always included)
- **Phase D:** Add structured per-run log entries
- **Phase E:** Write cavity output to persistent store
- **Phase F:** Create runtime-readable `weights.json`

---

## 8. Environment Setup (for new machine / after reset)

### Ubuntu WSL2 Setup
```bash
# 1. Install conda env dependencies
conda activate docking_env

# 2. Install fpocket (Ubuntu)
sudo apt-get install fpocket

# 3. P2Rank is already in the repo at:
# /mnt/d/SALIDOCK2/backend/p2rank_2.4.2/prank.sh
chmod +x /mnt/d/SALIDOCK2/backend/p2rank_2.4.2/prank.sh

# 4. PUResNet via Docker (optional — skip if no Docker)
docker pull jivankandel/puresnet:latest

# 5. Install Python deps
cd /mnt/d/SALIDOCK2
pip install optuna numpy
pip install -e .  # installs salidock package in dev mode
```

### Frontend Setup (Windows)
```bash
cd d:\SALIDOCK2\docking
npm install
npm run dev   # starts at http://localhost:5173
```

### Backend Setup (Ubuntu WSL2)
```bash
conda activate docking_env
cd /mnt/d/SALIDOCK2
python backend/app.py  # starts Flask at http://localhost:5000
```

---

## 9. LIGYSIS Baseline Results (Reference — Do Not Change)

The older benchmark on LIGYSIS-2024 (real experimental coordinates, not predicted):

| Method | DCA@4Å Top-1 | DCA@4Å Top-5 |
|---|---|---|
| fpocket only | ~30% | ~48% |
| P2Rank only | ~38% | ~51% |
| PUResNet only | ~35% | ~49% |
| **SaliDock consensus (wRRF)** | **42.85%** | **53.34%** |

These weights came from an earlier Optuna run. The new benchmark (on standard CHEN11/COACH420/CASF2016 etc.) will produce updated, more rigorous weights.

---

## 10. AI Conversation Summary

Everything in this document was built together with the Antigravity AI assistant (powered by Claude / Gemini). The AI wrote all the scripts in this project. To continue working, just:

1. Share this file with the AI
2. Say: *"I've reset my laptop. The project is at D:\SALIDOCK2. Continue from Section 7 — run the benchmark Phase 1."*
3. The AI will know the full context and continue exactly where we left off.

**The D: drive data should be intact after reset (C: drive only is reformatted). Verify:**
```bash
ls /mnt/d/SALIDOCK2/
# Should show: salidock/ backend/ docking/ run_unified_preprocessing_benchmark.py etc.
```

---

*SaliDock Context Restore Document — Generated 2026-06-26*  
*Keep this file on the D: drive so it survives the C: drive reset.*
