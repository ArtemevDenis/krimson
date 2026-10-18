import datetime as dt
from datetime import UTC, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _json_list() -> Column:
    return Column(JSON, nullable=False, default=list)


class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str


class Player(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key="team.id", ondelete="CASCADE", index=True)
    number: int | None = None
    name: str
    position: str = "OH"  # S / OH / OPP / MB / L
    is_active: bool = True


class Video(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    original_path: str
    proxy_path: str | None = None
    duration: float = 0
    fps: float = 0
    width: int = 0
    height: int = 0
    status: str = "pending"  # pending / processing / ready / failed
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Match(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key="team.id", ondelete="CASCADE", index=True)
    opponent: str
    date: dt.date
    venue: str | None = None
    notes: str | None = None


class GameSet(SQLModel, table=True):
    __tablename__ = "game_set"

    id: int | None = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", ondelete="CASCADE", index=True)
    number: int
    video_id: int | None = Field(default=None, foreign_key="video.id", ondelete="SET NULL")
    # player ids in zones 1..6 at the start of the set
    lineup: list[int] = Field(default_factory=list, sa_column=_json_list())
    libero_ids: list[int] = Field(default_factory=list, sa_column=_json_list())
    we_serve_first: bool = True


class Rally(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    set_id: int = Field(foreign_key="game_set.id", ondelete="CASCADE", index=True)
    index: int
    start_time: float | None = None
    end_time: float | None = None
    winner: str | None = None  # us / them
    # [{"out_id": int, "in_id": int}] applied before the rally
    substitutions: list[dict] = Field(default_factory=list, sa_column=_json_list())
    tags: list[str] = Field(default_factory=list, sa_column=_json_list())
    source: str = "manual"  # manual / auto
    note: str | None = None


class Action(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    rally_id: int = Field(foreign_key="rally.id", ondelete="CASCADE", index=True)
    order: int
    player_id: int | None = Field(default=None, foreign_key="player.id", ondelete="SET NULL")
    skill: str
    evaluation: str
    video_time: float | None = None


class Job(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    kind: str
    status: str = "queued"  # queued / running / done / failed
    progress: float = 0
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, default=dict))
    result: dict | None = Field(default=None, sa_column=Column(JSON))
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
