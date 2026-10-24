import datetime as dt

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.domain import stats
from app.models import GameSet, Match, Team
from app.services.sets import get_or_404, stat_records, team_players

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _records_for_matches(session: Session, matches: list[Match], set_id: int | None = None) -> list[stats.RallyRecord]:
    records: list[stats.RallyRecord] = []
    for match in matches:
        players = team_players(session, match.team_id)
        query = select(GameSet).where(GameSet.match_id == match.id).order_by(GameSet.number)
        if set_id is not None:
            query = query.where(GameSet.id == set_id)
        for game_set in session.exec(query):
            records.extend(stat_records(session, game_set, players))
    return records


@router.get("/matches/{match_id}")
def match_stats(match_id: int, set_id: int | None = None, session: Session = Depends(get_session)) -> dict:
    match = get_or_404(session, Match, match_id)
    return {
        **stats.compute(_records_for_matches(session, [match], set_id)),
        "roster": [p.model_dump() for p in team_players(session, match.team_id)],
    }


@router.get("/teams/{team_id}")
def season_stats(
    team_id: int,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    session: Session = Depends(get_session),
) -> dict:
    get_or_404(session, Team, team_id)
    query = select(Match).where(Match.team_id == team_id, Match.archived == False)  # noqa: E712
    if date_from:
        query = query.where(Match.date >= date_from)
    if date_to:
        query = query.where(Match.date <= date_to)
    matches = list(session.exec(query.order_by(Match.date)))
    return {
        **stats.compute(_records_for_matches(session, matches)),
        "roster": [p.model_dump() for p in team_players(session, team_id)],
        "matches": len(matches),
    }
