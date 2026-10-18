import importlib.util

from app.cv.base import Analyzer
from app.cv.detectors.noop import NoopAnalyzer


def cv_installed() -> bool:
    return all(importlib.util.find_spec(m) is not None for m in ("ultralytics", "cv2", "torch"))


def analyzer(name: str | None = None) -> Analyzer:
    name = name or default_analyzer()
    if name == "noop":
        return NoopAnalyzer()
    if name == "ball-tracking":
        if not cv_installed():
            raise RuntimeError("CV-зависимости не установлены: выполните `uv sync --extra cv` в папке backend")
        from app.cv.detectors.ball_tracking import BallTrackingAnalyzer

        return BallTrackingAnalyzer()
    raise ValueError(f"Неизвестный анализатор {name}")


def default_analyzer() -> str:
    return "ball-tracking" if cv_installed() else "noop"
