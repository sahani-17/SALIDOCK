FROM jivankandel/puresnet:latest

# ─────────────────────────────────────────────────────────────────────────────
# Fix: generate the 20 standard amino acid SDF files that are missing from
# the puresnet package (excluded from both PyPI and Docker image).
# OpenBabel is already installed in the base image — we use it to generate
# 3D-optimised SDF structures from canonical SMILES.
# ─────────────────────────────────────────────────────────────────────────────

# Step 1: Generate residue SDF files using OpenBabel
COPY generate_puresnet_residues.py /tmp/generate_puresnet_residues.py
RUN python /tmp/generate_puresnet_residues.py

# Step 2: Patch model.py so CUDA-saved checkpoint loads on CPU
COPY patch_puresnet_model.py /tmp/patch_puresnet_model.py
RUN python /tmp/patch_puresnet_model.py

# Step 3: Verify everything works
COPY verify_puresnet.py /tmp/verify_puresnet.py
RUN python /tmp/verify_puresnet.py
