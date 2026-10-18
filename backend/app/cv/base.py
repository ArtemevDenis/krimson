"""Contracts for the computer-vision stages.

Stage 2 plugs a real RallyDetector in (ball tracking + player motion + audio);
stage 3 adds ActionSuggester (player tracking + jersey OCR). The rest of the app
only depends on these protocols, so detectors can be swapped without touching the UI.
"""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

ProgressFn = Callable[[float], None]


@dataclass(frozen=True)
class RallySegment:
    start: float
    end: float
    confidence: float
    tags: tuple[str, ...] = ()  # e.g. ("emotion",) from audio peaks


@dataclass(frozen=True)
class CourtCalibration:
    """Pixel coordinates of the court in the proxy video, valid from `from_time` until the next one
    (the camera may be moved during a set)."""

    from_time: float
    corners: tuple[tuple[float, float], ...]  # 4 court corners
    net: tuple[tuple[float, float], tuple[float, float]]  # net top at both antennas


@dataclass(frozen=True)
class ActionSuggestion:
    time: float
    skill: str
    jersey_number: int | None
    confidence: float


class RallyDetector(Protocol):
    name: str

    def detect(self, video: Path, calibrations: list[CourtCalibration], progress: ProgressFn) -> list[RallySegment]: ...


class ActionSuggester(Protocol):
    name: str

    def suggest(self, video: Path, segment: RallySegment, progress: ProgressFn) -> list[ActionSuggestion]: ...
