import json
from dataclasses import dataclass
from datetime import UTC, datetime

from app.cv import tracking
from app.cv.base import ProgressFn
from app.cv.detection import Frame
from app.cv.detectors.ball_tracking import analyze_tracks
from app.cv.geometry import Court
from app import config
from app.cv.params import AnalyzerParams
from app.learning.groundtruth import GtSet
from app.learning.metrics import Score, score_set


@dataclass
class PreparedSet:
    """Detections loaded once; tracks cached per tracking-parameter combination during tuning."""

    gt: GtSet
    frames: list[Frame]
    courts: list[Court]
    tracks_cache: dict[tuple, list[tracking.Track]]

    def tracks(self, p: AnalyzerParams) -> list[tracking.Track]:
        key = (p.max_gap, p.max_speed, p.start_conf, p.min_track_points, p.min_track_extent)
        if key not in self.tracks_cache:
            self.tracks_cache[key] = tracking.link_tracks(self.frames, p)
        return self.tracks_cache[key]


def prepare(sets: list[GtSet], progress: ProgressFn) -> tuple[list[PreparedSet], list[str]]:
    ready, skipped = [], []
    for i, gt in enumerate(sets):
        if gt.detections is None:
            skipped.append(f"{gt.label}: нет детекций — запустите авторазметку или предрасчёт")
        elif not gt.calibrations:
            skipped.append(f"{gt.label}: не размечена площадка")
        elif not gt.rallies:
            skipped.append(f"{gt.label}: нет розыгрышей с началом и концом")
        else:
            courts = [Court.from_points(c.from_time, c.points) for c in gt.calibrations]
            ready.append(PreparedSet(gt, gt.load_frames(), courts, {}))
        progress((i + 1) / max(len(sets), 1))
    return ready, skipped


def score_prepared(ps: PreparedSet, p: AnalyzerParams) -> Score:
    result = analyze_tracks(ps.tracks(p), ps.frames, ps.courts, p)
    pred = [(r.start, r.end) for r in result.rallies]
    pred_skills = [[a.skill for a in result.actions if r.start <= a.time <= r.end] for r in result.rallies]
    gt = [(r.start, r.end) for r in ps.gt.rallies]
    gt_skills = [[a.skill for a in r.actions] for r in ps.gt.rallies]
    return score_set(pred, pred_skills, gt, gt_skills)


def evaluate(prepared: list[PreparedSet], p: AnalyzerParams) -> dict:
    total = Score()
    per_set = []
    for ps in prepared:
        s = score_prepared(ps, p)
        total.add(s)
        per_set.append({"set_id": ps.gt.set_id, "label": ps.gt.label, **s.summary()})
    return {"overall": total.summary(), "sets": per_set, "objective": round(total.objective(), 4)}


def _report_path(scope_tag: str):
    # Device-local: reports describe this machine's data, unlike the git-tracked model versions
    return config.DATA_DIR / "learning" / f"evaluation-{scope_tag}.json"


def save_report(scope_tag: str, report: dict) -> None:
    path = _report_path(scope_tag)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({**report, "at": datetime.now(UTC).isoformat()}, ensure_ascii=False, indent=2))


def last_report(scope_tag: str) -> dict | None:
    path = _report_path(scope_tag)
    return json.loads(path.read_text()) if path.is_file() else None
