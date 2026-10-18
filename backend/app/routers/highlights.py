from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import config
from app.db import get_session
from app.domain.highlights import HighlightRally, build_groups
from app.models import GameSet, Job, Match
from app.services import jobs
from app.services.sets import get_or_404, load_rallies, replay_set, team_players

router = APIRouter(prefix="/api", tags=["highlights"])


class ExportItem(BaseModel):
    video_id: int
    start: float
    end: float


class ExportIn(BaseModel):
    title: str = "highlights"
    items: list[ExportItem] = Field(min_length=1)
    pre: float = Field(default=2.0, ge=0, le=10)
    post: float = Field(default=2.0, ge=0, le=10)


@router.get("/highlights/matches/{match_id}")
def match_highlights(match_id: int, session: Session = Depends(get_session)) -> list[dict]:
    match = get_or_404(session, Match, match_id)
    players = team_players(session, match.team_id)
    rallies: list[HighlightRally] = []
    for game_set in session.exec(select(GameSet).where(GameSet.match_id == match_id).order_by(GameSet.number)):
        if game_set.video_id is None:
            continue
        loaded = load_rallies(session, game_set.id)
        states, _ = replay_set(game_set, players, loaded)
        for i, (rally, actions) in enumerate(loaded):
            if rally.start_time is None or rally.end_time is None:
                continue
            state = states[i] if states else None
            rallies.append(HighlightRally(
                rally_id=rally.id,
                set_id=game_set.id,
                set_number=game_set.number,
                video_id=game_set.video_id,
                start=rally.start_time,
                end=rally.end_time,
                score=f"{state.our_score}:{state.their_score}" if state else "",
                tags=list(rally.tags),
                actions=[(a.player_id, a.skill, a.evaluation) for a in actions],
            ))
    names = {p.id: f"#{p.number} {p.name}" if p.number is not None else p.name for p in players}
    return [asdict(g) for g in build_groups(rallies, names)]


@router.post("/highlights/export")
def export(body: ExportIn, session: Session = Depends(get_session)) -> Job:
    return jobs.submit(session, "export_highlights", body.model_dump())


@router.get("/exports/{name}")
def download_export(name: str) -> FileResponse:
    path = (config.EXPORTS_DIR / Path(name).name).resolve()
    if not path.is_file():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(path, media_type="video/mp4", filename=path.name)


@router.get("/jobs/{job_id}")
def get_job(job_id: int, session: Session = Depends(get_session)) -> Job:
    return get_or_404(session, Job, job_id)


@router.get("/jobs")
def list_jobs(active: bool = False, session: Session = Depends(get_session)) -> list[Job]:
    query = select(Job).order_by(Job.id.desc()).limit(50)
    if active:
        query = query.where(Job.status.in_(("queued", "running")))
    return list(session.exec(query))
