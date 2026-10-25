"""Job handlers. Imported once at startup so they register themselves."""

import re
from datetime import datetime
from pathlib import Path

from sqlmodel import Session, select

from app import config
from app.cv import registry
from app.cv.base import CalibrationInput
from app.cv.profile import resolve
from app.db import engine
from app.models import Action, CourtCalibration, GameSet, Match, Rally, Suggestion, Team, Venue, Video
from app.services import jobs, media


@jobs.handler("proxy")
def build_proxy(payload: dict, progress: jobs.JobContext) -> dict:
    video_id = payload["video_id"]
    with Session(engine) as s:
        video = s.get(Video, video_id)
        assert video is not None
        source, duration = Path(video.original_path), video.duration
        video.status = "processing"
        s.add(video)
        s.commit()

    target = config.PROXIES_DIR / f"video_{video_id}.mp4"
    try:
        media.make_proxy(source, target, duration, progress)
    except Exception as exc:
        with Session(engine) as s:
            video = s.get(Video, video_id)
            video.status, video.error = "failed", str(exc)[:2000]
            s.add(video)
            s.commit()
        raise

    with Session(engine) as s:
        video = s.get(Video, video_id)
        video.proxy_path, video.status, video.error = str(target), "ready", None
        s.add(video)
        s.commit()
    return {"proxy_path": str(target)}


def _slug(title: str) -> str:
    return re.sub(r"[^\w\-]+", "_", title, flags=re.UNICODE).strip("_")[:60] or "highlights"


@jobs.handler("export_highlights")
def export_highlights(payload: dict, progress: jobs.JobContext) -> dict:
    pre, post = float(payload.get("pre", 2.0)), float(payload.get("post", 2.0))
    with Session(engine) as s:
        videos = {v.id: v for v in s.exec(select(Video).where(Video.id.in_({i["video_id"] for i in payload["items"]})))}
    segments = []
    for item in payload["items"]:
        video = videos[item["video_id"]]
        start = max(0.0, item["start"] - pre)
        end = min(video.duration or item["end"] + post, item["end"] + post)
        segments.append(media.Segment(Path(video.original_path), start, end))

    name = f"{_slug(payload.get('title', 'highlights'))}_{datetime.now():%Y%m%d_%H%M%S}.mp4"
    media.export_reel(segments, config.EXPORTS_DIR / name, progress)
    return {"file": name, "url": f"/api/exports/{name}"}


def store_auto_rallies(s: Session, set_id: int, segments) -> int:
    """Replaces the untouched auto rallies with new ones; rallies the user tagged or edited stay, and a found
    rally overlapping one of them is dropped. Keeps the set's rallies in video order."""
    rallies = list(s.exec(select(Rally).where(Rally.set_id == set_id)))
    with_actions = set(s.exec(select(Action.rally_id).where(Action.rally_id.in_([r.id for r in rallies])))) if rallies else set()
    for r in rallies:
        if r.source == "auto" and r.winner is None and r.id not in with_actions and not r.tags:
            s.delete(r)
    s.flush()
    kept = list(s.exec(select(Rally).where(Rally.set_id == set_id)))
    taken = [(r.start_time, r.end_time) for r in kept if r.start_time is not None and r.end_time is not None]
    added = 0
    for seg in segments:
        if any(seg.start < e and seg.end > b for b, e in taken):
            continue
        s.add(Rally(set_id=set_id, index=0, start_time=seg.start, end_time=seg.end, tags=list(seg.tags), source="auto",
                    confidence=seg.confidence))
        added += 1
    s.flush()
    ordered = list(s.exec(select(Rally).where(Rally.set_id == set_id)))
    ordered.sort(key=lambda r: (r.start_time if r.start_time is not None else float("inf"), r.index))
    for i, r in enumerate(ordered):
        r.index = i
        s.add(r)
    return added


from app.services.pipeline import SURE_RALLY  # noqa: E402  whistle rallies with an end whistle are sure

AUDIO_ONLY_END_DB = 36.0


def _set_source(set_id: int):
    with Session(engine) as s:
        game_set = s.get(GameSet, set_id)
        video = s.get(Video, game_set.video_id) if game_set and game_set.video_id else None
        if video is None:
            raise ValueError("К партии не привязано видео")
        match = s.get(Match, game_set.match_id)
        venue = s.get(Venue, match.venue_id) if match and match.venue_id else None
        team = s.get(Team, match.team_id) if match else None
        return Path(video.original_path), resolve(venue.slug if venue else None, team.slug if team else None)


@jobs.handler("find_rallies")
def find_rallies(payload: dict, progress: jobs.JobContext) -> dict:
    """Rallies from the referee's whistles alone: seconds, before any detection. A serve whistle starts a rally;
    it ends at the end whistle when one is heard (sure), else after the usual rally length (to check)."""
    from app.cv import audio, rallies

    set_id = payload["set_id"]
    source, profile = _set_source(set_id)
    progress(0.1)
    tones = audio.load_or_detect(source)
    if tones is None:
        raise ValueError("Не удалось прочитать звук видео (нужен ffmpeg)")
    # Without the ball the end whistle is the only end signal, so a softer one counts too (with the ball, the tuned
    # threshold can afford to be strict: a missed end whistle falls back to where the ball rally ends)
    p = profile.params.with_values(whistle_without_ball=True, whistle_end_db=min(profile.params.whistle_end_db, AUDIO_ONLY_END_DB))
    whistles = audio.classify(tones, p.whistle_start_db, p.whistle_end_db, p.whistle_min_seconds)
    segments = rallies.with_whistles([], whistles, p)
    progress(0.8)
    with Session(engine) as s:
        added = store_auto_rallies(s, set_id, segments)
        s.commit()
    return {
        "found": len(segments), "added": added,
        "sure": sum(seg.confidence >= SURE_RALLY for seg in segments),
        "profile": profile.describe(),
    }


@jobs.handler("detect_persons")
def detect_persons(payload: dict, progress: jobs.JobContext) -> dict:
    """The people pass on this machine (small stock model, 7.5 frames per second)."""
    from app.cv import detection

    source, _ = _set_source(payload["set_id"])
    path = detection.run_persons(source, progress, config.DATA_DIR / "cv")
    return {"file": path.name}


@jobs.handler("analyze_set")
def analyze_set(payload: dict, progress: jobs.JobContext) -> dict:
    """Runs the CV analyzer and stores auto rallies + pending action suggestions.
    Re-running replaces untouched auto rallies and pending suggestions; anything the user edited is kept."""
    set_id = payload["set_id"]
    with Session(engine) as s:
        game_set = s.get(GameSet, set_id)
        video = s.get(Video, game_set.video_id) if game_set and game_set.video_id else None
        if video is None:
            raise ValueError("К партии не привязано видео")
        source = Path(video.original_path)
        match = s.get(Match, game_set.match_id)
        venue = s.get(Venue, match.venue_id) if match and match.venue_id else None
        team = s.get(Team, match.team_id) if match else None
        profile = resolve(venue.slug if venue else None, team.slug if team else None)
        calibrations = [
            CalibrationInput(c.from_time, c.points)
            for c in s.exec(select(CourtCalibration).where(CourtCalibration.video_id == video.id))
        ]

    result = registry.analyzer(payload.get("analyzer")).analyze(source, calibrations, profile, progress)

    with Session(engine) as s:
        added = store_auto_rallies(s, set_id, result.rallies)
        for sg in s.exec(select(Suggestion).where(Suggestion.set_id == set_id, Suggestion.status == "pending")):
            s.delete(sg)
        for hint in result.actions:
            s.add(Suggestion(
                set_id=set_id, time=hint.time, skill=hint.skill, confidence=hint.confidence,
                ball=list(hint.ball), player_box=list(hint.player_box) if hint.player_box else None,
                player_id=hint.player_id, player_confidence=hint.player_confidence, analyzer=result.version or None,
            ))
        s.commit()
    return {
        "detected": len(result.rallies), "added": added, "suggestions": len(result.actions),
        "profile": profile.describe(), "venue": venue.name if venue else None,
    }
