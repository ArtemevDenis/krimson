"""Ball candidates -> moving ball tracks -> touch moments. Pure numpy, no model needed (testable)."""

from bisect import bisect_left, bisect_right
from dataclasses import dataclass, field

import numpy as np

from app.cv.detection import Frame
from app.cv.params import DEFAULT_PARAMS, AnalyzerParams

STATIC_CELL = 0.015  # normalized grid for spotting things that never move (wall clock, balls on the bench)
STATIC_WINDOW = 5.0  # seconds on each side
STATIC_RATIO = 0.4
MIN_GATE = 0.03


@dataclass
class Track:
    t: list[float] = field(default_factory=list)
    x: list[float] = field(default_factory=list)
    y: list[float] = field(default_factory=list)

    def add(self, t: float, x: float, y: float) -> None:
        self.t.append(t)
        self.x.append(x)
        self.y.append(y)

    @property
    def start(self) -> float:
        return self.t[0]

    @property
    def end(self) -> float:
        return self.t[-1]

    def extent(self) -> float:
        return float(np.hypot(np.ptp(self.x), np.ptp(self.y)))

    def predict(self, t: float) -> tuple[float, float]:
        if len(self.t) < 2:
            return self.x[-1], self.y[-1]
        dt = self.t[-1] - self.t[-2]
        if dt <= 0:
            return self.x[-1], self.y[-1]
        k = (t - self.t[-1]) / dt
        return self.x[-1] + (self.x[-1] - self.x[-2]) * k, self.y[-1] + (self.y[-1] - self.y[-2]) * k


@dataclass(frozen=True)
class Touch:
    t: float
    x: float
    y: float
    kind: str  # "bounce" (down->up), "turn" (sharp direction change), "start" (a new track begins)


def static_flags(frames: list[Frame]) -> list[np.ndarray]:
    """Marks candidates sitting in a grid cell that has a detection in a large share of nearby frames."""
    times = [f.t for f in frames]
    cells: dict[tuple[int, int], list[float]] = {}
    keys: list[list[tuple[int, int]]] = []
    for f in frames:
        frame_keys = []
        for x, y, *_ in f.balls:
            key = (int(x / STATIC_CELL), int(y / STATIC_CELL))
            frame_keys.append(key)
            seen = cells.setdefault(key, [])
            if not seen or seen[-1] != f.t:
                seen.append(f.t)
        keys.append(frame_keys)

    flags = []
    for f, frame_keys in zip(frames, keys):
        lo, hi = f.t - STATIC_WINDOW, f.t + STATIC_WINDOW
        window_frames = bisect_right(times, hi) - bisect_left(times, lo)
        out = np.zeros(len(frame_keys), dtype=bool)
        for i, key in enumerate(frame_keys):
            hits = 0
            # Neighbouring cells too: a static object near a cell border jitters between them
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    seen = cells.get((key[0] + dx, key[1] + dy))
                    if seen:
                        hits += bisect_right(seen, hi) - bisect_left(seen, lo)
            out[i] = window_frames >= 10 and hits >= STATIC_RATIO * window_frames
        flags.append(out)
    return flags


def link_tracks(frames: list[Frame], p: AnalyzerParams = DEFAULT_PARAMS) -> list[Track]:
    """Greedy constant-velocity association; static candidates are dropped first."""
    flags = static_flags(frames)
    active: list[Track] = []
    done: list[Track] = []

    for f, static in zip(frames, flags):
        still = []
        for tr in active:
            (done if f.t - tr.end > p.max_gap else still).append(tr)
        active = still

        cands = [c for c, s in zip(f.balls, static) if not s]
        pairs = []
        for ti, tr in enumerate(active):
            px, py = tr.predict(f.t)
            gate = max(MIN_GATE, p.max_speed * (f.t - tr.end) * 0.6)
            for ci, c in enumerate(cands):
                d = float(np.hypot(c[0] - px, c[1] - py))
                if d <= gate:
                    pairs.append((d, ti, ci))
        used_t, used_c = set(), set()
        for _, ti, ci in sorted(pairs):
            if ti in used_t or ci in used_c:
                continue
            used_t.add(ti)
            used_c.add(ci)
            active[ti].add(f.t, float(cands[ci][0]), float(cands[ci][1]))
        for ci, c in enumerate(cands):
            if ci not in used_c and c[3] >= p.start_conf:
                tr = Track()
                tr.add(f.t, float(c[0]), float(c[1]))
                active.append(tr)

    done.extend(active)
    tracks = [tr for tr in done if len(tr.t) >= p.min_track_points and tr.extent() >= p.min_track_extent]
    return sorted(tracks, key=lambda tr: tr.start)


def track_touches(tr: Track, p: AnalyzerParams = DEFAULT_PARAMS) -> list[Touch]:
    """Inside one track: the ball moving down then sharply up (image y grows downward) or a sharp turn."""
    t, x, y = np.asarray(tr.t), np.asarray(tr.x), np.asarray(tr.y)
    if len(t) < 3:
        return []
    dt = np.diff(t)
    dt[dt <= 0] = 1e-3
    vx, vy = np.diff(x) / dt, np.diff(y) / dt
    touches = []
    turn_angle = np.deg2rad(p.turn_angle_deg)
    for i in range(1, len(vx)):
        a, b = np.array([vx[i - 1], vy[i - 1]]), np.array([vx[i], vy[i]])
        sa, sb = np.linalg.norm(a), np.linalg.norm(b)
        if vy[i - 1] > p.min_turn_speed and vy[i] < -p.min_turn_speed:
            touches.append(Touch(float(t[i]), float(x[i]), float(y[i]), "bounce"))
        elif sa > p.min_turn_speed and sb > p.min_turn_speed:
            angle = np.arccos(np.clip(a @ b / (sa * sb), -1, 1))
            if angle > turn_angle:
                touches.append(Touch(float(t[i]), float(x[i]), float(y[i]), "turn"))
    return touches


def find_touches(tracks: list[Track], p: AnalyzerParams = DEFAULT_PARAMS) -> list[Touch]:
    events = [Touch(tr.start, tr.x[0], tr.y[0], "start") for tr in tracks]
    for tr in tracks:
        events.extend(track_touches(tr, p))
    events.sort(key=lambda e: e.t)
    deduped: list[Touch] = []
    for e in events:
        if deduped and e.t - deduped[-1].t < p.touch_dedup:
            continue
        deduped.append(e)
    return deduped
