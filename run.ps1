# Windows: builds the UI and serves the app on http://localhost:8000 (CV extra with CUDA torch)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Push-Location frontend; npm install --silent; npm run build; Pop-Location
Set-Location backend
uv sync --extra cv
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
