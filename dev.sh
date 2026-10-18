#!/usr/bin/env bash
# Development: backend with reload on :8000, Vite on http://localhost:5173 (proxies /api)
set -euo pipefail
cd "$(dirname "$0")"
(cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app) &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT
cd frontend && npm run dev
