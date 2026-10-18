from pathlib import Path

from app.cv.base import AnalysisResult, CalibrationInput, ProgressFn


class NoopAnalyzer:
    """Used in tests and when the CV extra isn't installed."""

    name = "noop"

    def analyze(self, video: Path, calibrations: list[CalibrationInput], profile, progress: ProgressFn) -> AnalysisResult:
        progress(1.0)
        return AnalysisResult()
