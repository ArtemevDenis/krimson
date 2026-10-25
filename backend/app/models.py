import datetime as dt
from datetime import UTC, datetime

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _json_list() -> Column:
    return Column(JSON, nullable=False, default=list)


class Team(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    # Stable across renames and devices: links the team to its player models in models/team/<slug>
    slug: str | None = Field(default=None, index=True)


class Venue(SQLModel, table=True):
    """A hall. Each hall gets its own analyzer thresholds and ball detector (models/venue/<slug>)."""

    id: int | None = Field(default=None, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)


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
    venue: str | None = None  # legacy free text, superseded by venue_id
    venue_id: int | None = Field(default=None, foreign_key="venue.id", ondelete="SET NULL")
    notes: str | None = None
    # Kept with its tagging but left out of season stats (e.g. a trial tagging)
    archived: bool = False


class GameSet(SQLModel, table=True):
    __tablename__ = "game_set"

    id: int | None = Field(default=None, primary_key=True)
    match_id: int = Field(foreign_key="match.id", ondelete="CASCADE", index=True)
    number: int
    video_id: int | None = Field(default=None, foreign_key="video.id", ondelete="SET NULL")
    # player ids in zones 1..6 at the start of the set
    lineup: list[int] = Field(default_factory=list, sa_column=_json_list())
    libero_ids: list[int] = Field(default_factory=list, sa_column=_json_list())
    # Role of each starter in this set (aligned with lineup); empty = roster positions
    lineup_roles: list[str] | None = Field(default=None, sa_column=Column(JSON))
    we_serve_first: bool = True
    # Fully checked by the user: every rally and every touch of our team is tagged, so it can serve as
    # ground truth (anything untagged really didn't happen) for evaluating and training the analyzer
    verified: bool = False
    verified_at: datetime | None = None


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
    # Auto rallies: how sure the finder was (a serve whistle and an end whistle vs. a guess); None for manual ones
    confidence: float | None = None
    note: str | None = None


class Action(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    rally_id: int = Field(foreign_key="rally.id", ondelete="CASCADE", index=True)
    order: int
    player_id: int | None = Field(default=None, foreign_key="player.id", ondelete="SET NULL")
    skill: str
    evaluation: str
    fault: str | None = None  # kind of violation for skill N (see scouting.FAULTS)
    video_time: float | None = None
    # Training data: which CV suggestion this came from (skill may differ = a correction) and where the
    # player was on the frame; video_time is the exact touch moment when it came from a suggestion
    suggestion_id: int | None = None
    player_box: list[float] | None = Field(default=None, sa_column=Column(JSON))


class Job(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    kind: str
    status: str = "queued"  # queued / running / done / failed
    progress: float = 0
    payload: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False, default=dict))
    result: dict | None = Field(default=None, sa_column=Column(JSON))
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CourtCalibration(SQLModel, table=True):
    __tablename__ = "court_calibration"

    id: int | None = Field(default=None, primary_key=True)
    video_id: int = Field(foreign_key="video.id", ondelete="CASCADE", index=True)
    from_time: float = 0
    # 6 normalized [x, y]: our baseline L/R, far baseline R/L, center line L/R (see cv.geometry)
    points: list[list[float]] = Field(default_factory=list, sa_column=_json_list())


class PlayerMark(SQLModel, table=True):
    """The user's "this person is #N" on a video frame: ground truth for telling players apart."""

    __tablename__ = "player_mark"

    id: int | None = Field(default=None, primary_key=True)
    set_id: int = Field(foreign_key="game_set.id", ondelete="CASCADE", index=True)
    player_id: int = Field(foreign_key="player.id", ondelete="CASCADE", index=True)
    time: float  # the detection frame the box comes from
    # normalized x1, y1, x2, y2 of the detected person
    box: list[float] = Field(default_factory=list, sa_column=_json_list())
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class IgnoredPerson(SQLModel, table=True):
    """The user's "not one of ours" on a video frame (referee, coach, bench, an opponent at the net): the person's
    track gets no name and no more questions."""

    __tablename__ = "ignored_person"

    id: int | None = Field(default=None, primary_key=True)
    set_id: int = Field(foreign_key="game_set.id", ondelete="CASCADE", index=True)
    time: float
    box: list[float] = Field(default_factory=list, sa_column=_json_list())
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Suggestion(SQLModel, table=True):
    """A CV-proposed action of our team waiting for the user's confirmation."""

    id: int | None = Field(default=None, primary_key=True)
    set_id: int = Field(foreign_key="game_set.id", ondelete="CASCADE", index=True)
    time: float
    skill: str
    confidence: float = 0
    ball: list[float] = Field(default_factory=list, sa_column=_json_list())
    player_box: list[float] | None = Field(default=None, sa_column=Column(JSON))
    player_id: int | None = None  # predicted by the player classifier, if one is trained
    player_confidence: float | None = None
    analyzer: str | None = None  # analyzer name + model versions, to compare runs
    status: str = "pending"  # pending / accepted / rejected
