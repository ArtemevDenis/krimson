"""Verified sets as ground truth: every rally and every touch of our team is tagged there."""

from dataclasses import dataclass, field
from pathlib import Path

from sqlmodel import Session, select

from app import config
from app.cv import detection
from app.cv.base import CalibrationInput
from app.domain.scouting import FAULT_SKILL
from app.models import Action, CourtCalibration, GameSet, Match, Rally, Suggestion, Team, Venue, Video


@dataclass(frozen=True)
class GtAction:
    action_id: int
    time: float | None
    skill: str
    player_id: int | None
    precise: bool  # time is the exact touch (came from a suggestion), not the moment Enter was pressed
    player_box: list[float] | None


@dataclass
class GtRally:
    rally_id: int
    start: float
    end: float
    actions: list[GtAction] = field(default_factory=list)


@dataclass
class GtSet:
    set_id: int
    label: str
    video: Path
    calibrations: list[CalibrationInput]
    rallies: list[GtRally]
    detections: Path | None  # cached detections, if computed
    venue_slug: str | None
    team_slug: str | None

    def load_frames(self) -> list[detection.Frame]:
        assert self.detections is not None
        return detection.load(self.detections).frames


def load_verified(session: Session, venue_slug: str | None = None, team_slug: str | None = None) -> list[GtSet]:
    """All verified sets, or only those played in one hall / by one team."""
    sets = []
    for game_set in session.exec(select(GameSet).where(GameSet.verified == True).order_by(GameSet.id)):  # noqa: E712
        if game_set.video_id is None:
            continue
        video = session.get(Video, game_set.video_id)
        match = session.get(Match, game_set.match_id)
        if video is None or match is None:
            continue
        venue = session.get(Venue, match.venue_id) if match.venue_id else None
        team = session.get(Team, match.team_id)
        if venue_slug is not None and (venue is None or venue.slug != venue_slug):
            continue
        if team_slug is not None and (team is None or team.slug != team_slug):
            continue
        path = Path(video.original_path)
        cals = [
            CalibrationInput(c.from_time, c.points)
            for c in session.exec(select(CourtCalibration).where(CourtCalibration.video_id == video.id))
        ]
        rallies = []
        for r in session.exec(select(Rally).where(Rally.set_id == game_set.id).order_by(Rally.index)):
            if r.start_time is None or r.end_time is None:
                continue
            # Violations (skill N) are not ball touches, so the analyzer can't and shouldn't detect them
            acts = session.exec(
                select(Action).where(Action.rally_id == r.id, Action.skill != FAULT_SKILL).order_by(Action.order)
            ).all()
            rallies.append(GtRally(r.id, r.start_time, r.end_time, [
                # The analyzer can't tell a ball given over from an attack: both are the third touch over the net
                GtAction(a.id, a.video_time, "A" if a.skill == "G" else a.skill, a.player_id, a.suggestion_id is not None, a.player_box)
                for a in acts
            ]))
        caches = detection.existing_sidecars(path, config.DATA_DIR / "cv")
        sets.append(GtSet(
            game_set.id, f"{match.opponent} {match.date:%d.%m}, партия {game_set.number}" + (f" · {venue.name}" if venue else ""),
            path, cals, rallies, caches[0] if caches else None,
            venue.slug if venue else None, team.slug if team else None,
        ))
    return sets


def suggestion_stats(session: Session) -> dict:
    """How users treated past suggestions: accepted as is, accepted with another skill, rejected."""
    accepted = corrected = rejected = pending = 0
    for sg in session.exec(select(Suggestion)):
        if sg.status == "rejected":
            rejected += 1
        elif sg.status == "pending":
            pending += 1
        else:
            action = session.exec(select(Action).where(Action.suggestion_id == sg.id)).first()
            if action is not None and action.skill != sg.skill:
                corrected += 1
            else:
                accepted += 1
    return {"accepted": accepted, "corrected": corrected, "rejected": rejected, "pending": pending}
