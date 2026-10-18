import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.environ.get("KRIMSON_DATA_DIR", ROOT_DIR / "data"))
DB_PATH = DATA_DIR / "krimson.db"
UPLOADS_DIR = DATA_DIR / "uploads"
PROXIES_DIR = DATA_DIR / "proxies"
EXPORTS_DIR = DATA_DIR / "exports"
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

PROXY_HEIGHT = 720
PROXY_FPS = 30


def ensure_dirs() -> None:
    for d in (DATA_DIR, UPLOADS_DIR, PROXIES_DIR, EXPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
