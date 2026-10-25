"""People tracks: the same person followed from frame to frame, in court meters.

Detections give unlinked boxes per frame. Players are linked by where their feet stand on the court (the
calibration makes a step near the camera and one at the far baseline the same size), predicted with their recent
velocity, and short misses (occlusion at the net, a missed detection) are bridged. Identities are not decided here:
cv.identity hands the lineup's names to these tracks.
"""

import gzip
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from app.cv.detection import Frame
from app.cv.geometry import COURT_LENGTH, COURT_WIDTH, NET_Y, Court, court_at

MAX_STEP_M = 1.2  # how far feet can move between consecutive frames (15 fps), plus detection jitter
MAX_GAP_SECONDS = 1.0  # a person unseen longer than this starts a new track
GAP_SPEED_M_S = 4.0  # allowed extra distance per second of a gap
MIN_TRACK_SECONDS = 0.5
# A jump or a box cut at the frame edge moves the "feet" by meters on the court while the box barely moves on the
# image: an overlapping box right after is the same person even when the court distance says otherwise
LINK_IOU = 0.3
IOU_GAP_SECONDS = 0.35
# Two players close together: when either could be either, both tracks end instead of guessing — a wrong guess
# silently swaps two names, a break only asks the identity step (and the user's marks) to name the pieces again.
# Kept tight: every break also loses continuity; on a set with ~200 marks, leave-one-rally-out naming was 51% without
# breaks, 56% at 0.15 m, 54-55% at 0.2-0.35 m. Doubtful stitches are better joined (0 = off): the marks cut a wrong one.
AMBIGUITY_MARGIN_M = 0.15
STITCH_AMBIGUITY_M = 0.0
# Far outside the court nobody plays: spectators, the second court's players, the referee's box
AREA_MARGIN_M = 6.0

CACHE_VERSION = 3  # 2: breaks at ambiguous crossings; 3: cut at net crossings


@dataclass
class PersonTrack:
    id: int
    t: list[float] = field(default_factory=list)
    boxes: list[list[float]] = field(default_factory=list)  # normalized x1, y1, x2, y2
    court: list[list[float]] = field(default_factory=list)  # feet in court meters (x across, y from our baseline)

    @property
    def start(self) -> float:
        return self.t[0]

    @property
    def end(self) -> float:
        return self.t[-1]

    def at(self, time: float) -> int | None:
        """Index of the sample at (or just before) `time`, None outside the track."""
        if not self.t or time < self.t[0] - 0.05 or time > self.t[-1] + 0.05:
            return None
        return max(0, int(np.searchsorted(self.t, time, side="right")) - 1)

    def position(self, start: float, end: float) -> np.ndarray | None:
        """Median feet position over a time window (robust to a jittery box)."""
        sel = [c for t, c in zip(self.t, self.court) if start <= t <= end]
        return np.median(np.array(sel), axis=0) if sel else None


def feet(box: np.ndarray) -> np.ndarray:
    return np.array([(box[0] + box[2]) / 2, box[3]])


def _iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def _in_area(xy: np.ndarray) -> bool:
    x, y = xy
    return -AREA_MARGIN_M <= x <= COURT_WIDTH + AREA_MARGIN_M and -AREA_MARGIN_M <= y <= COURT_LENGTH + AREA_MARGIN_M


def link_people(frames: list[Frame], courts: list[Court]) -> list[PersonTrack]:
    """Greedy nearest-first association on predicted positions: with ~15 people and 15 fps, the cheapest pairs
    are almost always right, and that keeps it simple without an assignment solver."""
    tracks: list[PersonTrack] = []
    active: list[PersonTrack] = []
    next_id = 0
    for frame in frames:
        court = court_at(courts, frame.t)
        if court is None or not len(frame.persons):
            active = [tr for tr in active if frame.t - tr.end <= MAX_GAP_SECONDS]
            continue
        boxes = frame.persons[:, :4]
        positions = court.court_xy(np.array([feet(b) for b in boxes]))
        keep = [i for i in range(len(boxes)) if _in_area(positions[i])]
        active = [tr for tr in active if frame.t - tr.end <= MAX_GAP_SECONDS]

        pairs = []
        for ti, tr in enumerate(active):
            gap = frame.t - tr.end
            last = np.array(tr.court[-1])
            if len(tr.t) >= 3 and tr.t[-1] - tr.t[-3] > 0:
                velocity = (last - np.array(tr.court[-3])) / (tr.t[-1] - tr.t[-3])
                predicted = last + velocity * min(gap, 0.3)
            else:
                predicted = last
            limit = MAX_STEP_M + GAP_SPEED_M_S * max(0.0, gap - 0.1)
            last_box = tr.boxes[-1]
            for di in keep:
                d = float(np.hypot(*(positions[di] - predicted)))
                if d <= limit:
                    pairs.append((d, ti, di))
                elif gap <= IOU_GAP_SECONDS and (overlap := _iou(last_box, boxes[di])) >= LINK_IOU:
                    pairs.append((limit * (2.0 - overlap), ti, di))  # after every court-distance match
        pairs.sort()
        cost = {(ti, di): c for c, ti, di in pairs}
        chosen: list[tuple[int, int]] = []
        used_t: set[int] = set()
        used_d: set[int] = set()
        for _, ti, di in pairs:
            if ti in used_t or di in used_d:
                continue
            used_t.add(ti)
            used_d.add(di)
            chosen.append((ti, di))
        # Crossing check: tracks A→a and B→b are ambiguous when A→b and B→a are nearly as cheap
        ambiguous: set[int] = set()
        for i, (ta, da) in enumerate(chosen):
            for tb, db in chosen[i + 1:]:
                cross = cost.get((ta, db)), cost.get((tb, da))
                if None in cross:
                    continue
                if cross[0] + cross[1] - cost[(ta, da)] - cost[(tb, db)] < AMBIGUITY_MARGIN_M:
                    ambiguous.update((ta, tb))
        ended: set[int] = set()
        for ti, di in chosen:
            if ti in ambiguous:
                used_d.discard(di)  # the detection starts a new track below
                ended.add(ti)
                continue
            tr = active[ti]
            tr.t.append(frame.t)
            tr.boxes.append([round(float(v), 4) for v in boxes[di]])
            tr.court.append([round(float(v), 3) for v in positions[di]])
        active = [tr for k, tr in enumerate(active) if k not in ended]
        for di in keep:
            if di in used_d:
                continue
            tr = PersonTrack(next_id, [frame.t], [[round(float(v), 4) for v in boxes[di]]], [[round(float(v), 3) for v in positions[di]]])
            next_id += 1
            tracks.append(tr)
            active.append(tr)
    return stitch([piece for tr in tracks for piece in split_at_net(tr) if piece.end - piece.start >= MIN_TRACK_SECONDS])


NET_SIDE_MARGIN_M = 0.3  # feet this close to the center line could be either side (a jump, a jittery box)
NET_SIDE_SECONDS = 0.5  # on the other side this long: it's another person, not a jitter


def _side(tr: PersonTrack, last: bool) -> int:
    """-1 our half, +1 the opponent's, 0 unknown: the side of the track's last (or first) clear sample."""
    ys = [y for _, y in (reversed(tr.court) if last else tr.court)]
    for y in ys[:15]:
        if abs(y - NET_Y) > NET_SIDE_MARGIN_M:
            return 1 if y > NET_Y else -1
    return 0


def split_at_net(tr: PersonTrack) -> list[PersonTrack]:
    """Players don't cross the net: a track that settles on the other side of the center line jumped onto an
    opponent (blocker and attacker face to face at the net). Cut it where the side changed."""
    side = [0 if abs(y - NET_Y) <= NET_SIDE_MARGIN_M else (1 if y > NET_Y else -1) for _, y in tr.court]
    cuts = []
    current = next((s for s in side if s), 0)
    i = 0
    while i < len(side):
        if side[i] and side[i] != current:
            j = i
            while j < len(side) and side[j] in (side[i], 0):
                j += 1
            if tr.t[j - 1] - tr.t[i] >= NET_SIDE_SECONDS:
                cuts.append(i)
                current = side[i]
            i = j
        else:
            i += 1
    if not cuts:
        return [tr]
    bounds = [0, *cuts, len(tr.t)]
    return [
        PersonTrack(tr.id if k == 0 else tr.id * 1000 + k, tr.t[a:b], tr.boxes[a:b], tr.court[a:b])
        for k, (a, b) in enumerate(zip(bounds, bounds[1:]))
    ]


STITCH_GAP_SECONDS = 2.0
STITCH_BASE_M = 1.0


def stitch(tracks: list[PersonTrack]) -> list[PersonTrack]:
    """Joins a track that broke off with one that starts right after where it ended (a long occlusion, a player
    crouching out of the detector's sight). One-to-one, nearest first, so in a crowd at the net only clear
    continuations are joined; doubtful ones stay apart and are left to the identity step."""
    candidates = []
    by_start = sorted(tracks, key=lambda tr: tr.start)
    for a in tracks:
        for b in by_start:
            gap = b.start - a.end
            if gap <= 0:
                continue
            if gap > STITCH_GAP_SECONDS:
                break
            d = float(np.hypot(*(np.array(b.court[0]) - np.array(a.court[-1]))))
            if _side(a, last=True) * _side(b, last=False) < 0:
                continue  # never across the net
            if d <= STITCH_BASE_M + GAP_SPEED_M_S * gap * 0.5:
                candidates.append((d + gap, a.id, b.id))
    candidates.sort()
    # A break with two near-equal continuations (or a start with two near-equal predecessors) stays a break
    best_next: dict[int, list[float]] = {}
    best_prev: dict[int, list[float]] = {}
    for c, a, b in candidates:
        best_next.setdefault(a, []).append(c)
        best_prev.setdefault(b, []).append(c)
    unclear = {a for a, cs in best_next.items() if len(cs) > 1 and cs[1] - cs[0] < STITCH_AMBIGUITY_M}
    unclear_b = {b for b, cs in best_prev.items() if len(cs) > 1 and cs[1] - cs[0] < STITCH_AMBIGUITY_M}
    candidates = [c for c in candidates if c[1] not in unclear and c[2] not in unclear_b]
    by_id = {tr.id: tr for tr in tracks}
    next_of: dict[int, int] = {}
    prev_of: dict[int, int] = {}
    for _, a, b in candidates:
        if a in next_of or b in prev_of:
            continue
        next_of[a] = b
        prev_of[b] = a
    merged = []
    for tr in tracks:
        if tr.id in prev_of:
            continue
        chain = tr
        while chain.id in next_of:
            nxt = by_id[next_of[chain.id]]
            tr.t += nxt.t
            tr.boxes += nxt.boxes
            tr.court += nxt.court
            chain = nxt
        merged.append(tr)
    return merged


def sidecar_path(video: Path, detections_tag: str = "") -> Path:
    return video.with_name(f"{video.name}.krimson-people{'-' + detections_tag if detections_tag else ''}.json.gz")


def save(tracks: list[PersonTrack], path: Path, calibration_key: str) -> None:
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump({
            "version": CACHE_VERSION,
            "calibration": calibration_key,
            "tracks": [{"id": tr.id, "t": [round(t, 3) for t in tr.t], "b": tr.boxes, "c": tr.court} for tr in tracks],
        }, f)
    tmp.replace(path)


def load(path: Path, calibration_key: str) -> list[PersonTrack] | None:
    """None when the cache is stale: the court positions depend on the calibration."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("version") != CACHE_VERSION or data.get("calibration") != calibration_key:
        return None
    return [PersonTrack(d["id"], d["t"], d["b"], d["c"]) for d in data["tracks"]]


def calibration_key(courts: list[Court]) -> str:
    return json.dumps([[round(c.from_time, 2), np.round(c.image_points, 4).tolist()] for c in courts])


def load_or_link(video: Path, detections_path: Path, frames_loader, courts: list[Court]) -> list[PersonTrack]:
    """Cached next to the video, per detection file (a new detector gives new boxes) and calibration."""
    name = detections_path.name
    tag = "persons" if ".krimson-persons" in name else name.split(".krimson-det")[-1].removesuffix(".json.gz").lstrip("-")
    path = sidecar_path(video, tag)
    key = calibration_key(courts)
    if path.is_file():
        cached = load(path, key)
        if cached is not None:
            return cached
    tracks = link_people(frames_loader(), courts)
    try:
        save(tracks, path, key)
    except OSError:
        pass
    return tracks
