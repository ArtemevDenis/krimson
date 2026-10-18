from collections.abc import Callable

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
