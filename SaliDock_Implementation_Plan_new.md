# SaliDock — Full Implementation Plan
**Project:** SaliDock Consensus Cavity Detection Engine  
**Team:** Antigravity AI / SaliDock Core Development Team  
**Date:** June 25, 2026  
**Version:** 2.0 (Post-Architecture Review)

---

## Overview of Architectural Decisions Locked In

Before the implementation steps, these are the finalized decisions this plan is built on:

| Decision | Choice |
|---|---|
| Processing unit | Whole protein assembly (not per-chain) |
| Preprocessing | Applied before tool execution (HETATM, water, H removal) |
| Primary consensus tools | P2Rank + PUResNet |
| Fallback tool | fpocket (cascade, not constant weight) |
| Consensus method | Weighted Reciprocal Rank Fusion (wRRF) |
| Clustering radius | 6.0 Å |
| wRRF constant k | 60 |
| Future upgrade path | Protein-type adaptive weighting (Phase 5) |

---

## Phase 0 — Infrastructure Setup

### Step 0.1 — Directory Structure

Establish the following directory layout before any tool is run:

```
salidock/
├── input/
│   └── raw/                    # User-uploaded raw PDB files
├── preprocessing/
│   └── clean/                  # Preprocessed whole-protein PDB files
├── tool_outputs/
│   ├── fpocket/                # fpocket raw output per protein
│   ├── p2rank/                 # P2Rank raw output per protein
│   └── puresnet/               # PUResNet raw output per protein
├── parsed_results/
│   └── {protein_id}.json       # Structured top-5 predictions per tool
├── consensus/
│   └── {protein_id}_consensus.json   # Final wRRF consensus output
├── logs/
│   ├── preprocessing.log
│   ├── tool_run.log
│   └── consensus.log
└── config/
    └── weights.json            # Active weight vector
```

### Step 0.2 — Weight Configuration File

`config/weights.json` stores the active wRRF weights. Start with the globally optimized vector (to be updated after Optuna in Phase 3):

```json
{
  "version": "global_v1",
  "weights": {
    "p2rank": 0.70,
    "puresnet": 0.20,
    "fpocket": 0.10
  },
  "cascade_mode": true,
  "cascade_agreement_threshold_angstrom": 6.0,
  "rrf_k": 60,
  "clustering_radius_angstrom": 6.0
}
```

### Step 0.3 — Per-Protein Result Schema

Every parsed result file must store top-5 predictions per tool (not just top-1) to enable top-5 recall metrics and cascade logic:

```json
{
  "protein_id": "1ABC",
  "preprocessing_applied": true,
  "tool_results": {
    "fpocket": {
      "status": "success",
      "silent_failure": false,
      "predictions": [
        {
          "rank": 1,
          "center_x": 12.3,
          "center_y": 45.6,
          "center_z": 7.8,
          "score": 0.91
        }
      ]
    },
    "p2rank": { "status": "success", "predictions": [] },
    "puresnet": { "status": "success", "predictions": [] }
  },
  "consensus": {
    "method": "cascade_wrrf",
    "cascade_triggered": false,
    "top1_center": [12.3, 45.6, 7.8],
    "wrrf_score": 0.87
  }
}
```

---

## Phase 1 — Preprocessing Pipeline

This runs before any cavity detection tool. Applied to every input PDB regardless of source.

### Step 1.1 — Input Validation

Before preprocessing, validate the uploaded PDB:

- File is valid PDB format (has ATOM/HETATM records)
- At least one protein chain is present
- File size is within accepted limits (flag structures > 100,000 atoms for the PUResNet memory check)
- Log and reject corrupted or empty files

### Step 1.2 — Standard Minimal Preprocessing

Apply exactly these five operations in order using PDBFixer or BioPython. Do not apply energy minimization or missing residue filling — these change experimental coordinates.

**Operation 1 — Remove HETATM records (ligands, cofactors)**
The cavity detection tools must not see the ligand occupying the true binding site. Remove all HETATM records except where they are part of a covalently modified residue.

**Operation 2 — Remove water molecules**
Remove all HOH, WAT records. Crystallographic waters can occlude alpha-sphere detection in fpocket and introduce false surface features in P2Rank.

**Operation 3 — Remove hydrogen atoms**
Strip all H/HD/HE atom records. This is the most impactful step for fpocket — hydrogen atoms fill interior cavity space and suppress alpha-sphere generation, which was the primary cause of the 11.32% anomaly and the 15% silent failure rate in the benchmark.

**Operation 4 — Keep only first alternate conformation**
For residues with ALTLOC records, retain only the A conformer. Multiple conformers create overlapping atom positions that corrupt pocket geometry.

**Operation 5 — Keep all chains (do not split)**
Retain the full protein assembly. Do not split chains. Interface pockets between chains are biologically valid binding sites and must be visible to all three tools.

### Step 1.3 — Preprocessing Log Entry

After each structure is preprocessed, write to `logs/preprocessing.log`:

```
[2026-06-25 10:23:01] 1ABC — Preprocessing complete
  Atoms before: 4821 | Atoms after: 3104
  HETATM removed: 89 | Waters removed: 312 | H atoms removed: 1316
  Chains retained: A, B
  Output: preprocessing/clean/1ABC_clean.pdb
```

---

## Phase 2 — Tool Execution

All three tools run on the preprocessed whole-protein PDB independently. No tool should be aware of another's output at this stage.

### Step 2.1 — fpocket Execution

**Command:**
```bash
fpocket -f preprocessing/clean/{protein_id}_clean.pdb
```

**Default parameters kept as-is:**
- Minimum alpha-sphere radius: 3.0 Å
- Maximum alpha-sphere radius: 6.0 Å
- No custom flags — baseline neutrality

**Pocket center extraction (version-adaptive):**
- fpocket v3: Read `x center`, `y center`, `z center` from `*_info.txt`
- fpocket v4+: Compute geometric centroid from alpha-sphere vertices in `pocket{rank}_vert.pdb`; fallback to `pocket{rank}_atm.pdb` if vert file is missing

**Silent failure handling:**
If fpocket returns zero pockets, log as silent failure in the result schema (`"silent_failure": true`). Do not crash the pipeline — proceed to P2Rank and PUResNet. The cascade design handles this: fpocket is the fallback, not the primary.

**Store:** Top-5 pocket centers + scores in `parsed_results/{protein_id}.json`

### Step 2.2 — P2Rank Execution

**Command:**
```bash
prank predict -f preprocessing/clean/{protein_id}_clean.pdb -o tool_outputs/p2rank/{protein_id}/
```

**Parse output:**
Read the `.csv` output file. Extract top-5 predicted pocket centers (columns: `center_x`, `center_y`, `center_z`, `score`).

**Store:** Top-5 pocket centers + scores in `parsed_results/{protein_id}.json`

### Step 2.3 — PUResNet Execution

**Command:**
Run via CPU Docker container as configured in the current setup.

```bash
docker run --rm \
  -v $(pwd)/preprocessing/clean:/input \
  -v $(pwd)/tool_outputs/puresnet:/output \
  puresnet:cpu \
  --input /input/{protein_id}_clean.pdb \
  --output /output/{protein_id}/
```

**CPU/GPU parity:** Confirmed identical outputs (0.0 Å coordinate shift, 0.0% DCA difference). No GPU requirement.

**Memory check for large structures:**
For proteins flagged in Step 1.1 (> 100,000 atoms), monitor Docker memory usage. If PUResNet OOM-kills on a structure, log as failure and proceed — cascade will fall back to P2Rank result alone if PUResNet fails.

**Store:** Top-5 pocket centers + scores in `parsed_results/{protein_id}.json`

---

## Phase 3 — Cascade wRRF Consensus

This is the core of SaliDock's cavity detection logic.

### Step 3.1 — Load Predictions

Read all three tools' top-5 predictions from `parsed_results/{protein_id}.json`.

Check tool availability:
- If a tool had a silent failure or execution error → its predictions array is empty
- The consensus logic handles missing tools gracefully (contribution = 0)

### Step 3.2 — Cascade Decision

Before running wRRF across all three tools, apply the cascade check:

```
1. Take P2Rank top-1 predicted center
2. Take PUResNet top-1 predicted center
3. Compute Euclidean distance between them

If distance <= 6.0 Å:
    → Spatial agreement exists
    → Run wRRF using P2Rank + PUResNet only
    → fpocket NOT used in this prediction
    → Log: cascade_triggered = false

If distance > 6.0 Å:
    → No spatial agreement between primary tools
    → Include fpocket as geometric fallback
    → Run wRRF using all three tools
    → Log: cascade_triggered = true
```

**Scientific justification:** fpocket's alpha-sphere partitioning guarantees at least one prediction on any sterically valid protein structure. It serves as a recovery mechanism for atypical pocket topologies where both surface-probability and volumetric CNN methods disagree — not as a constant contributor.

### Step 3.3 — Spatial Clustering

Pool all pocket center predictions from the active tools (top-5 each). Apply greedy spatial clustering:

```
For each predicted center (sorted by tool score, descending):
    If no existing cluster center is within 6.0 Å:
        Create a new cluster with this center
    Else:
        Add to the nearest existing cluster
        Update cluster center = mean of all member centers (dynamic update)
```

This produces a set of merged candidate pocket clusters.

### Step 3.4 — wRRF Scoring

For each candidate cluster, compute the wRRF score:

$$S(cluster) = \sum_{T \in active\_tools} w_T \cdot \frac{1}{k + R_T(cluster)}$$

Where:
- $w_T$ = weight for tool T (from `config/weights.json`)
- $k$ = 60 (RRF constant)
- $R_T(cluster)$ = rank of this cluster in tool T's ranked list
- If tool T has no prediction within 6.0 Å of this cluster → contribution = 0 (not a small value — exactly 0)

### Step 3.5 — Final Prediction Output

Sort clusters by wRRF score (descending). Return:
- **Top-1:** Highest scoring cluster center = primary cavity prediction
- **Top-5:** Top 5 cluster centers = full candidate list for blind docking

Write final output to `consensus/{protein_id}_consensus.json`.

---

## Phase 4 — Output to Docking Pipeline

The consensus output feeds directly into blind docking. Because cavity detection runs on the whole protein (not per chain), docking coordinates are immediately valid for the full assembly.

### Step 4.1 — Output Format

```json
{
  "protein_id": "1ABC",
  "top1_cavity": {
    "center": [12.3, 45.6, 7.8],
    "wrrf_score": 0.87,
    "cascade_triggered": false,
    "tools_used": ["p2rank", "puresnet"]
  },
  "top5_cavities": [
    { "rank": 1, "center": [12.3, 45.6, 7.8], "wrrf_score": 0.87 },
    { "rank": 2, "center": [34.1, 22.9, 15.4], "wrrf_score": 0.61 },
    { "rank": 3, "center": [8.7, 67.2, 41.1], "wrrf_score": 0.44 },
    { "rank": 4, "center": [51.0, 10.3, 28.8], "wrrf_score": 0.31 },
    { "rank": 5, "center": [29.4, 38.7, 9.2], "wrrf_score": 0.18 }
  ]
}
```

### Step 4.2 — Docking Box Generation

From each cavity center, generate a docking search box:

- Default box size: 20 Å × 20 Å × 20 Å centered on predicted cavity
- For blind docking pass: use top-1 cavity as primary box
- Optionally run docking on all top-5 cavities in parallel

---

## Phase 5 — Logging and Monitoring

Every prediction must be fully logged for debugging, performance tracking, and future adaptive weighting.

### Step 5.1 — Per-Run Log Entry

```
[2026-06-25 10:25:44] 1ABC — Consensus complete
  Preprocessing: applied
  fpocket: 8 pockets detected (top-5 stored)
  P2Rank: 12 pockets detected (top-5 stored)
  PUResNet: 5 pockets detected (top-5 stored)
  Cascade check: P2Rank-PUResNet distance = 2.3 Å → agreement → cascade NOT triggered
  Tools used in wRRF: p2rank, puresnet
  Top-1 cavity: [12.3, 45.6, 7.8] | wRRF score: 0.87
  Runtime: 23.4 seconds
```

### Step 5.2 — Metrics to Track Per Prediction

Store these fields in the log database for future adaptive weighting (Phase 6):

| Field | Purpose |
|---|---|
| Protein size (atom count) | Detect size-dependent performance trends |
| Number of chains | Multi-chain vs single-chain performance |
| Cascade triggered (yes/no) | Measure fpocket fallback rate per dataset |
| Tools contributing to final prediction | Track which tools drive consensus |
| Silent failure per tool | Monitor tool health over time |
| Runtime per tool | Performance profiling |

---

## Phase 6 — Future: Protein-Type Adaptive Weighting

This phase is not implemented now. It requires accumulation of prediction data with ground truth labels.

### When to implement

After approximately 500–1000 predictions with known ground truth (from benchmark datasets or user-provided validation), extract structural features from the log database and train a lightweight model to predict optimal weights per protein.

### Recommended approach (continuous feature-conditioned weighting)

Rather than discrete protein class → weight lookup, extract continuous structural features from each protein and predict weights:

```
Structural features extracted per protein:
  - Secondary structure composition (% helix, % sheet, % coil)
  - Buried surface area fraction
  - Number of chains in assembly
  - Transmembrane domain detected (yes/no, via TMHMM or similar)
  - Protein size bin (small / medium / large)
  - Has disordered regions (yes/no)
      ↓
Lightweight regression model (trained on benchmark data)
  → outputs [w_p2rank, w_puresnet, w_fpocket]
      ↓
Apply predicted weights to wRRF instead of global weights
```

### Why not now

- Requires per-class benchmark data to validate — minimum ~100 structures per protein type
- Classification errors compound into worse predictions than a global vector
- The global vector from Phase 0 is already performing well (consensus 42.85% top-1, 53.34% top-5 on LIGYSIS-2024)

---

## Implementation Sequence Summary

| Phase | What | When |
|---|---|---|
| Phase 0 | Directory setup, schema definition, weight config | Day 1 |
| Phase 1 | Preprocessing pipeline (PDBFixer integration) | Day 1–2 |
| Phase 2 | fpocket, P2Rank, PUResNet execution wrappers | Day 2–4 |
| Phase 3 | Cascade wRRF consensus logic | Day 4–6 |
| Phase 4 | Docking output format and box generation | Day 6–7 |
| Phase 5 | Logging and monitoring infrastructure | Day 7–8 |
| Phase 6 | Adaptive weighting (future, data-dependent) | After 500+ predictions |

---

## Key Invariants (Never Violate These)

1. **Preprocessing always runs before any tool.** No raw PDB ever enters fpocket, P2Rank, or PUResNet.
2. **Whole protein always — never split chains.** Interface pockets must be detectable.
3. **Top-5 predictions always stored** — not just top-1. Cascade logic and docking both need them.
4. **Missing tool = contribution 0** — not a fallback score. Silent failures are logged, not imputed.
5. **Cluster center updated dynamically** — mean of all members, not fixed to the first member.
6. **Weights never changed after Optuna freeze** — future adaptive weighting is a separate system, not a patch to the global vector.

---

*SaliDock Implementation Plan v2.0 — Internal Development Document*  
*Antigravity AI / SaliDock Core Team — June 25, 2026*
