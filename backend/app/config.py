import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("KRIMSON_DATA_DIR", ROOT_DIR / "data"))
DB_PATH = DATA_DIR / "krimson.db"
UPLOADS_DIR = DATA_DIR / "uploads"
PROXIES_DIR = DATA_DIR / "proxies"
EXPORTS_DIR = DATA_DIR / "exports"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
# Trained models are versioned in the repo (portable via git); stock weights and training scratch are not
MODELS_DIR = Path(os.environ.get("KRIMSON_MODELS_DIR", ROOT_DIR / "models"))
WEIGHTS_CACHE = DATA_DIR / "weights"
TRAINING_RUNS = DATA_DIR / "training-runs"

PROXY_HEIGHT = 720
PROXY_FPS = 30


def ensure_dirs() -> None:
    for d in (DATA_DIR, UPLOADS_DIR, PROXIES_DIR, EXPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
