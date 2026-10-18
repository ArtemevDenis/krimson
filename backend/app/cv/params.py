"""Tunable thresholds of the heuristic analyzer. Defaults are hand-picked; `learning.tune` fits them to the
user's verified sets per hall and stores them as versions in the model store (see app.cv.profile)."""

from dataclasses import dataclass, replace


@dataclass(frozen=True)
class AnalyzerParams:
    # ball tracking
    max_gap: float = 0.35  # seconds without a detection before a track ends
    max_speed: float = 2.5  # normalized frame widths per second
    start_conf: float = 0.2
    min_track_points: int = 4
    min_track_extent: float = 0.04
    # rallies
    merge_gap: float = 2.5  # ball out of sight this long during play is rare
    min_rally: float = 1.0
    lead: float = 1.0
    tail: float = 1.5
    long_flight_extent: float = 0.25  # a serve or an attack crosses a big part of the frame
    long_flight_seconds: float = 0.7
    # touches and actions
    touch_dedup: float = 0.35
    turn_angle_deg: float = 55.0
    min_turn_speed: float = 0.15
    max_person_dist: float = 0.04
    block_window: float = 0.8

    def with_values(self, **values) -> "AnalyzerParams":
        return replace(self, **values)


DEFAULT_PARAMS = AnalyzerParams()
