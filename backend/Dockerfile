FROM mambaorg/micromamba:1.5.8

WORKDIR /app

USER root
# Install Docker CLI and curl (wget is not available in micromamba base)
RUN apt-get update && apt-get install -y --no-install-recommends docker.io curl && rm -rf /var/lib/apt/lists/*
USER $MAMBA_USER

COPY --chown=$MAMBA_USER:$MAMBA_USER backend/environment.render.yml /tmp/environment.render.yml
RUN micromamba create -y -n salidock -f /tmp/environment.render.yml && \
    micromamba clean --all --yes

# Copy full repo to install root salidock package and backend
COPY --chown=$MAMBA_USER:$MAMBA_USER . /app

# Install root salidock python package in editable mode inside conda env
RUN micromamba run -n salidock pip install -e /app

# Install P2Rank for consensus cavity detection
ARG P2RANK_VERSION=2.4.2
RUN mkdir -p /app/tools && \
    micromamba run -n salidock python -c "import pathlib, tarfile, urllib.request; v='${P2RANK_VERSION}'; url=f'https://github.com/rdk/p2rank/releases/download/{v}/p2rank_{v}.tar.gz'; tar_path='/tmp/p2rank.tar.gz'; urllib.request.urlretrieve(url, tar_path); pathlib.Path('/app/tools').mkdir(parents=True, exist_ok=True); tarfile.open(tar_path, 'r:gz').extractall('/app/tools')"

ENV P2RANK_HOME=/app/tools/p2rank_2.4.2
ENV PATH="${P2RANK_HOME}:$PATH"

# ── CUDA 12 runtime (required by GNINA 1.3 binary even in --no_gpu mode) ──
# GNINA 1.3 is dynamically linked against 7 CUDA 12 shared libraries.
# We install ONLY the specific packages needed (NOT cuda-libraries-12-0
# which is a 1.5GB meta-package pulling in NPP, nvJPEG, cuRAND etc.)
#
# Required libraries and the packages that provide them:
#   libcudart.so.12      ← cuda-cudart-12-0
#   libcusparse.so.12    ← libcusparse-12-0
#   libcufft.so.11       ← libcufft-11-0
#   libnvToolsExt.so.1   ← cuda-nvtx-12-0
#   libcublas.so.12      ← libcublas-12-0
#   libcublasLt.so.12    ← libcublas-12-0
#   libcusolver.so.11    ← libcusolver-12-0
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        wget gnupg2 ca-certificates && \
    wget -qO /usr/share/keyrings/cuda-archive-keyring.gpg \
        https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/cuda-archive-keyring.gpg] https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/ /" \
        > /etc/apt/sources.list.d/cuda.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        cuda-cudart-12-0 \
        cuda-nvtx-12-0 \
        libcublas-12-0 \
        libcufft-12-0 \
        libcusparse-12-0 \
        libcusolver-12-0 \
        libnvjitlink-12-0 && \
    rm -rf /var/lib/apt/lists/* /tmp/*

# ── GNINA 1.3 (CPU-only, --no_gpu enforced via env) ───────────────────────
USER root
RUN curl -fSL --retry 5 --retry-delay 10 --retry-max-time 300 \
         https://github.com/gnina/gnina/releases/download/v1.3/gnina \
         -o /usr/local/bin/gnina \
    && chmod +x /usr/local/bin/gnina

# ── QuickVina-W (blind docking) ───────────────────────────────────────────
# The QVina repo has no GitHub Releases — the binary is committed directly
# in the repo at bin/qvina-w. We download from the raw content URL.
RUN curl -fSL --retry 5 --retry-delay 10 --retry-max-time 300 \
         "https://raw.githubusercontent.com/QVina/qvina/master/bin/qvina-w" \
         -o /usr/local/bin/qvina-w \
    && chmod +x /usr/local/bin/qvina-w \
    && (qvina-w --help > /dev/null 2>&1 || echo "WARNING: qvina-w may not be executable on this arch")

# ── Pre-create session work dir with correct ownership ────────────────────
# The named Docker volume mounts as root-owned. Create it here as root and
# chown to MAMBA_USER so the app can create session subdirs at runtime.
RUN mkdir -p /tmp/SALIDOCK_Database && chown -R $MAMBA_USER:$MAMBA_USER /tmp/SALIDOCK_Database
USER $MAMBA_USER

ENV GNINA_BIN=gnina
ENV QUICKVINA_BIN=qvina-w

WORKDIR /app/backend

EXPOSE 8000

CMD ["sh", "-lc", "micromamba run -n salidock uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]