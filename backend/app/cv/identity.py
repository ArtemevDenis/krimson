"""Who is who: hands the six names of each rally's lineup to the people tracks on our half.

The app already knows who is on the court in every rally (rotation, substitutions, the libero), so vision only has to
decide which box is which of those six. Each rally is solved as an assignment scored by:
  * the user's marks — hard: a marked track is that player, a track marked as someone else can't be;
  * the overlap rule at the serve — front row nearer the net than the back row, 4-3-2 / 5-6-1 left to right;
  * continuity — a track keeps the name it had in the previous rally;
  * people inside our court lines must be ours, and a missing player is expected only for our server (often outside
    the frame behind the baseline).
All assignments of the six names to the candidate tracks are enumerated at once with numpy, so a set solves in seconds.
"""

from dataclasses import dataclass, field
from functools import lru_cache
from itertools import product

import numpy as np

from app.cv.geometry import COURT_WIDTH, NET_Y, Court
from app.cv.people import PersonTrack

# Candidate area: our half and the free zone behind our baseline (servers), a little past the sidelines
AREA_X = (-2.0, COURT_WIDTH + 2.0)
AREA_Y = (-6.0, NET_Y + 0.2)  # past that the feet are the opponent's blockers
MAX_CANDIDATES = 8
MAX_CANDIDATES_UNORDERED = 7  # 7 names over 8 slots is ~2M assignments: the limit of comfortable enumeration
SERVE_WINDOW = (0.3, 1.8)  # seconds after the rally start: players stand in their zones for the serve

W_ZONE = 1.0  # per meter of overlap-rule violation
W_CONTINUITY = 3.0
W_UNSEEN = 4.0
W_UNSEEN_SERVER = 0.5
W_INSIDE_UNNAMED = 1.5
ZONE_TOLERANCE_M = 0.3
W_ZONE_SPOT = 0.1  # per meter from the zone's usual spot: only breaks ties the overlap rule leaves open
# Usual spots (x to our right, y from our baseline) by zone index 0..5 = zones 1..6
ZONE_SPOTS = np.array([[7.5, 2.0], [7.5, 7.5], [4.5, 7.5], [1.5, 7.5], [1.5, 2.0], [4.5, 2.5]])
MARK_IOU = 0.5
MARK_SECONDS = 0.15
NONE = -1  # slot: the player isn't visible

# Zone index in the lineup (0 = zone 1 ... 5 = zone 6): (front, back) columns and left-to-right rows
COLUMNS = ((3, 4), (2, 5), (1, 0))  # 4 over 5, 3 over 6, 2 over 1
FRONT_ROW = (3, 2, 1)  # 4, 3, 2 left to right
BACK_ROW = (4, 5, 0)  # 5, 6, 1 left to right


@dataclass(frozen=True)
class RallyContext:
    """What is known about our side in a rally. The rotation (who stands in which zone) comes from the score, so it
    is only trusted once every rally before this one has a winner: until the set is tagged, only the squad is known."""

    start: float
    end: float
    on_court: list[int]  # player ids by zone (zone 1 first), the libero in the place of the player he replaced
    our_serve: bool
    ordered: bool = True  # the zones above are reliable
    squad: tuple[int, ...] = ()  # without the zones: the six of the lineup (after substitutions) and the libero
    middles: tuple[int, ...] = ()  # the libero replaces one of these, never shares the court with both
    libero: int | None = None

    def names(self) -> list[int]:
        return list(self.on_court) if self.ordered else list(self.squad)


@dataclass
class Naming:
    track_id: int
    player_id: int
    start: float
    end: float
    confidence: float
    confirmed: bool  # the user marked this track


@dataclass
class Identities:
    namings: list[Naming] = field(default_factory=list)
    labels: dict[int, int] = field(default_factory=dict)  # track id -> marked player
    ignored: set[int] = field(default_factory=set)  # tracks marked "not one of ours"

    def at(self, track_id: int, t: float) -> Naming | None:
        """The name the track carries at `t`: from the rally around it, otherwise the nearest rally's (a player
        walking between rallies is still the same track, so he keeps his name)."""
        own = [n for n in self.namings if n.track_id == track_id]
        if not own:
            return None
        inside = [n for n in own if n.start - 1.0 <= t <= n.end + 1.0]
        if inside:
            return inside[0]
        return min(own, key=lambda n: min(abs(t - n.start), abs(t - n.end)))


def rightward_sign(court: Court) -> float:
    """+1 if court x grows to our right (standing at our baseline, facing the net), -1 if the calibration is mirrored.
    The camera is always above the floor, so a true (unmirrored) mapping flips orientation against the image's
    downward y: the sign of the Jacobian determinant tells the two apart."""
    centre = court.image_points.mean(axis=0)
    eps = 1e-3
    base = court.court_xy(centre)[0]
    du = court.court_xy(centre + [eps, 0])[0] - base
    dv = court.court_xy(centre + [0, eps])[0] - base
    det = du[0] * dv[1] - du[1] * dv[0]
    return 1.0 if det < 0 else -1.0


def track_of(tracks: list[PersonTrack], t: float, box: list[float]) -> PersonTrack | None:
    """The track whose box at `t` is the given one (a mark made on a frame of detections)."""
    from app.cv.people import _iou

    best, best_iou = None, MARK_IOU
    for tr in tracks:
        i = tr.at(t)
        if i is None or abs(tr.t[i] - t) > MARK_SECONDS:
            continue
        overlap = _iou(tr.boxes[i], box)
        if overlap >= best_iou:
            best, best_iou = tr, overlap
    return best


def _mark_labels(tracks: list[PersonTrack], marks: list[tuple[float, list[float], int]]) -> dict[int, int]:
    labels: dict[int, int] = {}
    for t, box, player in marks:
        tr = track_of(tracks, t, box)
        if tr is not None:
            labels[tr.id] = player
    return labels


@lru_cache(maxsize=None)
def _assignments(n_candidates: int, n_names: int = 6) -> np.ndarray:
    """Every way to give the names a candidate track or "not visible", no track named twice."""
    options = np.array(list(product(range(-1, n_candidates), repeat=n_names)), dtype=np.int8)
    seen = options[:, :, None] == options[:, None, :]
    seen &= (options[:, :, None] != NONE)
    np.einsum("ijj->ij", seen)[:] = False  # a name equals itself
    return options[~seen.any(axis=(1, 2))].astype(np.int16)


def _in_area(p: np.ndarray) -> bool:
    return AREA_X[0] <= p[0] <= AREA_X[1] and AREA_Y[0] <= p[1] <= AREA_Y[1]


def _inside_court(p: np.ndarray) -> bool:
    return 0 <= p[0] <= COURT_WIDTH and 0 <= p[1] <= NET_Y


def solve(
    tracks: list[PersonTrack],
    rallies: list[RallyContext],
    marks: list[tuple[float, list[float], int]],
    courts: list[Court],
    ignored: list[tuple[float, list[float]]] = (),
) -> Identities:
    from app.cv.geometry import court_at

    labels = _mark_labels(tracks, marks)
    ignored_ids = {tr.id for t, box in ignored if (tr := track_of(tracks, t, box)) is not None} - set(labels)
    result = Identities(labels=labels, ignored=ignored_ids)
    previous: dict[int, int] = {}  # track id -> name in the previous rally
    for rally in rallies:
        names = rally.names()
        if len(names) < 6:
            continue
        cands = _candidates(tracks, rally, ignored_ids, MAX_CANDIDATES if rally.ordered else MAX_CANDIDATES_UNORDERED)
        if not cands:
            continue
        chosen = _assignments(len(cands), len(names))  # (A, names): candidate index per name, NONE if unseen
        court = court_at(courts, rally.start)
        sign = rightward_sign(court) if court is not None else 1.0
        score = _score(chosen, cands, names, rally, labels, previous, sign)

        best_i = int(np.argmin(score))
        if not np.isfinite(score[best_i]):
            continue
        best = chosen[best_i]

        def confidence_of(k: int) -> float:
            """How much worse the best assignment that gives this name another track is."""
            other = score[chosen[:, k] != best[k]]
            gap = float(other.min() - score[best_i]) if len(other) and np.isfinite(other.min()) else 10.0
            return round(1.0 - float(np.exp(-gap / 2.0)), 2)

        named: dict[int, int] = {}
        for k, ci in enumerate(best):
            if ci == NONE:
                continue
            tr = cands[ci][0]
            named[tr.id] = names[k]
            confirmed = labels.get(tr.id) == names[k]
            result.namings.append(Naming(
                tr.id, names[k], max(tr.start, rally.start), min(tr.end, rally.end),
                1.0 if confirmed else confidence_of(k), confirmed,
            ))
        previous = {**{tid: n for tid, n in previous.items() if tid not in named}, **named}
    return result


def _candidates(
    tracks: list[PersonTrack], rally: RallyContext, ignored_ids: set[int], limit: int
) -> list[tuple[PersonTrack, np.ndarray]]:
    cands: list[tuple[PersonTrack, np.ndarray]] = []
    for tr in tracks:
        if tr.end < rally.start or tr.start > rally.end or tr.id in ignored_ids:
            continue
        serve_pos = tr.position(rally.start + SERVE_WINDOW[0], rally.start + SERVE_WINDOW[1])
        pos = serve_pos if serve_pos is not None else tr.position(rally.start, rally.end)
        if pos is not None and _in_area(pos):
            cands.append((tr, pos))
    # Keep the ones present longest during the rally (a passer-by at the sideline is there a moment)
    cands.sort(key=lambda c: -(min(c[0].end, rally.end) - max(c[0].start, rally.start)))
    return cands[:limit]


def _score(
    chosen: np.ndarray,
    cands: list[tuple[PersonTrack, np.ndarray]],
    names: list[int],
    rally: RallyContext,
    labels: dict[int, int],
    previous: dict[int, int],
    sign: float,
) -> np.ndarray:
    score = np.zeros(len(chosen))
    visible = chosen != NONE

    # Marks: a labeled track must carry its own name; a track labeled as someone off the court can't be named
    for ci, (tr, _) in enumerate(cands):
        label = labels.get(tr.id)
        if label is None:
            continue
        has = chosen == ci
        for k, name in enumerate(names):
            if name != label:
                score[has[:, k]] = np.inf
        if label in names:
            score[~has[:, names.index(label)]] += 50.0  # strongly prefer naming it when the player is on court

    if rally.ordered:
        score += _zone_terms(chosen, visible, cands, rally, sign)
        for k in range(6):
            score[~visible[:, k]] += W_UNSEEN_SERVER if (k == 0 and rally.our_serve) else W_UNSEEN
    else:
        # Six on the court at most, and the libero never together with both middles
        score[visible.sum(axis=1) > 6] = np.inf
        group = [names.index(p) for p in (rally.libero, *rally.middles) if p in names]
        if rally.libero is not None and len(group) == 3:
            score[visible[:, group].all(axis=1)] = np.inf
        # One of the squad is off the court (the middle the libero replaced); beyond that, one more may be out of
        # sight (our server behind the baseline — who serves isn't known yet), more is unlikely
        expected = len(names) - 6
        extra = np.maximum(0, (~visible).sum(axis=1) - expected)
        score += np.where(extra >= 1, W_UNSEEN_SERVER, 0.0) + np.maximum(0, extra - 1) * W_UNSEEN

    # Continuity with the previous rally
    for ci, (tr, _) in enumerate(cands):
        before = previous.get(tr.id)
        if before is None:
            continue
        has = chosen == ci
        for k, name in enumerate(names):
            score[has[:, k]] += -W_CONTINUITY if name == before else W_CONTINUITY

    # Unnamed people inside our court
    for ci, (_, p) in enumerate(cands):
        if _inside_court(p):
            score[~(chosen == ci).any(axis=1)] += W_INSIDE_UNNAMED
    return score


def _zone_terms(chosen: np.ndarray, visible: np.ndarray, cands, rally: RallyContext, sign: float) -> np.ndarray:
    """Overlap rule at the serve (our server is exempt: he stands behind the baseline) and the usual zone spots."""
    pos = np.array([c[1] for c in cands])
    xr = pos[:, 0] * sign  # grows to our right
    y = pos[:, 1]
    score = np.zeros(len(chosen))

    def yv(k: int) -> np.ndarray:
        return np.where(visible[:, k], y[np.maximum(chosen[:, k], 0)], np.nan)

    def xv(k: int) -> np.ndarray:
        return np.where(visible[:, k], xr[np.maximum(chosen[:, k], 0)], np.nan)

    exempt = {0} if rally.our_serve else set()
    for front, back in COLUMNS:
        if front in exempt or back in exempt:
            continue
        score += W_ZONE * np.nan_to_num(np.maximum(0.0, yv(back) - yv(front) - ZONE_TOLERANCE_M))
    for row in (FRONT_ROW, BACK_ROW):
        for a, b in zip(row, row[1:]):
            if a in exempt or b in exempt:
                continue
            score += W_ZONE * np.nan_to_num(np.maximum(0.0, xv(a) - xv(b) - ZONE_TOLERANCE_M))
    xr_spot = np.where(sign > 0, ZONE_SPOTS[:, 0], -(COURT_WIDTH - ZONE_SPOTS[:, 0]))
    for k in range(6):
        if k in exempt:
            continue
        score += W_ZONE_SPOT * np.nan_to_num(np.hypot(xv(k) - xr_spot[k], yv(k) - ZONE_SPOTS[k, 1]))
    return score
