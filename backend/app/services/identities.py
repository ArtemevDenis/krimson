"""People tracks of a set with the lineup's names handed out: the data behind "who is who" on the video."""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from sqlmodel import Session, select

from app import config
from app.cv import detection, identity, people
from app.cv.geometry import Court
from app.models import CourtCalibration, GameSet, IgnoredPerson, Match, PlayerMark, Video
from app.services.sets import get_or_404, load_rallies, replay_set, team_players


@dataclass
class SetPeople:
    tracks: list[people.PersonTrack]
    identities: identity.Identities


_cache: dict[int, tuple[str, SetPeople]] = {}


def _contexts(session: Session, game_set: GameSet) -> list[identity.RallyContext]:
    match = get_or_404(session, Match, game_set.match_id)
    loaded = load_rallies(session, game_set.id)
    states, _ = replay_set(game_set, team_players(session, match.team_id), loaded)
    if states is None:
        return []
    contexts = []
    all_known = True  # every rally so far has a winner: the replayed rotation is the real one
    for st, (r, _) in zip(states, loaded):
        if r.start_time is not None and r.end_time is not None:
            middles = tuple(p for p, role in zip(st.lineup, st.lineup_roles) if role == "MB")
            contexts.append(identity.RallyContext(
                r.start_time, r.end_time, list(st.on_court), st.serving == "us",
                ordered=all_known,
                squad=tuple(dict.fromkeys([*st.lineup, *game_set.libero_ids[:1]])),
                middles=middles,
                libero=game_set.libero_ids[0] if game_set.libero_ids else None,
            ))
        all_known = all_known and r.winner is not None
    return contexts


def set_people(session: Session, set_id: int) -> SetPeople | None:
    """None when the set has no video, detections or court calibration yet. Recomputed only when the rallies, the
    lineup or the marks change: tracks are cached next to the video, identities in memory."""
    game_set = get_or_404(session, GameSet, set_id)
    video = session.get(Video, game_set.video_id) if game_set.video_id else None
    if video is None:
        return None
    cals = list(session.exec(select(CourtCalibration).where(CourtCalibration.video_id == video.id)))
    if not cals:
        return None
    courts = [Court.from_points(c.from_time, c.points) for c in cals]
    path = Path(video.original_path)
    found = detection.existing_sidecars(path, config.DATA_DIR / "cv")
    if not found:
        return None

    contexts = _contexts(session, game_set)
    marks = [(m.time, m.box, m.player_id) for m in session.exec(select(PlayerMark).where(PlayerMark.set_id == set_id))]
    ignored = [(i.time, i.box) for i in session.exec(select(IgnoredPerson).where(IgnoredPerson.set_id == set_id))]
    key = hashlib.md5(json.dumps([
        str(found[0]), found[0].stat().st_mtime, people.calibration_key(courts),
        [(c.start, c.end, c.on_court, c.our_serve, c.ordered, c.squad) for c in contexts], sorted(marks), sorted(ignored),
    ], default=str).encode()).hexdigest()
    cached = _cache.get(set_id)
    if cached and cached[0] == key:
        return cached[1]

    tracks = people.load_or_link(path, found[0], lambda: detection.load(found[0]).frames, courts)
    result = SetPeople(tracks, identity.solve(tracks, contexts, marks, courts, ignored))
    _cache[set_id] = (key, result)
    return result
