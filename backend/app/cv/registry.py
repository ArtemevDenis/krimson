import importlib.util

from app.cv.base import Analyzer
from app.cv.detectors.noop import NoopAnalyzer


def cv_installed() -> bool:
    return all(importlib.util.find_spec(m) is not None for m in ("ultralytics", "cv2", "torch"))


CV_MISSING = "CV-зависимости не установлены: выполните `uv sync --extra cv` в папке backend"


def analyzer(name: str | None = None) -> Analyzer:
    """Ball tracking is the default even without the CV packages: with detections already computed (e.g. on
    the Windows machine) it needs only numpy; the detection pass itself reports the missing packages."""
    name = name or "ball-tracking"
    if name == "noop":
        return NoopAnalyzer()
    if name == "ball-tracking":
        from app.cv.detectors.ball_tracking import BallTrackingAnalyzer

        return BallTrackingAnalyzer()
    raise ValueError(f"Неизвестный анализатор {name}")
