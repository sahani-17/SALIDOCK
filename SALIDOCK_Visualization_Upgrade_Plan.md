# SALIDOCK Visualization Upgrade Plan
**Goal:** Replace Mol\* with a PLIP + PyMOL open-source pipeline to produce figures of equal or superior quality to CBDock2  
**All tools listed here are free and open-source**

---

## Table of Contents

1. [Overview](#overview)
2. [Toolchain](#toolchain)
3. [Phase 1 — Environment Setup](#phase-1--environment-setup)
4. [Phase 2 — Prepare Your Docked Complex](#phase-2--prepare-your-docked-complex)
5. [Phase 3 — PLIP Interaction Analysis](#phase-3--plip-interaction-analysis)
6. [Phase 4 — PyMOL Visualization Script](#phase-4--pymol-visualization-script)
7. [Phase 5 — Electrostatic Surface (Optional Upgrade)](#phase-5--electrostatic-surface-optional-upgrade)
8. [Phase 6 — 2D Interaction Diagram (Optional Upgrade)](#phase-6--2d-interaction-diagram-optional-upgrade)
9. [Phase 7 — Batch Automation for Multiple Compounds](#phase-7--batch-automation-for-multiple-compounds)
10. [What the Final Figure Should Contain](#what-the-final-figure-should-contain)
11. [CBDock2 vs Upgraded SALIDOCK — Feature Comparison](#cbdock2-vs-upgraded-salidock--feature-comparison)
12. [Troubleshooting](#troubleshooting)
13. [Resources](#resources)

---

## Overview

The current SALIDOCK pipeline uses **Mol\*** for visualization, which is a good interactive viewer but is unsuitable for producing publication-quality figures with validated interaction annotations.

This plan upgrades the visualization layer to a three-tool pipeline:

```
Docked Complex (PDB)
        │
        ▼
   PLIP Analysis          ← validates all interaction types, outputs a PyMOL session
        │
        ▼
  PyMOL Rendering         ← ray-traced, labeled, annotated figures at 300 DPI
        │
        ▼
 Optional Additions       ← electrostatic surface (APBS), 2D diagram (PLIP/RDKit)
```

Mol\* is retained for interactive exploration in the SALIDOCK web interface. PyMOL is used exclusively for final figure generation.

---

## Toolchain

| Tool | Purpose | Cost | Install Method |
|---|---|---|---|
| **PyMOL open-source** | 3D rendering, ray-traced export | Free | conda |
| **PLIP** | Validated interaction detection | Free | pip |
| **APBS + PDB2PQR** | Electrostatic surface | Free | conda |
| **RDKit** | 2D interaction diagram | Free | conda |
| **ProDy** (optional) | PDB cleaning and selection | Free | pip |
| **ChimeraX** (optional fallback) | Alternative renderer | Free (academic) | Installer |

---

## Phase 1 — Environment Setup

**Estimated time: 30 minutes (one time only)**

### 1.1 Create a dedicated conda environment

```bash
conda create -n docking_viz python=3.9
conda activate docking_viz
```

### 1.2 Install PyMOL open-source

```bash
conda install -c conda-forge pymol-open-source
```

Verify installation:

```bash
pymol --version
# Expected: PyMOL 2.5.x or higher
```

### 1.3 Install PLIP

```bash
pip install plip
```

Verify:

```bash
plip --version
```

### 1.4 Install APBS and PDB2PQR (for electrostatic surface)

```bash
conda install -c conda-forge apbs pdb2pqr
```

### 1.5 Install RDKit (for 2D diagrams)

```bash
conda install -c conda-forge rdkit
```

---

## Phase 2 — Prepare Your Docked Complex

Before running PLIP or PyMOL, the docked complex must be a single merged PDB file containing both the protein and the docked ligand pose.

### 2.1 Merge protein and ligand into one PDB

```bash
# If you have separate files:
cat protein.pdb ligand_pose.pdb > complex.pdb
```

Or in Python using ProDy:

```python
from prody import *

protein = parsePDB('protein.pdb')
ligand  = parsePDB('ligand_pose.pdb')
complex_struct = protein + ligand
writePDB('complex.pdb', complex_struct)
```

### 2.2 Ensure ligand has correct HETATM records

Open `complex.pdb` in a text editor and confirm that:
- Protein residues are labelled `ATOM`
- Ligand atoms are labelled `HETATM`
- Ligand residue name is consistent (e.g., `LIG` or `MOL`)

### 2.3 Assign partial charges (required for APBS)

```bash
pdb2pqr --ff=AMBER complex.pdb complex.pqr
```

---

## Phase 3 — PLIP Interaction Analysis

PLIP (Protein–Ligand Interaction Profiler) validates all non-covalent interaction types against crystallographic standards. It outputs:
- A detailed XML/TXT report
- A PyMOL `.pse` session file with all interactions pre-mapped

### 3.1 Run PLIP from command line

```bash
plip -f complex.pdb \
     -o ./plip_output \
     --pymol \
     --verbose \
     --nohydro
```

**Flag explanation:**

| Flag | Effect |
|---|---|
| `-f` | Input PDB file |
| `-o` | Output directory |
| `--pymol` | Generates a `.pse` PyMOL session with interactions drawn |
| `--verbose` | Prints full interaction table |
| `--nohydro` | Suppresses explicit hydrogens in PyMOL output (cleaner figure) |

### 3.2 Alternatively — use the PLIP web server (no install needed)

Upload your `complex.pdb` to: **https://plip-tool.biotec.tu-dresden.de**

Download the `.pse` file from results.

### 3.3 Read the PLIP report

PLIP generates a text report listing every detected interaction:

```
Hydrogen Bonds:
  LIG:A:1 -- ASP72:A    Distance: 2.84 Å  Angle: 158.2°  Donor: LIG
  LIG:A:1 -- TYR334:A   Distance: 3.01 Å  Angle: 142.7°  Donor: PROTEIN

Hydrophobic Interactions:
  LIG:A:1 -- TRP84:A    Distance: 3.72 Å

π-Stacking:
  LIG:A:1 -- PHE290:A   Type: parallel    Distance: 3.8 Å
```

Record these residues — they will be labeled in your final figure.

---

## Phase 4 — PyMOL Visualization Script

Save the following as `salidock_viz.pml`. Run with:

```bash
pymol -cq salidock_viz.pml
```

### 4.1 Full visualization script

```python
# ============================================================
# SALIDOCK — Publication-Quality Visualization Script
# PyMOL open-source | Version 1.0
# ============================================================

# --- Load PLIP pre-annotated session ---
load plip_output/complex.pse

# --- Global display settings ---
bg_color white
set ray_opaque_background, on
set antialias, 2
set hash_max, 300
set ray_shadows, 1
set depth_cue, 1
set fog_start, 0.45

# --- Protein ---
hide everything
show cartoon, polymer
color marine, polymer
set cartoon_transparency, 0.10
set cartoon_fancy_helices, 1

# --- Define binding site (5 Å shell around ligand) ---
select ligand, resn LIG
select binding_site, byres (ligand around 5.0)

# --- Binding site residues ---
show sticks, binding_site
util.cnc binding_site                      # color by element (CPK)
set stick_radius, 0.12, binding_site

# --- Ligand ---
show sticks, ligand
show spheres, ligand
color yellow, ligand
set sphere_scale, 0.18, ligand
set stick_radius, 0.20, ligand

# --- H-bonds with distance labels ---
distance hbonds, ligand, binding_site, 3.2, mode=2
color cyan, hbonds
set dash_width, 2.5
set dash_gap, 0.35
set dash_radius, 0.05
label hbonds, "%3.1f Å" % (distance)

# --- Hydrophobic contacts ---
# (PLIP .pse already contains these as objects; rename if needed)
color tv_green, hydrophobic_contacts
set dash_width, 1.8, hydrophobic_contacts

# --- Residue labels ---
# Replace the list below with residues identified in your PLIP report
select key_residues, (resi 72+84+118+121+122+123+124+279+290+334+440 and polymer)
label key_residues and name CA, "%s%s" % (resn, resi)
set label_size, 13
set label_font_id, 7
set label_color, black
set label_shadow_mode, 2             # white outline for readability
set label_bg_color, white
set label_bg_transparency, 0.4

# --- Semi-transparent pocket surface ---
create pocket_surface, binding_site
show surface, pocket_surface
color lightblue, pocket_surface
set transparency, 0.65, pocket_surface

# --- Camera orientation ---
orient ligand
zoom ligand, 8

# --- Ray-trace and export ---
set ray_trace_mode, 1                # full ray-trace
ray 2400, 1800
png salidock_figure_01.png, dpi=300, ray=1

# --- Also export a black-background version ---
bg_color black
set label_color, white
ray 2400, 1800
png salidock_figure_01_dark.png, dpi=300, ray=1
```

---

## Phase 5 — Electrostatic Surface (Optional Upgrade)

This produces a charge-colored surface showing positive/negative regions of the binding pocket — a feature not available in CBDock2 output.

### 5.1 Generate electrostatic surface using APBS in PyMOL

```bash
# First convert PDB to PQR (adds partial charges)
pdb2pqr --ff=AMBER complex.pdb complex.pqr
```

Then inside PyMOL (GUI):

```
Plugin → APBS Tools → Set PQR file → complex.pqr → Run APBS
```

Or script it:

```python
load complex.pdb
load complex.pqr, complex_pqr
apbs_surface complex, complex_pqr
ramp_new elec_ramp, complex_apbs, [-5, 0, 5], [red, white, blue]
set surface_color, elec_ramp, complex
show surface, complex
set transparency, 0.4, complex
```

The result: red = negative charge, blue = positive charge — highly informative for understanding binding selectivity.

---

## Phase 6 — 2D Interaction Diagram (Optional Upgrade)

A 2D diagram summarizing all interaction types in a single panel is standard in medicinal chemistry publications and is absent from both Mol\* and CBDock2 output.

### 6.1 Generate using PLIP's built-in 2D output

```bash
plip -f complex.pdb -o ./plip_output --svg
```

Opens an SVG file showing the ligand structure with interaction lines annotated per residue.

### 6.2 Higher-quality 2D diagram using ProLIF + RDKit

```python
pip install prolif

import MDAnalysis as mda
import prolif as plf
import matplotlib.pyplot as plt

u = mda.Universe("complex.pdb")
protein = u.select_atoms("protein")
ligand  = u.select_atoms("resname LIG")

fp = plf.Fingerprint()
fp.run_from_iterable([ligand.positions], ligand, protein)

fig, ax = plt.subplots(figsize=(12, 8))
fp.plot_lignetwork(fp.ifp[0], kind="frame", frame=0, ax=ax)
plt.savefig("interaction_network_2d.png", dpi=300, bbox_inches="tight")
```

This produces a publication-quality 2D network diagram showing the ligand and all interacting residues annotated by interaction type.

---

## Phase 7 — Batch Automation for Multiple Compounds

If you are visualizing multiple docked compounds (as in a screening campaign), automate the pipeline with a shell script.

```bash
#!/bin/bash
# batch_visualize.sh
# Usage: bash batch_visualize.sh /path/to/complexes/

COMPLEX_DIR=$1
OUTPUT_DIR="./visualization_outputs"
mkdir -p $OUTPUT_DIR

for pdb in $COMPLEX_DIR/*.pdb; do
    name=$(basename $pdb .pdb)
    echo "Processing: $name"

    # Step 1: PLIP
    plip -f $pdb -o $OUTPUT_DIR/$name/plip --pymol --nohydro

    # Step 2: PyMOL render
    sed "s/COMPOUND_NAME/$name/g" salidock_viz.pml > /tmp/tmp_viz.pml
    sed -i "s|plip_output|$OUTPUT_DIR/$name/plip|g" /tmp/tmp_viz.pml
    pymol -cq /tmp/tmp_viz.pml

    echo "Done: $OUTPUT_DIR/$name/"
done

echo "All compounds processed."
```

---

## What the Final Figure Should Contain

A complete, publication-quality panel should include:

```
Panel A — 3D binding pose (PyMOL ray-traced)
  ✅ Protein cartoon (blue/marine)
  ✅ Binding pocket residues as thin sticks (CPK coloring)
  ✅ Ligand as ball-and-stick (yellow or magenta)
  ✅ H-bonds as cyan dashed lines with Å labels
  ✅ Hydrophobic contacts as green dashes
  ✅ π-stacking arcs (if present)
  ✅ Key residue labels (three-letter + number, white outline)
  ✅ Semi-transparent pocket surface

Panel B — Electrostatic surface (APBS)
  ✅ Protein surface colored by charge (red/white/blue)
  ✅ Ligand shown in pocket

Panel C — 2D interaction diagram (ProLIF/PLIP SVG)
  ✅ Ligand 2D structure
  ✅ Residue nodes color-coded by interaction type
  ✅ Interaction legend
```

---

## CBDock2 vs Upgraded SALIDOCK — Feature Comparison

| Feature | CBDock2 | Upgraded SALIDOCK |
|---|---|---|
| H-bond visualization | ✅ | ✅ |
| H-bond distance labels (Å) | ❌ | ✅ |
| Hydrophobic contacts | ✅ | ✅ |
| π-stacking | ❌ | ✅ |
| Salt bridge annotation | ❌ | ✅ |
| Residue labels | ✅ | ✅ |
| Interaction validation method | Automated | PLIP (crystallographic) |
| Electrostatic surface | ❌ | ✅ |
| 2D interaction diagram | ❌ | ✅ |
| Ray-traced 300 DPI export | ❌ | ✅ |
| Dark background version | ❌ | ✅ |
| Batch automation | ❌ | ✅ |
| Reproducible script | ❌ | ✅ |
| Journal submission ready | ⚠️ Partial | ✅ Full |

---

## Troubleshooting

**PyMOL not finding ligand:**
```python
# List all residue names in your PDB
select all
iterate all, print(resn)
# Replace 'LIG' in the script with your actual residue name
```

**PLIP reports no interactions:**
- Confirm your PDB has both `ATOM` (protein) and `HETATM` (ligand) records
- Run `plip -f complex.pdb --debug` to see where detection fails
- Ensure the ligand is within the protein — not floating outside

**Ray-trace very slow:**
- Reduce resolution: `ray 1200, 900` for drafts
- Disable shadows: `set ray_shadows, 0`
- Use `draw` instead of `ray` for quick previews

**Label overlap:**
```python
set label_size, 11          # reduce size
set label_position, (0,1,0) # shift labels upward
```

---

## Resources

| Resource | URL |
|---|---|
| PyMOL open-source source | https://github.com/schrodinger/pymol-open-source |
| PyMOL command reference | https://pymolwiki.org/index.php/Category:Commands |
| PLIP tool | https://github.com/pharmai/plip |
| PLIP web server | https://plip-tool.biotec.tu-dresden.de |
| APBS electrostatics | https://github.com/Electrostatics/apbs |
| ProLIF 2D diagrams | https://github.com/chemosim-lab/ProLIF |
| ChimeraX (free academic) | https://www.cgl.ucsf.edu/chimerax/download.html |
| PDB2PQR | https://github.com/Electrostatics/pdb2pqr |

---

*Document prepared for SALIDOCK visualization upgrade | Antigravity Team*  
*All tools referenced are open-source or free for academic use*
