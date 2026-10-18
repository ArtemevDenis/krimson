from app.cv.base import RallyDetector
from app.cv.detectors.noop import NoopRallyDetector

_rally_detectors: dict[str, RallyDetector] = {d.name: d for d in (NoopRallyDetector(),)}

DEFAULT_RALLY_DETECTOR = "noop"


def rally_detector(name: str | None = None) -> RallyDetector:
    return _rally_detectors[name or DEFAULT_RALLY_DETECTOR]


def available_rally_detectors() -> list[str]:
    return list(_rally_detectors)
