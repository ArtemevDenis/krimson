import datetime as dt
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from app.db import get_session
from app.domain import rotation
from app.domain.scouting import EVALUATIONS, FAULT_SKILL, FAULTS, SERVE_FAULTS, SKILLS, terminal_winner
from app.models import Action, GameSet, Match, Player, Rally, Suggestion, Team, Venue, Video
from app.services import jobs
from app.services.sets import get_or_404, load_rallies, replay_set, team_players, workspace

router = APIRouter(prefix="/api", tags=["matches"])


class MatchIn(BaseModel):
    team_id: int
    opponent: str
    date: dt.date
    venue_id: int | None = None
    venue: str | None = None
    notes: str | None = None


class MatchPatch(BaseModel):
    opponent: str | None = None
    date: dt.date | None = None
    venue_id: int | None = None
    venue: str | None = None
    notes: str | None = None
    archived: bool | None = None


class SetPatch(BaseModel):
    verified: bool | None = None
    number: int | None = None
    video_id: int | None = None
    lineup: list[int] | None = None
    lineup_roles: list[Literal["S", "OH", "OPP", "MB"]] | None = Field(default=None, min_length=6, max_length=6)
    libero_ids: list[int] | None = None
    we_serve_first: bool | None = None


class SubstitutionIn(BaseModel):
    out_id: int | None = None
    in_id: int | None = None
    kind: Literal["regular", "serve", "libero_out", "libero_in"] = "regular"
    role: Literal["S", "OH", "OPP", "MB"] | None = None

    @model_validator(mode="after")
    def _players_required(self) -> "SubstitutionIn":
        if self.kind in ("regular", "serve") and (self.out_id is None or self.in_id is None):
            raise ValueError("Для замены нужны оба игрока")
        return self


class RallyIn(BaseModel):
    start_time: float | None = None
    end_time: float | None = None
    winner: str | None = Field(default=None, pattern="^(us|them)$")
    substitutions: list[SubstitutionIn] = []
    tags: list[str] = []
    note: str | None = None


class RallyPatch(BaseModel):
    start_time: float | None = None
    end_time: float | None = None
    winner: str | None = Field(default=None, pattern="^(us|them)$")
    substitutions: list[SubstitutionIn] | None = None
    tags: list[str] | None = None
    note: str | None = None


class ActionIn(BaseModel):
    player_id: int | None = None
    skill: str
    evaluation: str
    fault: str | None = None
    video_time: float | None = None
    suggestion_id: int | None = None
    # The suggestion's box was on the wrong person: keep the precise time, but not the box (training data)
    drop_box: bool = False


class ActionPatch(BaseModel):
    player_id: int | None = None
    skill: str | None = None
    evaluation: str | None = None
    fault: str | None = None
    video_time: float | None = None


class AnalyzeIn(BaseModel):
    analyzer: str | None = None


class SuggestionPatch(BaseModel):
    status: str = Field(pattern="^(pending|accepted|rejected)$")


def _set_summary(session: Session, game_set: GameSet, players: list[Player]) -> dict:
    rallies = load_rallies(session, game_set.id)
    _, final = replay_set(game_set, players, rallies)
    return {
        **game_set.model_dump(),
        "our_score": final.our_score if final else 0,
        "their_score": final.their_score if final else 0,
        "rally_count": len(rallies),
        "configured": final is not None,
        "finished": rotation.is_set_finished(final.our_score, final.their_score, game_set.number) if final else False,
    }


def _match_summary(session: Session, match: Match) -> dict:
    players = team_players(session, match.team_id)
    sets = session.exec(select(GameSet).where(GameSet.match_id == match.id).order_by(GameSet.number)).all()
    summaries = [_set_summary(session, s, players) for s in sets]
    venue = session.get(Venue, match.venue_id) if match.venue_id else None
    return {
        **match.model_dump(mode="json"),
        "venue_name": venue.name if venue else match.venue,
        "sets": summaries,
        "sets_won": sum(1 for s in summaries if s["finished"] and s["our_score"] > s["their_score"]),
        "sets_lost": sum(1 for s in summaries if s["finished"] and s["our_score"] < s["their_score"]),
    }


def _validate_skill(skill: str | None, evaluation: str | None, fault: str | None = None) -> None:
    if skill is not None and skill not in SKILLS:
        raise HTTPException(422, f"Неизвестный элемент {skill}")
    if evaluation is not None and evaluation not in EVALUATIONS:
        raise HTTPException(422, f"Неизвестная оценка {evaluation}")
    if skill == FAULT_SKILL and (fault not in FAULTS or fault in SERVE_FAULTS or evaluation != "="):
        raise HTTPException(422, "Нарушение: нужен тип нарушения и оценка «=»")
    if fault is not None and skill != FAULT_SKILL and not (fault in SERVE_FAULTS and skill == "S" and evaluation == "="):
        raise HTTPException(422, "Тип нарушения указывается только для нарушения (или заступа на подаче, S=)")


def _validate_lineup(session: Session, game_set: GameSet, lineup: list[int] | None, liberos: list[int] | None) -> None:
    match = get_or_404(session, Match, game_set.match_id)
    roster = {p.id for p in team_players(session, match.team_id)}
    if lineup is not None:
        if len(lineup) != 6 or len(set(lineup)) != 6:
            raise HTTPException(422, "Расстановка — это 6 разных игроков")
        if not set(lineup) <= roster:
            raise HTTPException(422, "В расстановке игрок не из состава команды")
    if liberos is not None and not set(liberos) <= roster:
        raise HTTPException(422, "Либеро не из состава команды")


def _order_by_time(session: Session, set_id: int) -> None:
    """Rallies created by hand among auto-detected ones must land in video order, since the score replay
    runs in index order. Rallies without any time keep their relative position."""
    rallies = list(session.exec(select(Rally).where(Rally.set_id == set_id).order_by(Rally.index)))
    last_time = 0.0
    keyed = []
    for r in rallies:
        t = r.start_time if r.start_time is not None else r.end_time
        last_time = t if t is not None else last_time
        keyed.append((last_time, r.index, r))
    for i, (_, _, r) in enumerate(sorted(keyed, key=lambda k: (k[0], k[1]))):
        r.index = i
        session.add(r)


def _reindex(session: Session, set_id: int) -> None:
    for i, r in enumerate(session.exec(select(Rally).where(Rally.set_id == set_id).order_by(Rally.index))):
        r.index = i
        session.add(r)


# --- matches ---------------------------------------------------------------

@router.get("/matches")
def list_matches(team_id: int | None = None, session: Session = Depends(get_session)) -> list[dict]:
    query = select(Match).order_by(Match.date.desc(), Match.id.desc())
    if team_id is not None:
        query = query.where(Match.team_id == team_id)
    return [_match_summary(session, m) for m in session.exec(query)]


@router.post("/matches")
def create_match(body: MatchIn, session: Session = Depends(get_session)) -> dict:
    get_or_404(session, Team, body.team_id)
    match = Match(**body.model_dump())
    session.add(match)
    session.commit()
    session.refresh(match)
    return _match_summary(session, match)


@router.get("/matches/{match_id}")
def get_match(match_id: int, session: Session = Depends(get_session)) -> dict:
    return _match_summary(session, get_or_404(session, Match, match_id))


@router.patch("/matches/{match_id}")
def update_match(match_id: int, body: MatchPatch, session: Session = Depends(get_session)) -> dict:
    match = get_or_404(session, Match, match_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(match, k, v)
    session.add(match)
    session.commit()
    session.refresh(match)
    return _match_summary(session, match)


@router.delete("/matches/{match_id}", status_code=204)
def delete_match(match_id: int, session: Session = Depends(get_session)) -> None:
    session.delete(get_or_404(session, Match, match_id))
    session.commit()


# --- sets ------------------------------------------------------------------

@router.post("/matches/{match_id}/sets")
def create_set(match_id: int, session: Session = Depends(get_session)) -> dict:
    """A new set inherits the previous set's lineup, roles and libero as a starting point."""
    get_or_404(session, Match, match_id)
    previous = session.exec(
        select(GameSet).where(GameSet.match_id == match_id).order_by(GameSet.number.desc())
    ).first()
    game_set = GameSet(
        match_id=match_id,
        number=(previous.number + 1) if previous else 1,
        lineup=list(previous.lineup) if previous else [],
        lineup_roles=list(previous.lineup_roles) if previous and previous.lineup_roles else None,
        libero_ids=list(previous.libero_ids) if previous else [],
        we_serve_first=not previous.we_serve_first if previous else True,
    )
    session.add(game_set)
    session.commit()
    session.refresh(game_set)
    return workspace(session, game_set.id)


@router.get("/sets/{set_id}")
def get_set(set_id: int, session: Session = Depends(get_session)) -> dict:
    return workspace(session, set_id)


@router.patch("/sets/{set_id}")
def update_set(set_id: int, body: SetPatch, session: Session = Depends(get_session)) -> dict:
    game_set = get_or_404(session, GameSet, set_id)
    data = body.model_dump(exclude_unset=True)
    _validate_lineup(session, game_set, data.get("lineup"), data.get("libero_ids"))
    if data.get("video_id") is not None:
        get_or_404(session, Video, data["video_id"])
    for k, v in data.items():
        setattr(game_set, k, v)
    if "verified" in data:
        game_set.verified_at = datetime.now(UTC) if data["verified"] else None
    session.add(game_set)
    session.commit()
    return workspace(session, set_id)


@router.delete("/sets/{set_id}", status_code=204)
def delete_set(set_id: int, session: Session = Depends(get_session)) -> None:
    session.delete(get_or_404(session, GameSet, set_id))
    session.commit()


@router.post("/sets/{set_id}/clear")
def clear_set(set_id: int, session: Session = Depends(get_session)) -> dict:
    """Drops all rallies and actions but keeps the video, court calibration and lineup, so the set can be
    tagged again; reviewed CV suggestions go back to the review queue."""
    game_set = get_or_404(session, GameSet, set_id)
    for rally in session.exec(select(Rally).where(Rally.set_id == set_id)):
        session.delete(rally)
    for sg in session.exec(select(Suggestion).where(Suggestion.set_id == set_id, Suggestion.status != "pending")):
        sg.status = "pending"
        session.add(sg)
    game_set.verified, game_set.verified_at = False, None
    session.add(game_set)
    session.commit()
    return workspace(session, set_id)


@router.post("/sets/{set_id}/analyze")
def analyze_set(set_id: int, body: AnalyzeIn, session: Session = Depends(get_session)) -> dict:
    game_set = get_or_404(session, GameSet, set_id)
    if game_set.video_id is None:
        raise HTTPException(422, "Сначала привяжите видео к партии")
    job = jobs.submit(session, "analyze_set", {"set_id": set_id, "analyzer": body.analyzer})
    return job.model_dump(mode="json")


@router.patch("/suggestions/{suggestion_id}")
def update_suggestion(suggestion_id: int, body: SuggestionPatch, session: Session = Depends(get_session)) -> dict:
    suggestion = get_or_404(session, Suggestion, suggestion_id)
    suggestion.status = body.status
    session.add(suggestion)
    session.commit()
    return workspace(session, suggestion.set_id)


# --- rallies ---------------------------------------------------------------

@router.post("/sets/{set_id}/rallies")
def create_rally(set_id: int, body: RallyIn, session: Session = Depends(get_session)) -> dict:
    get_or_404(session, GameSet, set_id)
    last = session.exec(select(Rally).where(Rally.set_id == set_id).order_by(Rally.index.desc())).first()
    data = body.model_dump()
    rally = Rally(set_id=set_id, index=(last.index + 1) if last else 0, **data)
    session.add(rally)
    session.flush()
    _order_by_time(session, set_id)
    session.commit()
    return workspace(session, set_id)


@router.patch("/rallies/{rally_id}")
def update_rally(rally_id: int, body: RallyPatch, session: Session = Depends(get_session)) -> dict:
    rally = get_or_404(session, Rally, rally_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(rally, k, v)
    session.add(rally)
    session.commit()
    return workspace(session, rally.set_id)


@router.delete("/rallies/{rally_id}")
def delete_rally(rally_id: int, session: Session = Depends(get_session)) -> dict:
    rally = get_or_404(session, Rally, rally_id)
    set_id = rally.set_id
    session.delete(rally)
    session.flush()
    _reindex(session, set_id)
    session.commit()
    return workspace(session, set_id)


# --- actions ---------------------------------------------------------------

@router.post("/rallies/{rally_id}/actions")
def add_action(rally_id: int, body: ActionIn, session: Session = Depends(get_session)) -> dict:
    rally = get_or_404(session, Rally, rally_id)
    _validate_skill(body.skill, body.evaluation, body.fault)
    last = session.exec(select(Action).where(Action.rally_id == rally_id).order_by(Action.order.desc())).first()
    action = Action(rally_id=rally_id, order=(last.order + 1) if last else 0, **body.model_dump(exclude={"drop_box"}))
    if body.suggestion_id is not None and (suggestion := session.get(Suggestion, body.suggestion_id)):
        suggestion.status = "accepted"
        action.player_box = None if body.drop_box else suggestion.player_box
        session.add(suggestion)
    session.add(action)
    if rally.winner is None and (winner := terminal_winner(body.skill, body.evaluation)):
        rally.winner = winner
        # A code typed with the video rewound before the rally must not give it an end before its start
        if rally.end_time is None and body.video_time is not None and body.video_time >= (rally.start_time or 0):
            rally.end_time = body.video_time + 1.5
        session.add(rally)
    session.commit()
    return workspace(session, rally.set_id)


@router.patch("/actions/{action_id}")
def update_action(action_id: int, body: ActionPatch, session: Session = Depends(get_session)) -> dict:
    action = get_or_404(session, Action, action_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(action, k, v)
    if action.skill not in (FAULT_SKILL, "S") or action.evaluation != "=":
        action.fault = None
    _validate_skill(action.skill, action.evaluation, action.fault)
    session.add(action)
    rally = get_or_404(session, Rally, action.rally_id)
    session.commit()
    return workspace(session, rally.set_id)


@router.delete("/actions/{action_id}")
def delete_action(action_id: int, session: Session = Depends(get_session)) -> dict:
    action = get_or_404(session, Action, action_id)
    rally = get_or_404(session, Rally, action.rally_id)
    last = session.exec(select(Action).where(Action.rally_id == rally.id).order_by(Action.order.desc())).first()
    # The winner was most likely auto-set by this very action, so undoing it reopens the rally
    if last is not None and last.id == action.id and rally.winner == terminal_winner(action.skill, action.evaluation):
        rally.winner = None
        session.add(rally)
    session.delete(action)
    session.commit()
    return workspace(session, rally.set_id)
