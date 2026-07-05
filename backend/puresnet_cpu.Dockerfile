# ─────────────────────────────────────────────────────────────────────────────
# puresnet_cpu.Dockerfile
#
# Uses jivankandel/puresnet:latest as base — MinkowskiEngine is PRE-COMPILED
# inside it, so no C++ compilation needed here at all.
#
# IMPORTANT: Pull the base image BEFORE building (shows download progress):
#   docker pull jivankandel/puresnet:latest
#
# Build command (after pull):
#   cd ~/puresnet-build
#   DOCKER_BUILDKIT=0 docker build -t salidock-puresnet-cpu:latest .
#
# Smoke-test:
#   docker run --rm salidock-puresnet-cpu:latest \
#     python -c "import puresnet; print('OK')"
# ─────────────────────────────────────────────────────────────────────────────

FROM jivankandel/puresnet:latest

# ── Step 0: Disable CUDA so MinkowskiEngine falls back to CPU ─────────────────
ENV CUDA_VISIBLE_DEVICES=""
ENV FORCE_CPU=1

# Create /work — the benchmark runner mounts PDB files here:
#   docker run -v /path/to/pdb:/work salidock-puresnet-cpu:latest python -c "..."
RUN mkdir -p /work

# ── Step 1: Embed residue files into the puresnet package ─────────────────────
#    NOTE: 'sparseconv' env does NOT exist — puresnet is in the base conda env.
#    All scripts use dynamic path discovery via `import puresnet; puresnet.__file__`
COPY puresnet_residues/ /tmp/puresnet_residues/
COPY install_puresnet_residues.py /tmp/install_puresnet_residues.py
RUN python /tmp/install_puresnet_residues.py

# ── Step 2: Patch model.py + residue_h.py for CPU checkpoint loading ──────────
COPY patch_puresnet_model.py /tmp/patch_puresnet_model.py
RUN python /tmp/patch_puresnet_model.py

# ── Step 3: Self-test — build fails if anything is wrong ──────────────────────
COPY verify_puresnet.py /tmp/verify_puresnet.py
RUN python /tmp/verify_puresnet.py
