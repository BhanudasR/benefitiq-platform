#!/usr/bin/env bash
# Production release + serve for the BenefitIQ API.
#   1. Apply the governed schema via Alembic (never auto-create tables in prod:
#      set BIQ_AUTO_CREATE_TABLES=false in the host env).
#   2. Serve FastAPI with uvicorn workers on the host-provided $PORT.
# Requires BIQ_DATABASE_URL (managed Postgres) in the environment.
set -euo pipefail

echo "[release] applying migrations: alembic upgrade head"
alembic upgrade head

PORT="${PORT:-8000}"
WORKERS="${WEB_CONCURRENCY:-2}"
echo "[serve] uvicorn app.main:app on 0.0.0.0:${PORT} (workers=${WORKERS})"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --workers "${WORKERS}"
