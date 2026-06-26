FROM mambaorg/micromamba:1.5.8

WORKDIR /app

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.render.yml /tmp/environment.render.yml
RUN micromamba create -y -n salidock -f /tmp/environment.render.yml && \
    micromamba clean --all --yes

COPY --chown=$MAMBA_USER:$MAMBA_USER . /app

EXPOSE 10000

CMD ["sh", "-lc", "micromamba run -n salidock uvicorn app:app --host 0.0.0.0 --port ${PORT:-10000}"]