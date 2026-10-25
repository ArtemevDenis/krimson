"""Touch moments -> suggested actions for our team, using volleyball structure:
serve, then per possession: first touch (reception after a serve, otherwise dig), set, attack;
a touch at the net right after the opponent's attack is a block and doesn't count as a team touch."""

from dataclasses import dataclass

import numpy as np

from app.cv.detection import Frame
from app.cv.geometry import COURT_LENGTH, COURT_WIDTH, NET_Y, Court, court_at
from app.cv.params import DEFAULT_PARAMS, AnalyzerParams
from app.cv.tracking import Touch

REACH_UP = 0.35  # extend a person box upward by this share of its height: hands above the head
SIDELINE_MARGIN = 1.5
BASELINE_MARGIN = 5.0  # servers and deep defenders stand well behind the baseline
FRONT_ZONE = 3.0


@dataclass(frozen=True)
class PlacedTouch:
    t: float
    ball: tuple[float, float]
    side: str | None  # us / them
    court_y: float | None  # player's feet along the court, meters from our baseline
    player_box: tuple[float, float, float, float] | None
    kind: str


@dataclass(frozen=True)
class SuggestedAction:
    t: float
    skill: str
    confidence: float
    ball: tuple[float, float]
    player_box: tuple[float, float, float, float] | None


def _box_distance(box: np.ndarray, x: float, y: float) -> float:
    x1, y1, x2, y2 = box[:4]
    y1 = y1 - (y2 - y1) * REACH_UP
    dx = max(x1 - x, 0.0, x - x2)
    dy = max(y1 - y, 0.0, y - y2)
    return float(np.hypot(dx, dy))


def _on_court(court: Court, box: np.ndarray) -> tuple[bool, float]:
    feet = np.array([(box[0] + box[2]) / 2, box[3]])
    cx, cy = court.court_xy(feet)[0]
    inside = -SIDELINE_MARGIN <= cx <= COURT_WIDTH + SIDELINE_MARGIN and -BASELINE_MARGIN <= cy <= COURT_LENGTH + BASELINE_MARGIN
    return inside, float(cy)


def place_touches(
    touches: list[Touch], frames: list[Frame], courts: list[Court], p: AnalyzerParams = DEFAULT_PARAMS
) -> list[PlacedTouch]:
    """Assigns each touch to the nearest player standing on (or around) the court."""
    times = np.array([f.t for f in frames])
    placed = []
    for touch in touches:
        frame = frames[int(np.abs(times - touch.t).argmin())] if len(frames) else None
        court = court_at(courts, touch.t)
        best: tuple[float, np.ndarray, float] | None = None
        if frame is not None and court is not None:
            for box in frame.persons:
                inside, cy = _on_court(court, box)
                if not inside:
                    continue
                d = _box_distance(box, touch.x, touch.y)
                if d <= p.max_person_dist and (best is None or d < best[0]):
                    best = (d, box, cy)
        if best is None:
            placed.append(PlacedTouch(touch.t, (touch.x, touch.y), None, None, None, touch.kind))
        else:
            _, box, cy = best
            placed.append(PlacedTouch(
                touch.t, (touch.x, touch.y), "us" if cy < NET_Y else "them", cy,
                tuple(float(v) for v in box[:4]), touch.kind,  # type: ignore[arg-type]
            ))
    return placed


SERVE_BEHIND = 0.3


def serve_checker(frames: list[Frame], courts: list[Court], p: AnalyzerParams = DEFAULT_PARAMS):
    """A flight is a serve if it starts at a player standing behind a baseline."""
    def is_serve(track) -> bool:
        placed = place_touches([Touch(track.start, track.x[0], track.y[0], "start")], frames, courts, p)[0]
        return placed.court_y is not None and (placed.court_y < -SERVE_BEHIND or placed.court_y > COURT_LENGTH + SERVE_BEHIND)
    return is_serve


def _possessions(touches: list[PlacedTouch]) -> list[list[PlacedTouch]]:
    groups: list[list[PlacedTouch]] = []
    for t in touches:
        side = t.side
        if side is None and groups:
            groups[-1].append(t)  # unknown side: most likely the same team kept the ball
            continue
        if groups and groups[-1][0].side == side:
            groups[-1].append(t)
        else:
            groups.append([t])
    return groups


def infer_actions(touches: list[PlacedTouch], p: AnalyzerParams = DEFAULT_PARAMS) -> list[SuggestedAction]:
    """Suggestions for one rally, only for our side."""
    known = [t for t in touches if t.side is not None]
    if not known:
        return []
    out: list[SuggestedAction] = []

    def suggest(t: PlacedTouch, skill: str, conf: float, with_box: bool = True) -> None:
        box = t.player_box if with_box else None
        out.append(SuggestedAction(t.t, skill, round(conf * (1.0 if t.side else 0.6), 2), t.ball, box))

    groups = _possessions(touches[touches.index(known[0]):])
    serve_group = groups[0]
    server = serve_group[0]
    behind_baseline = server.court_y is not None and (server.court_y < 0.5 or server.court_y > COURT_LENGTH - 0.5)
    if server.side == "us":
        # The server is often outside the frame: then the nearest person is a teammate on the court, and his box
        # under the server's number would teach the player classifier the wrong person
        suggest(server, "S", 0.8 if behind_baseline else 0.5, with_box=behind_baseline)
    prev_last: PlacedTouch = server
    prev_was_serve = True

    # Extra touches on the serving side before the ball crosses are the toss/serve split in two — skip them
    for group in groups[1:]:
        side = group[0].side
        team = list(group)
        if side == "us":
            first = team[0]
            near_net = first.court_y is not None and first.court_y >= NET_Y - FRONT_ZONE
            if not prev_was_serve and first.t - prev_last.t <= p.block_window and near_net:
                suggest(first, "B", 0.6)
                team = team[1:]
            for i, t in enumerate(team):
                n = len(team)
                if i == 0:
                    skill = "R" if prev_was_serve else "D"
                    conf = 0.75 if prev_was_serve else 0.55
                    if n == 1:
                        conf -= 0.1
                elif i == n - 1:
                    skill, conf = "A", 0.65
                elif i == n - 2:
                    skill, conf = "E", 0.65
                else:
                    skill, conf = "D", 0.3
                suggest(t, skill, conf)
        prev_last = group[-1]
        prev_was_serve = False
    return sorted(out, key=lambda a: a.t)
