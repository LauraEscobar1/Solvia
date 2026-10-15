#!/bin/sh
set -eu

echo "Aplicando migraciones…"
alembic upgrade head

echo "Iniciando API en el puerto ${PORT:-8000}…"
exec uvicorn app.main:create_app --factory \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --no-access-log \
    --proxy-headers
