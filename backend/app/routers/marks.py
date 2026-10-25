"""Marking players on video frames: the people the detector found on a frame, and the user's "this is #N"."""

from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import config
from app.cv import detection
from app.db import get_session
from app.models import GameSet, IgnoredPerson, Match, Player, PlayerMark, Video
from app.services.sets import get_or_404

router = APIRouter(prefix="/api", tags=["marks"])

SAME_FRAME_SECONDS = 0.3  # marks this close in time are on the same moment
SAME_PERSON_IOU = 0.5


class IgnoreIn(BaseModel):
    time: float = Field(ge=0)
    box: list[float] = Field(min_length=4, max_length=4)


class MarkIn(BaseModel):
    time: float = Field(ge=0)
    box: list[float] = Field(min_length=4, max_length=4)
    player_id: int


@lru_cache(maxsize=4)
def _frames(path: str, _mtime: float) -> tuple[np.ndarray, list[detection.Frame]]:
    frames = detection.load(Path(path)).frames
    return np.array([f.t for f in frames]), frames


def _iou(a: list[float], b: list[float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _marks(session: Session, set_id: int) -> dict:
    marks = session.exec(select(PlayerMark).where(PlayerMark.set_id == set_id).order_by(PlayerMark.time))
    ignored = session.exec(select(IgnoredPerson).where(IgnoredPerson.set_id == set_id).order_by(IgnoredPerson.time))
    return {"marks": [m.model_dump(mode="json") for m in marks], "ignored": [i.model_dump(mode="json") for i in ignored]}


def _drop_same_person(session: Session, set_id: int, time: float, box: list[float], player_id: int | None = None) -> None:
    """A person on a frame is either one player or "not ours": a new mark replaces whatever was said about him."""
    window = (time - SAME_FRAME_SECONDS, time + SAME_FRAME_SECONDS)
    for old in session.exec(select(PlayerMark).where(PlayerMark.set_id == set_id, PlayerMark.time.between(*window))):
        if (player_id is not None and old.player_id == player_id) or _iou(old.box, box) >= SAME_PERSON_IOU:
            session.delete(old)
    for old in session.exec(select(IgnoredPerson).where(IgnoredPerson.set_id == set_id, IgnoredPerson.time.between(*window))):
        if _iou(old.box, box) >= SAME_PERSON_IOU:
            session.delete(old)


@router.get("/sets/{set_id}/persons")
def persons_at(set_id: int, time: float, session: Session = Depends(get_session)) -> dict:
    """People detected on the frame nearest to `time` (from the cached detections, nothing is recomputed)."""
    game_set = get_or_404(session, GameSet, set_id)
    video = session.get(Video, game_set.video_id) if game_set.video_id else None
    if video is None:
        raise HTTPException(422, "К партии не привязано видео")
    found = detection.existing_sidecars(Path(video.original_path), config.DATA_DIR / "cv")
    if not found:
        raise HTTPException(404, "Для этого видео ещё нет детекций — запустите авторазметку или предрасчёт")
    times, frames = _frames(str(found[0]), found[0].stat().st_mtime)
    if not frames:
        return {"time": time, "persons": []}
    frame = frames[int(np.abs(times - time).argmin())]
    return {
        "time": round(frame.t, 3),
        "persons": [{"box": [round(float(v), 4) for v in p[:4]], "conf": round(float(p[4]), 2)} for p in frame.persons],
    }


@router.get("/sets/{set_id}/player-marks")
def list_marks(set_id: int, session: Session = Depends(get_session)) -> dict:
    get_or_404(session, GameSet, set_id)
    return _marks(session, set_id)


@router.post("/sets/{set_id}/player-marks")
def add_mark(set_id: int, body: MarkIn, session: Session = Depends(get_session)) -> dict:
    """On one frame a person is one player and a player is one person: re-marking replaces the old mark."""
    game_set = get_or_404(session, GameSet, set_id)
    match = get_or_404(session, Match, game_set.match_id)
    player = get_or_404(session, Player, body.player_id)
    if player.team_id != match.team_id:
        raise HTTPException(422, "Игрок не из этой команды")
    _drop_same_person(session, set_id, body.time, body.box, body.player_id)
    session.add(PlayerMark(set_id=set_id, player_id=body.player_id, time=body.time, box=body.box))
    session.commit()
    return _marks(session, set_id)


@router.post("/sets/{set_id}/player-marks/batch")
def add_marks(set_id: int, body: list[MarkIn], session: Session = Depends(get_session)) -> dict:
    """Several marks at once: "all names on this frame are right" in the players pass."""
    game_set = get_or_404(session, GameSet, set_id)
    match = get_or_404(session, Match, game_set.match_id)
    for mark in body:
        player = get_or_404(session, Player, mark.player_id)
        if player.team_id != match.team_id:
            raise HTTPException(422, "Игрок не из этой команды")
        _drop_same_person(session, set_id, mark.time, mark.box, mark.player_id)
        session.add(PlayerMark(set_id=set_id, player_id=mark.player_id, time=mark.time, box=mark.box))
        session.flush()
    session.commit()
    return _marks(session, set_id)


@router.post("/sets/{set_id}/ignored")
def ignore_person(set_id: int, body: IgnoreIn, session: Session = Depends(get_session)) -> dict:
    get_or_404(session, GameSet, set_id)
    _drop_same_person(session, set_id, body.time, body.box)
    session.add(IgnoredPerson(set_id=set_id, time=body.time, box=body.box))
    session.commit()
    return _marks(session, set_id)


@router.delete("/ignored/{ignore_id}")
def unignore_person(ignore_id: int, session: Session = Depends(get_session)) -> dict:
    row = get_or_404(session, IgnoredPerson, ignore_id)
    set_id = row.set_id
    session.delete(row)
    session.commit()
    return _marks(session, set_id)


@router.delete("/player-marks/{mark_id}")
def delete_mark(mark_id: int, session: Session = Depends(get_session)) -> dict:
    mark = get_or_404(session, PlayerMark, mark_id)
    set_id = mark.set_id
    session.delete(mark)
    session.commit()
    return _marks(session, set_id)


PEOPLE_STEP_SECONDS = 0.13  # ~7.5 frames per second is smooth enough for labels over the video
# Where an unnamed person is worth asking about: our court and just behind our baseline (court meters)
OUR_AREA_X = (-0.5, 9.5)
OUR_AREA_Y = (-3.0, 9.0)


@router.get("/sets/{set_id}/people")
def people_between(set_id: int, start: float, end: float, session: Session = Depends(get_session)) -> dict:
    """Our named players frame by frame in [start, end]: box, name, confidence, and whether the user's mark backs it."""
    from app.services.identities import set_people

    if end - start > 120:
        raise HTTPException(422, "Слишком длинный отрезок: не больше 2 минут")
    found = set_people(session, set_id)
    if found is None:
        return {"available": False, "frames": []}
    by_time: dict[float, list[dict]] = {}
    for tr in found.tracks:
        if tr.end < start or tr.start > end:
            continue
        if tr.id in found.identities.ignored:
            continue
        last = -1.0
        for t, box, (cx, cy) in zip(tr.t, tr.boxes, tr.court):
            if t < start or t > end or t - last < PEOPLE_STEP_SECONDS:
                continue
            naming = found.identities.at(tr.id, t)
            slot = round(round(t / PEOPLE_STEP_SECONDS) * PEOPLE_STEP_SECONDS, 2)
            if naming is None:
                # Someone on our half nobody has named: the UI can stop and ask who it is
                if OUR_AREA_X[0] <= cx <= OUR_AREA_X[1] and OUR_AREA_Y[0] <= cy <= OUR_AREA_Y[1]:
                    last = t
                    by_time.setdefault(slot, []).append({
                        "track": tr.id, "box": box, "player_id": None, "confidence": 0.0, "confirmed": False,
                        "_rank": (False, False, -1.0),
                    })
                continue
            last = t
            inside = naming.start - 1.0 <= t <= naming.end + 1.0
            by_time.setdefault(slot, []).append({
                "track": tr.id, "box": box, "player_id": naming.player_id,
                "confidence": naming.confidence, "confirmed": naming.confirmed, "_rank": (inside, naming.confirmed, naming.confidence),
            })
    frames = []
    for t in sorted(by_time):
        # A name carried over from another rally may clash with the one handed out here: one person per name
        best: dict[int, dict] = {}
        unknown = []
        for p in by_time[t]:
            if p["player_id"] is None:
                unknown.append(p)
            elif p["player_id"] not in best or p["_rank"] > best[p["player_id"]]["_rank"]:
                best[p["player_id"]] = p
        people = [*best.values(), *unknown]
        frames.append({"t": t, "people": [{k: v for k, v in p.items() if k != "_rank"} for p in people]})
    return {"available": True, "frames": frames}
