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

# ── GNINA 1.3 (CPU-only) ──────────────────────────────────────────────────
USER root
RUN curl -fsSL https://github.com/gnina/gnina/releases/download/v1.3/gnina \
         -o /usr/local/bin/gnina \
    && chmod +x /usr/local/bin/gnina

# ── QuickVina-W (blind docking) ───────────────────────────────────────────
RUN curl -fsSL "https://github.com/QVina/qvina/raw/master/bin/qvina-w" \
         -o /usr/local/bin/qvina-w \
    && chmod +x /usr/local/bin/qvina-w
USER $MAMBA_USER

ENV GNINA_BIN=gnina
ENV QUICKVINA_BIN=qvina-w

WORKDIR /app/backend

EXPOSE 8000

CMD ["sh", "-lc", "micromamba run -n salidock uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]