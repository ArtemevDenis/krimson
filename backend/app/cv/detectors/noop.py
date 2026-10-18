from pathlib import Path

from app.cv.base import CourtCalibration, ProgressFn, RallySegment


class NoopRallyDetector:
    """Placeholder until the stage-2 detector lands; keeps the job pipeline exercised end to end."""

    name = "noop"

    def detect(self, video: Path, calibrations: list[CourtCalibration], progress: ProgressFn) -> list[RallySegment]:
        progress(1.0)
        return []
