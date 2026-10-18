from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.domain.roster import POSITIONS, parse_roster
from app.models import Player, Team
from app.services.sets import get_or_404, team_players

router = APIRouter(prefix="/api", tags=["teams"])


class TeamIn(BaseModel):
    name: str


class PlayerIn(BaseModel):
    number: int | None = None
    name: str
    position: str = "OH"
    is_active: bool = True


class PlayerPatch(BaseModel):
    number: int | None = None
    name: str | None = None
    position: str | None = None
    is_active: bool | None = None


class RosterImport(BaseModel):
    text: str
    replace: bool = False


def _check_position(position: str | None) -> None:
    if position is not None and position not in POSITIONS:
        raise HTTPException(422, f"Амплуа должно быть одним из {POSITIONS}")


@router.get("/teams")
def list_teams(session: Session = Depends(get_session)) -> list[Team]:
    return list(session.exec(select(Team).order_by(Team.id)))


@router.post("/teams")
def create_team(body: TeamIn, session: Session = Depends(get_session)) -> Team:
    team = Team(name=body.name)
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


@router.patch("/teams/{team_id}")
def rename_team(team_id: int, body: TeamIn, session: Session = Depends(get_session)) -> Team:
    team = get_or_404(session, Team, team_id)
    team.name = body.name
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


@router.get("/teams/{team_id}/players")
def list_players(team_id: int, session: Session = Depends(get_session)) -> list[Player]:
    get_or_404(session, Team, team_id)
    return team_players(session, team_id)


@router.post("/teams/{team_id}/players")
def add_player(team_id: int, body: PlayerIn, session: Session = Depends(get_session)) -> Player:
    get_or_404(session, Team, team_id)
    _check_position(body.position)
    player = Player(team_id=team_id, **body.model_dump())
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


@router.post("/teams/{team_id}/players/import")
def import_players(team_id: int, body: RosterImport, session: Session = Depends(get_session)) -> list[Player]:
    """Existing players are matched by number and updated, so re-importing a list is safe."""
    get_or_404(session, Team, team_id)
    existing = {p.number: p for p in team_players(session, team_id) if p.number is not None}
    parsed = parse_roster(body.text)
    if body.replace:
        keep = {p.number for p in parsed}
        for number, player in existing.items():
            if number not in keep:
                player.is_active = False
                session.add(player)
    for item in parsed:
        player = existing.get(item.number) if item.number is not None else None
        if player is None:
            player = Player(team_id=team_id, number=item.number, name=item.name, position=item.position)
        else:
            player.name, player.position, player.is_active = item.name, item.position, True
        session.add(player)
    session.commit()
    return team_players(session, team_id)


@router.patch("/players/{player_id}")
def update_player(player_id: int, body: PlayerPatch, session: Session = Depends(get_session)) -> Player:
    player = get_or_404(session, Player, player_id)
    _check_position(body.position)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(player, k, v)
    session.add(player)
    session.commit()
    session.refresh(player)
    return player


@router.delete("/players/{player_id}", status_code=204)
def delete_player(player_id: int, session: Session = Depends(get_session)) -> None:
    session.delete(get_or_404(session, Player, player_id))
    session.commit()
