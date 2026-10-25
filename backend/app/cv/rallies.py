from collections.abc import Callable

from app.cv.audio import Whistle
from app.cv.base import RallySegment
from app.cv.params import DEFAULT_PARAMS, AnalyzerParams
from app.cv.tracking import Track


def is_long_flight(tr: Track, p: AnalyzerParams = DEFAULT_PARAMS) -> bool:
    return tr.end - tr.start >= p.long_flight_seconds and tr.extent() >= p.long_flight_extent


def segment_rallies(
    tracks: list[Track],
    is_serve: Callable[[Track], bool] | None = None,
    p: AnalyzerParams = DEFAULT_PARAMS,
) -> list[RallySegment]:
    """Rallies = clusters of moving-ball tracks that contain at least one long flight.
    The rally starts at the serve: a long flight hit from behind a baseline when the court is calibrated,
    otherwise the first long flight. That cuts off ball tossing before the serve."""
    clusters: list[list[Track]] = []
    for tr in sorted(tracks, key=lambda tr: tr.start):
        if clusters and tr.start - max(t.end for t in clusters[-1]) <= p.merge_gap:
            clusters[-1].append(tr)
        else:
            clusters.append([tr])

    segments = []
    for cluster in clusters:
        long_flights = [tr for tr in cluster if is_long_flight(tr, p)]
        if not long_flights:
            continue
        serves = [tr for tr in long_flights if is_serve(tr)] if is_serve else []
        start = (serves[0] if serves else long_flights[0]).start
        end = max(tr.end for tr in cluster)
        if end - start < p.min_rally:
            continue
        rally_tracks = [tr for tr in cluster if tr.end >= start]
        confidence = min(1.0, 0.3 + 0.1 * len(rally_tracks) + 0.15 * len(long_flights))
        if is_serve and not serves:
            confidence = min(confidence, 0.45)  # no serve seen: maybe ball handling or the tail of a split rally
        segments.append(RallySegment(start=max(0.0, start - p.lead), end=end + p.tail, confidence=round(confidence, 2)))
    return segments


WHISTLE_REPEAT_SECONDS = 2.0  # a long or repeated serve whistle is still one rally
END_WHISTLE_AFTER_SECONDS = 2.0  # an end whistle right after the serve one is its echo, not the end


def with_whistles(segments: list[RallySegment], whistles: list[Whistle], p: AnalyzerParams = DEFAULT_PARAMS) -> list[RallySegment]:
    """The serve whistle starts a rally; it ends at the end whistle when one is heard, otherwise where the ball
    rally ends, and never after the next serve whistle. Ball rallies without a whistle stay only if confident."""
    starts: list[Whistle] = []
    for w in sorted((w for w in whistles if w.kind == "start"), key=lambda w: w.t):
        if not starts or w.t - starts[-1].t >= WHISTLE_REPEAT_SECONDS:
            starts.append(w)
    if not starts:
        return segments
    ends = sorted((w for w in whistles if w.kind == "end"), key=lambda w: w.t)

    out: list[RallySegment] = []
    for i, w in enumerate(starts):
        limit = starts[i + 1].t - p.whistle_lead if i + 1 < len(starts) else float("inf")
        end_whistle = next((e for e in ends if w.end + END_WHISTLE_AFTER_SECONDS <= e.t < limit), None)
        ball = [s for s in segments if s.end > w.t and s.start < limit]
        if end_whistle is not None:
            end = end_whistle.end + p.whistle_end_tail
        elif ball:
            end = max(s.end for s in ball)
        elif p.whistle_without_ball:
            end = w.t + p.whistle_default_rally
        else:
            continue
        confidence = 0.95 if ball else (0.8 if end_whistle else 0.6)
        out.append(RallySegment(start=max(0.0, w.t - p.whistle_lead), end=min(end, limit), confidence=confidence))

    covered = [(r.start, r.end) for r in out]
    for s in segments:
        if s.confidence >= p.ball_only_min_conf and not any(s.start < hi and s.end > lo for lo, hi in covered):
            out.append(s)
    return sorted(out, key=lambda r: r.start)
