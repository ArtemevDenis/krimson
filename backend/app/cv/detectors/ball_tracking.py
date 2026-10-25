from pathlib import Path

from app import config
from app.cv import actions, audio, detection, rallies, tracking
from app.cv.base import ActionHint, AnalysisResult, CalibrationInput, ProgressFn
from app.cv.geometry import Court
from app.cv.params import DEFAULT_PARAMS, AnalyzerParams
from app.cv.profile import Profile, detection_settings

DETECTION_SHARE = 0.9  # progress budget: the YOLO pass dominates


class BallTrackingAnalyzer:
    """YOLO ball/person detection + trajectory heuristics + volleyball touch order,
    using the hall's (or general) fitted thresholds and models from the profile."""

    name = "ball-tracking"

    def analyze(self, video: Path, calibrations: list[CalibrationInput], profile: Profile, progress: ProgressFn) -> AnalysisResult:
        if not calibrations:
            raise ValueError("Сначала разметьте площадку (кнопка «Площадка»)")
        courts = [Court.from_points(c.from_time, c.points) for c in calibrations]
        det = detection.load_or_run(
            video, detection_settings(profile), lambda p: progress(p * DETECTION_SHARE), cache_dir=config.DATA_DIR / "cv"
        )
        frames = detection.with_persons(det.frames, detection.load_persons(video, config.DATA_DIR / "cv"))
        tones = audio.load_or_detect(video)
        result = analyze_detections(frames, courts, profile.params, tones)

        players_weights = profile.players_weights()
        if players_weights is not None:
            from app.cv.players import PlayerClassifier, label_hints

            result.actions = label_hints(
                video, result.actions, PlayerClassifier(players_weights),
                lambda p: progress(DETECTION_SHARE + p * (1 - DETECTION_SHARE)),
            )
        # The cache actually used may come from another detector version (e.g. computed on Windows)
        used = det.settings.tag or "stock"
        result.version = f"{self.name} {profile.describe()} cache={used} audio={'on' if tones is not None else 'off'}"
        return result


def analyze_detections(
    frames: list[detection.Frame], courts: list[Court], p: AnalyzerParams = DEFAULT_PARAMS, tones: list[audio.Tone] | None = None
) -> AnalysisResult:
    tracks = tracking.link_tracks(frames, p)
    return analyze_tracks(tracks, frames, courts, p, tones)


def analyze_tracks(
    tracks: list[tracking.Track],
    frames: list[detection.Frame],
    courts: list[Court],
    p: AnalyzerParams = DEFAULT_PARAMS,
    tones: list[audio.Tone] | None = None,
) -> AnalysisResult:
    """Split out so tuning can reuse tracks across trials that only change rally/touch thresholds.
    With the sound track's tones, referee whistles set the rally boundaries (see rallies.with_whistles)."""
    is_serve = actions.serve_checker(frames, courts, p) if courts else None
    segments = rallies.segment_rallies(tracks, is_serve, p)
    if tones:
        whistles = audio.classify(tones, p.whistle_start_db, p.whistle_end_db, p.whistle_min_seconds)
        segments = rallies.with_whistles(segments, whistles, p)
    touches = tracking.find_touches(tracks, p)

    hints: list[ActionHint] = []
    for seg in segments:
        inside = [t for t in touches if seg.start <= t.t <= seg.end]
        placed = actions.place_touches(inside, frames, courts, p)
        for s in actions.infer_actions(placed, p):
            hints.append(ActionHint(s.t, s.skill, s.confidence, s.ball, s.player_box))
    return AnalysisResult(rallies=segments, actions=hints)
