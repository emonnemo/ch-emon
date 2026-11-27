#!/usr/bin/env sh
set -eu

echo "Running Alembic database migrations..."
alembic upgrade head

echo "Ensuring CC-CEDICT dictionary is seeded..."
python scripts/import_cedict.py

echo "Starting FastAPI server on port ${PORT:-7860}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-7860}"
