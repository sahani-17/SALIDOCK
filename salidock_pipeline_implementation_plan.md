# SalidockWE — Consensus Cavity Detection Pipeline
## Phase-by-Phase Implementation Plan
### Tools: fpocket + P2Rank + PUResNetV2.0

> **Guiding principle:** Cross-validation gate after every phase. No phase begins until the previous phase passes its scientific validity check.

---

## PHASE 0 — PUResNetV2.0 Installation

### Prerequisites (verify before starting)
- NVIDIA GPU with CUDA 11.7 compatible drivers
- Conda (Miniconda or Anaconda) installed
- `nvidia-smi` confirms GPU is visible

---

### Step 1 — Create Isolated Conda Environment

```bash
conda create -n sparseconv python=3.10 -c conda-forge
conda activate sparseconv
```

> **Why isolated?** MinkowskiEngine has strict CUDA/PyTorch version pairing.
> Mixing with your existing environment WILL break things.

---

### Step 2 — Install PyTorch + CUDA Toolkit (exact versions, do not upgrade)

```bash
conda install openblas-devel -c anaconda
conda install pytorch=1.13.0 torchvision=0.14 pytorch-cuda=11.7 -c pytorch -c nvidia
conda install -c "nvidia/label/cuda-11.7.0" cuda-toolkit
```

**Verify:**
```bash
python -c "import torch; print(torch.__version__); print(torch.cuda.is_available())"
# Expected: 1.13.0  and  True
```

---

### Step 3 — Install MinkowskiEngine (sparse convolution backbone)

```bash
export CUDA_HOME=$CONDA_PREFIX
pip install -U git+https://github.com/NVIDIA/MinkowskiEngine --no-deps
```

**Verify:**
```bash
python -c "import MinkowskiEngine as ME; print(ME.__version__)"
# Should print without errors
```

> **Common failure point:** If CUDA_HOME is wrong, this build fails silently.
> Run `echo $CUDA_HOME` and confirm it points to your conda environment.

---

### Step 4 — Install Supporting Libraries

```bash
conda install -c conda-forge openbabel
conda install -c anaconda scikit-learn
```

---

### Step 5 — Install PUResNetV2.0

```bash
pip install puresnet==0.1
```

---

### Step 6 — Docker Alternative (Recommended for Production Web Deployment)

If you want a clean, reproducible web deployment environment, use Docker instead of conda:

```bash
# Pull pre-built image (CUDA + PyTorch 1.13 + MinkowskiEngine pre-installed)
docker pull jivankandel/puresnet:latest

# Run with GPU access
docker run --gpus all -it --user root -p 8888:8888 \
  -v "$(pwd)":/work --workdir /work \
  jivankandel/puresnet:latest
```

> **For SalidockWE web deployment, Docker is strongly preferred.**
> It eliminates the CUDA/conda version dependency problem entirely.

---

### Step 7 — Verify End-to-End with Test Structure

```python
# test_puresnet.py
from puresnet import predict

# Download a test PDB
import urllib.request
urllib.request.urlretrieve(
    "https://files.rcsb.org/download/1ATP.pdb",
    "1ATP.pdb"
)

# Run prediction
results = predict("1ATP.pdb")
print("Predicted pockets:", len(results))
print("First pocket center:", results[0]['center'])
print("Confidence score:", results[0]['score'])
```

**Expected output:** At least 1 pocket detected with a center coordinate and score.

---

### Phase 0 Gate — Installation Validation Checklist

```
[ ] torch.cuda.is_available() returns True
[ ] MinkowskiEngine imports without error
[ ] openbabel imports without error
[ ] puresnet.predict() runs on 1ATP.pdb without error
[ ] Predicted pocket count > 0
[ ] Runtime < 60 seconds on GPU for a ~300 residue protein
```

**Do not proceed to Phase 1 until all boxes are checked.**

---

---

## PHASE 1 — DCA Metric Implementation
### The Non-Negotiable Scientific Foundation

> Every downstream decision — individual benchmarks, weight optimization, final
> validation — is only as valid as this metric. Implement it once, implement it
> correctly, never change it.

---

### 1.1 — The Metric Definition

```
DCA@4Å Success Rate =
  Number of proteins where the distance between the
  predicted pocket center (top-N ranked) and the true
  ligand binding site center is ≤ 4.0 Å
  ──────────────────────────────────────────────────
  Total number of proteins in the test set
  × 100
```

**Parameters:**
- Distance threshold: **4.0 Å** (field standard, do not change)
- "Top-N" means we check the top 1 prediction by default (DCA@top1)
- Also compute DCA@top3 for completeness in the paper

---

### 1.2 — Full Python Implementation

```python
# metrics/dca.py

import numpy as np
from typing import List, Tuple, Dict

def euclidean_distance(coord1: np.ndarray, coord2: np.ndarray) -> float:
    """Compute Euclidean distance between two 3D coordinates."""
    return float(np.sqrt(np.sum((coord1 - coord2) ** 2)))


def compute_dca_success(
    predicted_centers: List[np.ndarray],
    true_centers: List[np.ndarray],
    threshold: float = 4.0,
    top_n: int = 1
) -> bool:
    """
    Determine if a single protein's predictions constitute a DCA success.

    Args:
        predicted_centers: List of predicted pocket centers, ordered by
                           confidence (highest confidence first).
                           Each center is np.ndarray of shape (3,).
        true_centers:      List of true ligand binding site centers
                           (a protein can have multiple true sites).
                           Each center is np.ndarray of shape (3,).
        threshold:         Distance threshold in Angstroms. Default 4.0 Å.
        top_n:             How many top predictions to consider. Default 1.

    Returns:
        True if any of the top-N predicted centers falls within threshold
        of any true binding site center.
    """
    if not predicted_centers or not true_centers:
        return False

    # Only consider top-N predictions
    top_predictions = predicted_centers[:top_n]

    for pred_center in top_predictions:
        for true_center in true_centers:
            dist = euclidean_distance(
                np.array(pred_center),
                np.array(true_center)
            )
            if dist <= threshold:
                return True
    return False


def compute_dca_success_rate(
    all_predicted: List[List[np.ndarray]],
    all_true: List[List[np.ndarray]],
    threshold: float = 4.0,
    top_n: int = 1
) -> Dict:
    """
    Compute DCA success rate across an entire benchmark dataset.

    Args:
        all_predicted: List of per-protein predicted pocket centers.
                       Each element is a list of centers (ranked by score).
        all_true:      List of per-protein true binding site centers.
        threshold:     Distance threshold in Angstroms.
        top_n:         Top-N predictions to consider per protein.

    Returns:
        Dictionary with:
          - success_rate: float (percentage, 0-100)
          - n_success:    int
          - n_total:      int
          - n_failed:     int
          - failed_ids:   list of indices where prediction failed
    """
    assert len(all_predicted) == len(all_true), \
        "Mismatch: predicted and true lists must be same length"

    n_total = len(all_predicted)
    successes = []
    failed_ids = []

    for i, (predicted, true) in enumerate(zip(all_predicted, all_true)):
        success = compute_dca_success(predicted, true, threshold, top_n)
        successes.append(success)
        if not success:
            failed_ids.append(i)

    n_success = sum(successes)

    return {
        "success_rate": (n_success / n_total) * 100 if n_total > 0 else 0.0,
        "n_success": n_success,
        "n_total": n_total,
        "n_failed": n_total - n_success,
        "failed_ids": failed_ids,
        "threshold_angstrom": threshold,
        "top_n": top_n
    }


def compute_multi_topn_rates(
    all_predicted: List[List[np.ndarray]],
    all_true: List[List[np.ndarray]],
    threshold: float = 4.0,
    top_ns: List[int] = [1, 2, 3]
) -> Dict:
    """
    Compute DCA success rates for multiple top-N values simultaneously.
    Use this for the paper's results table.
    """
    results = {}
    for n in top_ns:
        result = compute_dca_success_rate(
            all_predicted, all_true, threshold, n
        )
        results[f"DCA@top{n}"] = result["success_rate"]
        results[f"n_success@top{n}"] = result["n_success"]

    results["n_total"] = len(all_predicted)
    results["threshold"] = threshold
    return results
```

---

### 1.3 — Unit Tests (Run These Before Proceeding)

```python
# tests/test_dca.py

import numpy as np
import pytest
from metrics.dca import compute_dca_success, compute_dca_success_rate

def test_exact_match():
    """Prediction exactly on true center = success."""
    pred = [np.array([1.0, 2.0, 3.0])]
    true = [np.array([1.0, 2.0, 3.0])]
    assert compute_dca_success(pred, true, threshold=4.0) is True

def test_within_threshold():
    """Prediction 3.9Å away = success (< 4.0Å threshold)."""
    pred = [np.array([0.0, 0.0, 0.0])]
    true = [np.array([3.9, 0.0, 0.0])]
    assert compute_dca_success(pred, true, threshold=4.0) is True

def test_at_threshold_boundary():
    """Prediction exactly 4.0Å away = success (≤ threshold)."""
    pred = [np.array([0.0, 0.0, 0.0])]
    true = [np.array([4.0, 0.0, 0.0])]
    assert compute_dca_success(pred, true, threshold=4.0) is True

def test_outside_threshold():
    """Prediction 4.1Å away = failure."""
    pred = [np.array([0.0, 0.0, 0.0])]
    true = [np.array([4.1, 0.0, 0.0])]
    assert compute_dca_success(pred, true, threshold=4.0) is False

def test_top_n_only_checks_top_predictions():
    """With top_n=1, only first prediction is checked."""
    pred = [
        np.array([100.0, 0.0, 0.0]),  # rank 1: far away
        np.array([0.0, 0.0, 0.0])     # rank 2: close, but not checked
    ]
    true = [np.array([0.0, 0.0, 0.0])]
    assert compute_dca_success(pred, true, threshold=4.0, top_n=1) is False
    assert compute_dca_success(pred, true, threshold=4.0, top_n=2) is True

def test_success_rate_computation():
    """80% success rate with 4 successes out of 5."""
    all_pred = [
        [np.array([0.0, 0.0, 0.0])],   # success
        [np.array([0.0, 0.0, 0.0])],   # success
        [np.array([0.0, 0.0, 0.0])],   # success
        [np.array([0.0, 0.0, 0.0])],   # success
        [np.array([100.0, 0.0, 0.0])], # failure
    ]
    all_true = [[np.array([0.0, 0.0, 0.0])]] * 5
    result = compute_dca_success_rate(all_pred, all_true, threshold=4.0)
    assert result["success_rate"] == 80.0
    assert result["n_success"] == 4
    assert result["n_failed"] == 1

def test_empty_predictions():
    """No predictions = failure, not crash."""
    pred = []
    true = [np.array([0.0, 0.0, 0.0])]
    assert compute_dca_success(pred, true, threshold=4.0) is False

# Run: pytest tests/test_dca.py -v
```

---

### Phase 1 Gate — CV Validation

```
Scientific validity check for Phase 1:

[ ] All 7 unit tests pass (pytest tests/test_dca.py -v)
[ ] Boundary condition test passes (exactly 4.0Å = success)
[ ] Top-N logic verified (top1 vs top3 give different results)
[ ] Function handles edge cases: empty predictions, multiple true sites
[ ] Metric produces a float in range [0, 100]
[ ] Results are deterministic (same input = same output, always)

Gate question: Can you reproduce the COACH420 baseline numbers
from the P2Rank paper using this metric?
  Expected P2Rank DCA@top1 on COACH420 ≈ 72-77%
  If your metric gives a number far outside this range,
  your ground truth center extraction is wrong, not the metric.
```

---

---

## PHASE 2 — Benchmark Dataset Setup

### 2.1 — Primary Benchmark: COACH420

COACH420 is the field-standard small benchmark. Every paper you will compare
against reports numbers on this dataset.

```
420 protein-ligand complexes
Diverse protein families
Standard ground truth: ligand centroid = true binding site center
Published DCA@top1 baselines exist for fpocket, P2Rank, PUResNetV2.0
```

**Download and prepare:**

```bash
# Create benchmark directory structure
mkdir -p benchmarks/coach420/pdb
mkdir -p benchmarks/coach420/ground_truth
mkdir -p benchmarks/coach420/splits

# Download COACH420 from P2Rank repository (most reliable source)
wget https://github.com/rdk/p2rank-datasets/raw/master/coach420.tar.gz
tar -xzf coach420.tar.gz -C benchmarks/coach420/
```

**Extract ground truth centers:**

```python
# scripts/extract_ground_truth.py

from Bio.PDB import PDBParser
import numpy as np
import json
import os

HETATM_EXCLUDE = {
    'HOH', 'WAT', 'DOD',  # waters
    'SO4', 'PO4', 'GOL', 'EDO', 'PEG',  # common crystallization artifacts
    'CL', 'NA', 'MG', 'ZN', 'CA', 'FE'   # ions (unless you want metal sites)
}

def extract_ligand_center(pdb_path: str) -> list:
    """
    Extract true binding site centers as centroids of all ligand atoms.
    Returns list of centers (one per unique ligand).
    """
    parser = PDBParser(QUIET=True)
    structure = parser.get_structure("protein", pdb_path)
    centers = []

    for model in structure:
        for chain in model:
            for residue in chain:
                resname = residue.get_resname().strip()
                if (residue.id[0] != ' ' and  # HETATM records
                    resname not in HETATM_EXCLUDE):
                    atoms = list(residue.get_atoms())
                    if len(atoms) >= 5:  # Filter out single-atom ligands
                        coords = np.array([a.get_coord() for a in atoms])
                        center = coords.mean(axis=0)
                        centers.append({
                            "resname": resname,
                            "chain": chain.id,
                            "center": center.tolist()
                        })

    return centers

# Build ground truth index
ground_truth = {}
pdb_dir = "benchmarks/coach420/pdb"

for pdb_file in os.listdir(pdb_dir):
    if pdb_file.endswith(".pdb"):
        pdb_id = pdb_file.replace(".pdb", "")
        pdb_path = os.path.join(pdb_dir, pdb_file)
        centers = extract_ligand_center(pdb_path)
        if centers:
            ground_truth[pdb_id] = centers

with open("benchmarks/coach420/ground_truth/centers.json", "w") as f:
    json.dump(ground_truth, f, indent=2)

print(f"Extracted ground truth for {len(ground_truth)} structures")
```

---

### 2.2 — Secondary Benchmark: HOLO4K

Run on HOLO4K after COACH420 to validate generalizability.
HOLO4K contains ~4000 structures, much larger and harder.

```bash
wget https://github.com/rdk/p2rank-datasets/raw/master/holo4k.tar.gz
tar -xzf holo4k.tar.gz -C benchmarks/holo4k/
```

---

### 2.3 — Family-Stratified Splits (Critical for CV Validity)

```bash
# Install MMseqs2 for sequence clustering
conda install -c bioconda mmseqs2

# Extract all sequences from COACH420
python scripts/extract_sequences.py benchmarks/coach420/pdb/ > coach420_sequences.fasta

# Cluster at 30% sequence identity
mmseqs easy-cluster coach420_sequences.fasta \
    coach420_clusters /tmp/mmseqs_tmp \
    --min-seq-id 0.30 \
    --cov-mode 0 \
    --cluster-mode 0

# This produces coach420_clusters_cluster.tsv
# Each row: [cluster_representative, member]
```

```python
# scripts/create_stratified_splits.py

import pandas as pd
import numpy as np
from collections import defaultdict

def create_family_stratified_folds(cluster_file: str,
                                   n_folds: int = 5,
                                   seed: int = 42) -> dict:
    """
    Create family-stratified k-fold splits.
    Entire homology clusters go to the same fold — never split.
    """
    np.random.seed(seed)

    # Load cluster assignments
    clusters = defaultdict(list)
    with open(cluster_file) as f:
        for line in f:
            rep, member = line.strip().split('\t')
            clusters[rep].append(member)

    # Shuffle cluster representatives
    reps = list(clusters.keys())
    np.random.shuffle(reps)

    # Distribute clusters across folds (roughly equal size)
    fold_assignments = {i: [] for i in range(n_folds)}
    fold_sizes = {i: 0 for i in range(n_folds)}

    for rep in reps:
        # Assign to smallest fold
        smallest_fold = min(fold_sizes, key=fold_sizes.get)
        fold_assignments[smallest_fold].extend(clusters[rep])
        fold_sizes[smallest_fold] += len(clusters[rep])

    return fold_assignments

folds = create_family_stratified_folds(
    "coach420_clusters_cluster.tsv",
    n_folds=5
)

# Save fold assignments
import json
with open("benchmarks/coach420/splits/stratified_5fold.json", "w") as f:
    json.dump(folds, f, indent=2)

for fold_id, members in folds.items():
    print(f"Fold {fold_id}: {len(members)} proteins")
```

---

### Phase 2 Gate — CV Validation

```
Scientific validity check for Phase 2:

[ ] COACH420: All 420 PDB files downloaded and parseable
[ ] Ground truth extracted for ≥ 400/420 structures (some may lack valid ligands)
[ ] Sequence clustering completed at 30% identity threshold
[ ] 5 folds created with NO protein appearing in multiple folds
[ ] Fold sizes approximately balanced (within 20% of each other)
[ ] Zero homolog pairs exist across fold boundaries
    (verify: run all-vs-all sequence identity check between fold members)

Gate question: Does fold size distribution look like this?
  Fold 0: ~80-90 proteins
  Fold 1: ~80-90 proteins
  Fold 2: ~80-90 proteins
  Fold 3: ~80-90 proteins
  Fold 4: ~80-90 proteins
  Total: ~420 proteins
```

---

---

## PHASE 3 — Individual Tool Benchmarking

> Goal: Establish the individual DCA@4Å baseline for each tool separately.
> This becomes the "individual method" column in your paper's results table.
> Do NOT run consensus yet.

---

### 3.1 — fpocket Benchmark

```python
# benchmark/run_fpocket.py

import subprocess
import os
import json
import numpy as np
from metrics.dca import compute_dca_success_rate

def run_fpocket(pdb_path: str) -> list:
    """Run fpocket and parse output pocket centers."""
    result = subprocess.run(
        ["fpocket", "-f", pdb_path],
        capture_output=True, text=True
    )

    # fpocket writes output to <pdbname>_out/ directory
    pdb_name = os.path.basename(pdb_path).replace(".pdb", "")
    out_dir = f"{pdb_name}_out"
    info_file = os.path.join(out_dir, f"{pdb_name}_info.txt")

    pockets = []
    if os.path.exists(info_file):
        with open(info_file) as f:
            content = f.read()
        # Parse pocket centers from fpocket output
        # fpocket reports "Pocket X" blocks with x, y, z coordinates
        import re
        blocks = content.split("Pocket")[1:]
        for block in blocks:
            x_match = re.search(r'x\s*:\s*([-\d.]+)', block)
            y_match = re.search(r'y\s*:\s*([-\d.]+)', block)
            z_match = re.search(r'z\s*:\s*([-\d.]+)', block)
            score_match = re.search(r'Druggability Score\s*:\s*([-\d.]+)', block)

            if x_match and y_match and z_match:
                center = np.array([
                    float(x_match.group(1)),
                    float(y_match.group(1)),
                    float(z_match.group(1))
                ])
                score = float(score_match.group(1)) if score_match else 0.0
                pockets.append({"center": center, "score": score})

    # Sort by score descending (highest confidence first)
    pockets.sort(key=lambda x: x["score"], reverse=True)
    return [p["center"] for p in pockets]


# Run on COACH420
ground_truth = json.load(open("benchmarks/coach420/ground_truth/centers.json"))
pdb_dir = "benchmarks/coach420/pdb"

all_predicted = []
all_true = []

for pdb_id, true_data in ground_truth.items():
    pdb_path = os.path.join(pdb_dir, f"{pdb_id}.pdb")
    if not os.path.exists(pdb_path):
        continue

    predicted_centers = run_fpocket(pdb_path)
    true_centers = [np.array(t["center"]) for t in true_data]

    all_predicted.append(predicted_centers)
    all_true.append(true_centers)

result = compute_dca_success_rate(all_predicted, all_true, threshold=4.0, top_n=1)
print(f"\nfpocket Individual Benchmark — COACH420")
print(f"DCA@top1 Success Rate: {result['success_rate']:.2f}%")
print(f"Successes: {result['n_success']} / {result['n_total']}")

# Save results
with open("results/fpocket_individual_coach420.json", "w") as f:
    json.dump(result, f, indent=2)
```

---

### 3.2 — P2Rank Benchmark

```python
# benchmark/run_p2rank.py

import subprocess
import os
import csv
import json
import numpy as np
from metrics.dca import compute_dca_success_rate

def run_p2rank(pdb_path: str, p2rank_path: str = "prank") -> list:
    """Run P2Rank and parse output pocket centers."""
    out_dir = "p2rank_tmp_output"
    os.makedirs(out_dir, exist_ok=True)

    result = subprocess.run(
        [p2rank_path, "predict", "-f", pdb_path, "-o", out_dir],
        capture_output=True, text=True
    )

    pdb_name = os.path.basename(pdb_path).replace(".pdb", "")
    predictions_file = os.path.join(out_dir, f"{pdb_name}.pdb_predictions.csv")

    pockets = []
    if os.path.exists(predictions_file):
        with open(predictions_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                # P2Rank CSV columns: rank, score, probability, center_x, center_y, center_z
                center = np.array([
                    float(row['   center_x']),
                    float(row['   center_y']),
                    float(row['   center_z'])
                ])
                score = float(row['   score'])
                pockets.append({"center": center, "score": score})

    # Already sorted by P2Rank (rank column, ascending = better)
    return [p["center"] for p in pockets]


# Run on COACH420
ground_truth = json.load(open("benchmarks/coach420/ground_truth/centers.json"))
pdb_dir = "benchmarks/coach420/pdb"

all_predicted = []
all_true = []

for pdb_id, true_data in ground_truth.items():
    pdb_path = os.path.join(pdb_dir, f"{pdb_id}.pdb")
    if not os.path.exists(pdb_path):
        continue

    predicted_centers = run_p2rank(pdb_path)
    true_centers = [np.array(t["center"]) for t in true_data]

    all_predicted.append(predicted_centers)
    all_true.append(true_centers)

result = compute_dca_success_rate(all_predicted, all_true, threshold=4.0, top_n=1)
print(f"\nP2Rank Individual Benchmark — COACH420")
print(f"DCA@top1 Success Rate: {result['success_rate']:.2f}%")
print(f"Successes: {result['n_success']} / {result['n_total']}")

with open("results/p2rank_individual_coach420.json", "w") as f:
    json.dump(result, f, indent=2)
```

---

### 3.3 — PUResNetV2.0 Benchmark

```python
# benchmark/run_puresnet.py

import json
import numpy as np
from puresnet import predict
from metrics.dca import compute_dca_success_rate

def run_puresnet(pdb_path: str) -> list:
    """Run PUResNetV2.0 and return pocket centers ranked by score."""
    results = predict(pdb_path)
    # results is a list of dicts with 'center' and 'score'
    # Already sorted by confidence
    return [np.array(r['center']) for r in results]


# Run on COACH420
ground_truth = json.load(open("benchmarks/coach420/ground_truth/centers.json"))
pdb_dir = "benchmarks/coach420/pdb"

all_predicted = []
all_true = []

for pdb_id, true_data in ground_truth.items():
    pdb_path = os.path.join(pdb_dir, f"{pdb_id}.pdb")
    if not os.path.exists(pdb_path):
        continue

    predicted_centers = run_puresnet(pdb_path)
    true_centers = [np.array(t["center"]) for t in true_data]

    all_predicted.append(predicted_centers)
    all_true.append(true_centers)

result = compute_dca_success_rate(all_predicted, all_true, threshold=4.0, top_n=1)
print(f"\nPUResNetV2.0 Individual Benchmark — COACH420")
print(f"DCA@top1 Success Rate: {result['success_rate']:.2f}%")
print(f"Successes: {result['n_success']} / {result['n_total']}")

with open("results/puresnet_individual_coach420.json", "w") as f:
    json.dump(result, f, indent=2)
```

---

### Expected Individual Baselines (Sanity Check)

```
Tool              Expected DCA@top1 (COACH420)   Source
────────────────────────────────────────────────────────────
fpocket           ~51–56%                         Literature
P2Rank            ~72–77%                         Literature
PUResNetV2.0      ~82–87%                         Paper (Holo801)
                                                  (COACH420 may differ)
```

If your numbers deviate by more than ±5% from these, there is a bug in:
- Ground truth center extraction, OR
- Tool output parsing, OR
- Score sorting (centers not ranked highest-first)

Debug the parsing layer before proceeding.

---

### Phase 3 Gate — CV Validation

```
Scientific validity check for Phase 3:

[ ] All 3 tools produce non-empty predictions for ≥ 95% of COACH420 structures
[ ] fpocket DCA@top1 falls in expected range (51-56%)
[ ] P2Rank DCA@top1 falls in expected range (72-77%)
[ ] PUResNetV2.0 DCA@top1 is measured (compare to paper's reported numbers)
[ ] Predicted centers are 3D coordinates in Angstroms (not normalized/scaled)
[ ] No tool crashes on any COACH420 structure (log failures separately)
[ ] DCA@top3 is also computed for all three tools (needed for paper table)
[ ] Runtime per structure recorded (must be feasible for web deployment)
```

---

---

## PHASE 4 — Uniform Weight Consensus Benchmark

> Goal: Establish the equal-weight consensus baseline.
> This is the scientific proof that consensus > individual tools.
> Every paper needs this ablation.

---

### 4.1 — Score Normalization (Mandatory Before Combining)

```python
# consensus/normalize.py

import numpy as np
from typing import List

def normalize_scores_per_protein(scores: List[float]) -> List[float]:
    """
    Normalize a list of pocket scores to [0, 1] range per protein.
    Uses min-max normalization within a single protein's predictions.

    Critical: normalize PER PROTEIN, not globally across the dataset.
    The relative ranking within one protein is what matters.
    """
    if not scores:
        return []

    scores_arr = np.array(scores, dtype=float)

    min_s = scores_arr.min()
    max_s = scores_arr.max()

    if max_s == min_s:
        # All scores identical: return uniform 0.5
        return [0.5] * len(scores)

    normalized = (scores_arr - min_s) / (max_s - min_s)
    return normalized.tolist()
```

---

### 4.2 — Spatial Clustering (Consensus Core)

```python
# consensus/cluster.py

import numpy as np
from typing import List, Dict
from scipy.spatial.distance import cdist

CLUSTERING_THRESHOLD_ANGSTROM = 4.0  # Same as DCA threshold

def cluster_pocket_candidates(
    fpocket_pockets: List[Dict],
    p2rank_pockets: List[Dict],
    puresnet_pockets: List[Dict],
    threshold: float = CLUSTERING_THRESHOLD_ANGSTROM
) -> List[Dict]:
    """
    Merge pocket predictions from all 3 tools into consensus candidates.

    Algorithm:
    1. Pool all predictions from all tools
    2. Group predictions within `threshold` Angstroms of each other
    3. Each group becomes one consensus candidate
    4. Candidate center = weighted average of member centers
    5. Track which tools contributed to each candidate

    Args:
        fpocket_pockets: List of dicts with 'center' (np.array) and
                         'score_normalized' (float)
        p2rank_pockets:  Same format
        puresnet_pockets: Same format
        threshold:       Maximum distance (Å) to merge predictions

    Returns:
        List of consensus candidates with:
          - center: np.array (3,)
          - tools_agreeing: list of tool names
          - n_tools: int (1, 2, or 3)
          - fpocket_score: float or None
          - p2rank_score: float or None
          - puresnet_score: float or None
    """
    # Tag each pocket with its source tool
    all_pockets = []
    for p in fpocket_pockets:
        all_pockets.append({**p, 'tool': 'fpocket'})
    for p in p2rank_pockets:
        all_pockets.append({**p, 'tool': 'p2rank'})
    for p in puresnet_pockets:
        all_pockets.append({**p, 'tool': 'puresnet'})

    if not all_pockets:
        return []

    centers = np.array([p['center'] for p in all_pockets])

    # Greedy clustering by distance
    assigned = [False] * len(all_pockets)
    clusters = []

    for i in range(len(all_pockets)):
        if assigned[i]:
            continue

        cluster = [i]
        assigned[i] = True

        for j in range(i + 1, len(all_pockets)):
            if assigned[j]:
                continue
            dist = np.linalg.norm(centers[i] - centers[j])
            if dist <= threshold:
                cluster.append(j)
                assigned[j] = True

        # Build consensus candidate from this cluster
        members = [all_pockets[idx] for idx in cluster]
        tools_present = list(set(m['tool'] for m in members))
        member_centers = np.array([m['center'] for m in members])
        consensus_center = member_centers.mean(axis=0)

        candidate = {
            'center': consensus_center,
            'tools_agreeing': tools_present,
            'n_tools': len(tools_present),
            'fpocket_score': next(
                (m['score_normalized'] for m in members
                 if m['tool'] == 'fpocket'), None),
            'p2rank_score': next(
                (m['score_normalized'] for m in members
                 if m['tool'] == 'p2rank'), None),
            'puresnet_score': next(
                (m['score_normalized'] for m in members
                 if m['tool'] == 'puresnet'), None),
        }
        clusters.append(candidate)

    return clusters
```

---

### 4.3 — Uniform Weight Consensus Scoring

```python
# consensus/score.py

import numpy as np
from typing import List, Dict

AGREEMENT_BONUS = 0.15  # Bonus per additional tool agreeing (tunable)

def compute_consensus_score_uniform(
    candidate: Dict,
    w1: float = 1/3,  # fpocket weight
    w2: float = 1/3,  # p2rank weight
    w3: float = 1/3,  # puresnet weight
    agreement_bonus: float = AGREEMENT_BONUS
) -> float:
    """
    Compute consensus score for a single pocket candidate.
    Uses uniform weights for Phase 4.

    Score = weighted sum of normalized tool scores (for tools that found it)
            + agreement bonus for multi-tool agreement
    """
    score = 0.0
    weight_sum = 0.0

    if candidate['fpocket_score'] is not None:
        score += w1 * candidate['fpocket_score']
        weight_sum += w1

    if candidate['p2rank_score'] is not None:
        score += w2 * candidate['p2rank_score']
        weight_sum += w2

    if candidate['puresnet_score'] is not None:
        score += w3 * candidate['puresnet_score']
        weight_sum += w3

    # Normalize by actual weights present (handles missing tool predictions)
    if weight_sum > 0:
        score = score / weight_sum

    # Agreement bonus: each additional tool adds to confidence
    n_agreeing = candidate['n_tools']
    if n_agreeing >= 2:
        score += agreement_bonus * (n_agreeing - 1)

    return min(score, 1.0)  # Cap at 1.0


def rank_consensus_candidates(
    candidates: List[Dict],
    weights: tuple = (1/3, 1/3, 1/3),
    agreement_bonus: float = AGREEMENT_BONUS
) -> List[Dict]:
    """
    Score and rank all consensus candidates for a single protein.
    Returns candidates sorted by consensus score (highest first).
    """
    w1, w2, w3 = weights

    for candidate in candidates:
        candidate['consensus_score'] = compute_consensus_score_uniform(
            candidate, w1, w2, w3, agreement_bonus
        )

    return sorted(candidates, key=lambda x: x['consensus_score'], reverse=True)
```

---

### 4.4 — Full Uniform Consensus Benchmark Runner

```python
# benchmark/run_uniform_consensus.py

import json
import numpy as np
from benchmark.run_fpocket import run_fpocket
from benchmark.run_p2rank import run_p2rank
from benchmark.run_puresnet import run_puresnet
from consensus.normalize import normalize_scores_per_protein
from consensus.cluster import cluster_pocket_candidates
from consensus.score import rank_consensus_candidates
from metrics.dca import compute_dca_success_rate

def run_full_consensus(pdb_path: str,
                       weights: tuple = (1/3, 1/3, 1/3)) -> list:
    """
    Run complete parallel consensus pipeline on one protein.
    Returns ranked list of consensus pocket centers.
    """
    # Step 1: Run all 3 tools independently
    fp_centers_raw  = run_fpocket_with_scores(pdb_path)
    p2r_centers_raw = run_p2rank_with_scores(pdb_path)
    pur_centers_raw = run_puresnet_with_scores(pdb_path)

    # Step 2: Normalize scores per-protein
    fp_scores_norm  = normalize_scores_per_protein([p['score'] for p in fp_centers_raw])
    p2r_scores_norm = normalize_scores_per_protein([p['score'] for p in p2r_centers_raw])
    pur_scores_norm = normalize_scores_per_protein([p['score'] for p in pur_centers_raw])

    fp_pockets  = [{'center': p['center'], 'score_normalized': s}
                   for p, s in zip(fp_centers_raw, fp_scores_norm)]
    p2r_pockets = [{'center': p['center'], 'score_normalized': s}
                   for p, s in zip(p2r_centers_raw, p2r_scores_norm)]
    pur_pockets = [{'center': p['center'], 'score_normalized': s}
                   for p, s in zip(pur_centers_raw, pur_scores_norm)]

    # Step 3: Spatial clustering
    candidates = cluster_pocket_candidates(fp_pockets, p2r_pockets, pur_pockets)

    # Step 4: Score and rank
    ranked = rank_consensus_candidates(candidates, weights=weights)

    return [c['center'] for c in ranked]


# Run on COACH420 with uniform weights
ground_truth = json.load(open("benchmarks/coach420/ground_truth/centers.json"))
pdb_dir = "benchmarks/coach420/pdb"
all_predicted = []
all_true = []

for pdb_id, true_data in ground_truth.items():
    pdb_path = f"{pdb_dir}/{pdb_id}.pdb"
    predicted_centers = run_full_consensus(pdb_path, weights=(1/3, 1/3, 1/3))
    true_centers = [np.array(t["center"]) for t in true_data]
    all_predicted.append(predicted_centers)
    all_true.append(true_centers)

result = compute_dca_success_rate(all_predicted, all_true, threshold=4.0, top_n=1)
print(f"\nUniform Consensus Benchmark (w=1/3 each) — COACH420")
print(f"DCA@top1: {result['success_rate']:.2f}%")
print(f"Expected: > best individual tool ({best_individual_rate:.2f}%)")

with open("results/consensus_uniform_coach420.json", "w") as f:
    json.dump(result, f, indent=2)
```

---

### Phase 4 Gate — CV Validation

```
Scientific validity check for Phase 4:

[ ] Uniform consensus DCA@top1 > best individual tool DCA@top1
    (If consensus is WORSE than the best individual tool,
     the clustering threshold or scoring formula is broken)

[ ] Agreement bonus improves results vs no agreement bonus
    (Test with agreement_bonus=0 vs 0.15 — bonus should help)

[ ] Tier distribution is sensible:
    ~20-40% pockets found by all 3 tools (Tier 1)
    ~30-40% pockets found by exactly 2 tools (Tier 2)
    ~20-40% pockets found by only 1 tool (Tier 3)

[ ] No protein returns zero consensus candidates
    (Even singleton predictions should surface)

[ ] Score normalization is working:
    Spot-check 5 proteins — all tool scores should be in [0,1]
    before weighting

Gate threshold: Uniform consensus DCA@top1 should be ≥ 2-3%
above the best individual tool. If not, debug clustering first.
```

---

---

## PHASE 5 — Optuna Weight Optimization + Exact Weight Determination

> Goal: Find the scientifically optimal weight combination (w1, w2, w3)
> using Bayesian optimization over the weight simplex.

---

### 5.1 — Install Optuna

```bash
conda activate sparseconv
pip install optuna optuna-dashboard
```

---

### 5.2 — Stratified 5-Fold Cross-Validation Wrapper

```python
# optimization/cv_wrapper.py

import json
import numpy as np
from typing import Tuple

def get_fold_data(fold_id: int,
                  folds_file: str,
                  ground_truth_file: str,
                  pdb_dir: str,
                  precomputed_predictions: dict) -> Tuple[list, list, list, list]:
    """
    Split data into train and test sets for a given fold.
    
    Returns:
        train_predicted, train_true, test_predicted, test_true
    """
    folds = json.load(open(folds_file))
    ground_truth = json.load(open(ground_truth_file))

    test_ids = set(folds[str(fold_id)])
    train_ids = set()
    for fid, members in folds.items():
        if int(fid) != fold_id:
            train_ids.update(members)

    train_predicted, train_true = [], []
    test_predicted, test_true = [], []

    for pdb_id, true_data in ground_truth.items():
        if pdb_id not in precomputed_predictions:
            continue

        true_centers = [np.array(t["center"]) for t in true_data]
        pred = precomputed_predictions[pdb_id]

        if pdb_id in test_ids:
            test_predicted.append(pred['centers_by_weight'])
            test_true.append(true_centers)
        elif pdb_id in train_ids:
            train_predicted.append(pred['centers_by_weight'])
            train_true.append(true_centers)

    return train_predicted, train_true, test_predicted, test_true
```

---

### 5.3 — Optuna Objective Function

```python
# optimization/optuna_optimize.py

import optuna
import numpy as np
import json
from metrics.dca import compute_dca_success_rate
from benchmark.run_uniform_consensus import run_full_consensus_raw

# ── Pre-compute all raw predictions once (expensive) ─────────────────────────
# This avoids re-running tools inside each Optuna trial
print("Pre-computing predictions for all proteins... (this runs once)")
precomputed = {}
ground_truth = json.load(open("benchmarks/coach420/ground_truth/centers.json"))
pdb_dir = "benchmarks/coach420/pdb"

for pdb_id in ground_truth:
    pdb_path = f"{pdb_dir}/{pdb_id}.pdb"
    # Returns raw clustered candidates with all tool scores stored
    candidates = get_raw_candidates(pdb_path)
    precomputed[pdb_id] = candidates

print(f"Pre-computed {len(precomputed)} proteins. Starting optimization...")

# ── Optuna Objective ──────────────────────────────────────────────────────────

folds = json.load(open("benchmarks/coach420/splits/stratified_5fold.json"))
ground_truth = json.load(open("benchmarks/coach420/ground_truth/centers.json"))

def objective(trial: optuna.Trial) -> float:
    """
    Optuna objective: maximize mean DCA@top1 across all 5 CV folds.
    Weights are constrained to sum to 1.0.
    """
    # Sample weights on the simplex
    w1 = trial.suggest_float("w_fpocket", 0.05, 0.70)
    w2 = trial.suggest_float("w_p2rank",  0.05, 0.70)
    w3 = 1.0 - w1 - w2

    # Enforce minimum weight for each tool
    if w3 < 0.05 or w3 > 0.70:
        return 0.0  # Invalid configuration

    weights = (w1, w2, w3)
    fold_scores = []

    for fold_id in range(5):
        # Get train/test split for this fold
        test_ids = set(folds[str(fold_id)])
        test_predicted = []
        test_true = []

        for pdb_id, candidates in precomputed.items():
            if pdb_id not in test_ids:
                continue
            if pdb_id not in ground_truth:
                continue

            # Apply current weights to pre-computed candidates
            ranked = rank_consensus_candidates(candidates, weights=weights)
            centers = [c['center'] for c in ranked]
            true_centers = [np.array(t["center"]) for t in ground_truth[pdb_id]]

            test_predicted.append(centers)
            test_true.append(true_centers)

        fold_result = compute_dca_success_rate(
            test_predicted, test_true,
            threshold=4.0, top_n=1
        )
        fold_scores.append(fold_result["success_rate"])

    # Objective: maximize mean DCA@top1 across folds
    return np.mean(fold_scores)


# ── Run Optimization ──────────────────────────────────────────────────────────

sampler = optuna.samplers.TPESampler(seed=42)
study = optuna.create_study(
    direction="maximize",
    sampler=sampler,
    study_name="salidock_weight_optimization"
)

study.optimize(objective, n_trials=200, show_progress_bar=True)

# ── Extract Results ───────────────────────────────────────────────────────────

best = study.best_params
w1_opt = best["w_fpocket"]
w2_opt = best["w_p2rank"]
w3_opt = 1.0 - w1_opt - w2_opt

print(f"\n{'='*50}")
print(f"OPTIMAL WEIGHTS (Bayesian Optimization, 5-fold CV)")
print(f"{'='*50}")
print(f"  fpocket:    w1 = {w1_opt:.4f}")
print(f"  P2Rank:     w2 = {w2_opt:.4f}")
print(f"  PUResNetV2: w3 = {w3_opt:.4f}")
print(f"  Sum check:  {w1_opt + w2_opt + w3_opt:.4f} (must be 1.0)")
print(f"\nBest CV DCA@top1: {study.best_value:.2f}%")

# Save optimal weights
optimal_weights = {
    "w_fpocket": w1_opt,
    "w_p2rank": w2_opt,
    "w_puresnet": w3_opt,
    "best_cv_dca_top1": study.best_value,
    "n_trials": 200,
    "n_folds": 5,
    "threshold_angstrom": 4.0,
    "method": "Bayesian_optimization_TPE_Optuna"
}

with open("results/optimal_weights.json", "w") as f:
    json.dump(optimal_weights, f, indent=2)

# Save full study for paper's supplementary
study.trials_dataframe().to_csv("results/optuna_trials.csv", index=False)
```

---

### Phase 5 Gate — CV Validation

```
Scientific validity check for Phase 5:

[ ] Optuna completes 200 trials without error
[ ] Optimal weights sum to exactly 1.0 (verify: w1+w2+w3 = 1.0000)
[ ] Each weight is in [0.05, 0.70] — no tool is given near-zero weight
    (if one tool gets w < 0.05, question whether it's contributing)
[ ] Optimized CV DCA@top1 > Uniform CV DCA@top1
    (optimization must improve over equal weights)
[ ] Weight values are stable across re-runs with same seed
[ ] Optuna convergence plot shows the objective plateauing
    (still improving at trial 200 = run more trials)
[ ] All 5 fold scores are within ±3% of each other
    (high variance = overfitting or bad fold splits)

Record these numbers for the paper:
  w_fpocket (optimal): ____
  w_p2rank (optimal):  ____
  w_puresnet (optimal): ____
  Mean CV DCA@top1 (uniform weights): ____
  Mean CV DCA@top1 (optimal weights): ____
  Improvement: ____  %
```

---

---

## PHASE 6 — Final Optimized Consensus Benchmark

> Final holdout evaluation with optimal weights.
> This number goes in your paper as the headline result.

---

### 6.1 — Final Evaluation (COACH420 + HOLO4K)

```python
# benchmark/run_final_benchmark.py

import json
import numpy as np
from benchmark.run_uniform_consensus import run_full_consensus
from metrics.dca import compute_dca_success_rate, compute_multi_topn_rates

# Load optimal weights
optimal = json.load(open("results/optimal_weights.json"))
WEIGHTS = (
    optimal["w_fpocket"],
    optimal["w_p2rank"],
    optimal["w_puresnet"]
)

# ── COACH420 Final Evaluation ─────────────────────────────────────────────────
ground_truth = json.load(open("benchmarks/coach420/ground_truth/centers.json"))
pdb_dir = "benchmarks/coach420/pdb"

all_predicted = []
all_true = []
for pdb_id, true_data in ground_truth.items():
    pdb_path = f"{pdb_dir}/{pdb_id}.pdb"
    centers = run_full_consensus(pdb_path, weights=WEIGHTS)
    true_centers = [np.array(t["center"]) for t in true_data]
    all_predicted.append(centers)
    all_true.append(true_centers)

coach420_results = compute_multi_topn_rates(
    all_predicted, all_true,
    threshold=4.0, top_ns=[1, 2, 3]
)

print("\n" + "="*60)
print("FINAL BENCHMARK RESULTS — COACH420")
print("="*60)
print(f"DCA@top1: {coach420_results['DCA@top1']:.2f}%")
print(f"DCA@top2: {coach420_results['DCA@top2']:.2f}%")
print(f"DCA@top3: {coach420_results['DCA@top3']:.2f}%")
print(f"N total:  {coach420_results['n_total']}")

# Save
with open("results/final_consensus_optimized_coach420.json", "w") as f:
    json.dump(coach420_results, f, indent=2)
```

---

### 6.2 — Paper Results Table (Auto-Generated)

```python
# Generate publication-ready results comparison table

individual_fp  = json.load(open("results/fpocket_individual_coach420.json"))
individual_p2r = json.load(open("results/p2rank_individual_coach420.json"))
individual_pur = json.load(open("results/puresnet_individual_coach420.json"))
uniform        = json.load(open("results/consensus_uniform_coach420.json"))
optimized      = json.load(open("results/final_consensus_optimized_coach420.json"))

print("\n" + "="*70)
print("RESULTS TABLE — COACH420 DCA@top1 Success Rate (%)")
print("="*70)
print(f"{'Method':<35} {'DCA@top1':>10} {'DCA@top3':>10}")
print("-"*70)
print(f"{'fpocket (individual)':<35} {individual_fp['success_rate']:>9.2f}%")
print(f"{'P2Rank (individual)':<35} {individual_p2r['success_rate']:>9.2f}%")
print(f"{'PUResNetV2.0 (individual)':<35} {individual_pur['success_rate']:>9.2f}%")
print("-"*70)
print(f"{'Consensus uniform (w=1/3 each)':<35} {uniform['success_rate']:>9.2f}%")
print(f"{'Consensus optimized (Optuna)':<35} {optimized['DCA@top1']:>9.2f}%  {optimized['DCA@top3']:>9.2f}%")
print("="*70)
print(f"\nOptimal weights: fpocket={optimal['w_fpocket']:.3f}, "
      f"P2Rank={optimal['w_p2rank']:.3f}, "
      f"PUResNetV2={optimal['w_puresnet']:.3f}")
```

---

### Phase 6 Gate — Final Scientific Validity Check

```
Final scientific validity check before publication:

[ ] Optimized consensus DCA@top1 > uniform consensus DCA@top1
[ ] Optimized consensus DCA@top1 > ALL individual tools
[ ] Results are reproducible (same numbers on re-run with same seed)
[ ] HOLO4K results also show improvement over individual tools
[ ] Optimal weights are defensible:
    No tool should have weight < 0.10 (would question its inclusion)
    No tool should have weight > 0.70 (would question the "consensus")
[ ] Ablation study logged:
    3-tool consensus vs 2-tool (fpocket+P2Rank, fpocket+PUResNet, P2Rank+PUResNet)
    3-tool must outperform all 2-tool combinations to justify the architecture

Publication readiness checklist:
[ ] Individual tool results reported
[ ] Uniform weight baseline reported
[ ] Optimized consensus reported
[ ] Statistical significance tested (McNemar's test on DCA successes)
[ ] Runtime per structure reported (mean ± std across COACH420)
[ ] Hardware specifications reported (GPU model, RAM)
```

---

## SUMMARY — Phase Flow

```
Phase 0:  Install PUResNetV2.0
             ↓ Gate: Installation verification
Phase 1:  Implement DCA@4Å metric + unit tests
             ↓ Gate: All 7 unit tests pass
Phase 2:  Download COACH420, extract ground truth, create stratified folds
             ↓ Gate: Zero homolog pairs across fold boundaries
Phase 3:  Individual benchmarks (fpocket, P2Rank, PUResNetV2.0 separately)
             ↓ Gate: Numbers match published literature (±5%)
Phase 4:  Uniform weight parallel consensus benchmark
             ↓ Gate: Consensus > best individual tool
Phase 5:  Optuna Bayesian optimization → find exact optimal weights
             ↓ Gate: Optimization improves over uniform, weights sum to 1.0
Phase 6:  Final benchmark with optimal weights on COACH420 + HOLO4K
             ↓ Gate: Full ablation, reproducibility, statistical significance
```

---

*SalidockWE Pipeline Implementation Plan — v1.0*
*Tools: fpocket + P2Rank + PUResNetV2.0 | Metric: DCA@4Å | Benchmark: COACH420, HOLO4K*
