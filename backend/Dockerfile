# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:0.13.1 AS uv

FROM python:3.12-slim AS builder
COPY --from=uv /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /build
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production \
    PORT=8000

RUN groupadd --system --gid 10001 solvia \
    && useradd --system --uid 10001 --gid solvia --no-create-home --shell /usr/sbin/nologin solvia

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY --chmod=0755 scripts/entrypoint.sh ./scripts/entrypoint.sh

USER solvia
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ.get('PORT', '8000')}/api/v1/health\", timeout=4)"]

ENTRYPOINT ["/app/scripts/entrypoint.sh"]
