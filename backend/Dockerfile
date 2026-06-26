FROM mambaorg/micromamba:1.5.8

WORKDIR /app

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.render.yml /tmp/environment.render.yml
RUN micromamba create -y -n salidock -f /tmp/environment.render.yml && \
    micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER . /app

# Install P2Rank for consensus cavity detection (Tier 2)
ARG P2RANK_VERSION=2.4.2
RUN mkdir -p /app/tools && \
    micromamba run -n salidock python -c "import pathlib, tarfile, urllib.request; v='${P2RANK_VERSION}'; url=f'https://github.com/rdk/p2rank/releases/download/{v}/p2rank_{v}.tar.gz'; tar_path='/tmp/p2rank.tar.gz'; urllib.request.urlretrieve(url, tar_path); pathlib.Path('/app/tools').mkdir(parents=True, exist_ok=True); tarfile.open(tar_path, 'r:gz').extractall('/app/tools')"

ENV P2RANK_HOME=/app/tools/p2rank_2.4.2
ENV PATH="${P2RANK_HOME}:$PATH"

# ── GNINA 1.3 (CPU-only) ──────────────────────────────────────────────────
RUN wget -q https://github.com/gnina/gnina/releases/download/v1.3/gnina \
         -O /usr/local/bin/gnina \
    && chmod +x /usr/local/bin/gnina

# ── QuickVina-W (blind docking) ───────────────────────────────────────────
RUN wget -q "https://github.com/QVina/qvina/raw/master/bin/qvina-w" \
         -O /usr/local/bin/qvina-w \
    && chmod +x /usr/local/bin/qvina-w

ENV GNINA_BIN=gnina
ENV QUICKVINA_BIN=qvina-w

EXPOSE 10000

CMD ["sh", "-lc", "micromamba run -n salidock uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000}"]