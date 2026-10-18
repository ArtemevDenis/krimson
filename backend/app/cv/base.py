"""Contract between the CV pipeline and the app: an Analyzer turns a video (+ court calibrations)
into rally segments and suggested actions. The app only depends on this module, so analyzers can be
swapped (heuristic now, trained models later) without touching the API or UI."""

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from app.cv.profile import Profile

ProgressFn = Callable[[float], None]


@dataclass(frozen=True)
class RallySegment:
    start: float
    end: float
    confidence: float
    tags: tuple[str, ...] = ()  # e.g. ("emotion",) from audio peaks


@dataclass(frozen=True)
class ActionHint:
    time: float
    skill: str
    confidence: float
    ball: tuple[float, float]  # normalized image position of the ball at the touch
    player_box: tuple[float, float, float, float] | None  # normalized x1, y1, x2, y2
    player_id: int | None = None  # from the player classifier, when one is trained
    player_confidence: float | None = None


@dataclass
class AnalysisResult:
    rallies: list[RallySegment] = field(default_factory=list)
    actions: list[ActionHint] = field(default_factory=list)
    version: str = ""  # analyzer + models used, stored with suggestions to compare runs


@dataclass(frozen=True)
class CalibrationInput:
    from_time: float
    points: list[list[float]]  # 6 normalized points, see cv.geometry.COURT_POINTS


class Analyzer(Protocol):
    name: str

    def analyze(self, video: Path, calibrations: list[CalibrationInput], profile: "Profile", progress: ProgressFn) -> AnalysisResult: ...
