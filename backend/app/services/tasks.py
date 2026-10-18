"""Job handlers. Imported once at startup so they register themselves."""

import re
from datetime import datetime
from pathlib import Path

from sqlmodel import Session, select

from app import config
from app.cv import registry
from app.db import engine
from app.models import GameSet, Rally, Video
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


@jobs.handler("detect_rallies")
def detect_rallies(payload: dict, progress: jobs.JobContext) -> dict:
    set_id = payload["set_id"]
    with Session(engine) as s:
        game_set = s.get(GameSet, set_id)
        video = s.get(Video, game_set.video_id) if game_set and game_set.video_id else None
        if video is None:
            raise ValueError("К партии не привязано видео")
        source = Path(video.proxy_path or video.original_path)

    segments = registry.rally_detector(payload.get("detector")).detect(source, [], progress)

    with Session(engine) as s:
        existing = list(s.exec(select(Rally).where(Rally.set_id == set_id)))
        taken = [(r.start_time, r.end_time) for r in existing if r.start_time is not None and r.end_time is not None]
        added = 0
        for seg in segments:
            if any(seg.start < e and seg.end > b for b, e in taken):
                continue
            s.add(Rally(set_id=set_id, index=0, start_time=seg.start, end_time=seg.end, tags=list(seg.tags), source="auto"))
            added += 1
        s.flush()
        rallies = list(s.exec(select(Rally).where(Rally.set_id == set_id)))
        rallies.sort(key=lambda r: (r.start_time if r.start_time is not None else float("inf"), r.index))
        for i, r in enumerate(rallies):
            r.index = i
            s.add(r)
        s.commit()
    return {"added": added, "detected": len(segments)}
