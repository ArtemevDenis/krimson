#!/usr/bin/env bash
# Production-like local run: builds the UI once, backend serves it on http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"
(cd frontend && npm install --silent && npm run build)
cd backend && uv sync --quiet && exec uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
