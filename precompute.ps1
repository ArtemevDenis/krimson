# Windows/CUDA: precompute ball & player detections for videos; copy the resulting
# <video>.krimson-det.json.gz next to the video on the Mac
# Usage: .\precompute.ps1 [--venue <hall slug>] D:\volley\VID_1.mp4 D:\volley\VID_2.mp4
$ErrorActionPreference = "Stop"
$videos = $args | ForEach-Object { if ($_ -like "--*" -or -not (Test-Path $_)) { $_ } else { (Resolve-Path $_).Path } }
Set-Location (Join-Path $PSScriptRoot "backend")
uv sync --extra cv
uv run python -m app.cv.precompute @videos
