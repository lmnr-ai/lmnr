FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

ENV UV_PYTHON_INSTALL_DIR=/python

ENV UV_PYTHON_PREFERENCE=only-managed

RUN uv python install 3.13

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

ADD . /app

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM debian:bookworm-slim

RUN adduser --disabled-password --gecos "" --uid 1000 app

COPY --from=builder --chown=app:app /python /python

COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:$PATH"

USER app

WORKDIR /app

ENV PORT=8903
EXPOSE 8903

CMD ["python", "src/server.py"]
