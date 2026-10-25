import numpy as np

from app.cv.actions import PlacedTouch, infer_actions
from app.cv.detection import Frame
from app.cv.geometry import COURT_POINTS, Court, apply_homography, fit_homography
from app.cv.rallies import segment_rallies
from app.cv.tracking import find_touches, link_tracks

FPS = 15


def _court() -> Court:
    # A plausible perspective view: our baseline at the bottom, far baseline near the top
    img_to_court = fit_homography(
        np.array([[0.1, 0.95], [0.9, 0.95], [0.7, 0.45], [0.3, 0.45]]), COURT_POINTS[:4]
    )
    points = apply_homography(np.linalg.inv(img_to_court), COURT_POINTS)
    return Court.from_points(0.0, points.tolist())


def _frames(duration: float, ball_at=lambda t: None, clock=(0.05, 0.2), persons=None) -> list[Frame]:
    frames = []
    for i in range(int(duration * FPS)):
        t = i / FPS
        balls = [[*clock, 0.01, 0.3]]  # a wall clock that never moves
        pos = ball_at(t)
        if pos is not None:
            balls.append([pos[0], pos[1], 0.01, 0.6])
        frames.append(Frame(t, np.array(balls), np.array(persons or [], dtype=float).reshape(-1, 5)))
    return frames


def _arc(t0: float, x0: float, x1: float, dur: float, top: float = 0.2, base: float = 0.6):
    def at(t: float):
        if not t0 <= t <= t0 + dur:
            return None
        k = (t - t0) / dur
        return x0 + (x1 - x0) * k, base - 4 * (base - top) * k * (1 - k)
    return at


def test_homography_roundtrip_and_error():
    court = _court()
    assert court.reprojection_error() < 1e-6
    assert np.allclose(court.court_xy(court.image_points[4])[0], [0, 9], atol=1e-6)


def test_static_clock_is_ignored_and_arc_becomes_track():
    frames = _frames(8, _arc(2.0, 0.2, 0.8, 1.5))
    tracks = link_tracks(frames)
    assert len(tracks) == 1
    assert abs(tracks[0].start - 2.0) < 0.1 and abs(tracks[0].end - 3.5) < 0.1


def test_bounce_between_arcs_is_a_touch_and_rally_spans_both():
    first, second = _arc(1.0, 0.2, 0.5, 1.0), _arc(2.0, 0.5, 0.8, 1.0)
    frames = _frames(6, lambda t: first(t) or second(t))
    tracks = link_tracks(frames)
    touches = find_touches(tracks)
    assert any(abs(t.t - 2.0) < 0.15 for t in touches)
    rallies = segment_rallies(tracks)
    assert len(rallies) == 1
    assert rallies[0].start < 1.0 and rallies[0].end > 3.0


def test_far_apart_ball_activity_makes_separate_rallies():
    a, b = _arc(1.0, 0.2, 0.8, 2.5), _arc(20.0, 0.2, 0.8, 2.5)
    rallies = segment_rallies(link_tracks(_frames(25, lambda t: a(t) or b(t))))
    assert len(rallies) == 2


def _touch(t: float, side: str, y: float) -> PlacedTouch:
    return PlacedTouch(t, (0.5, 0.5), side, y, (0.4, 0.4, 0.5, 0.6), "start")


def test_reception_set_attack_after_their_serve():
    touches = [_touch(0, "them", 19), _touch(1.5, "us", 2), _touch(2.5, "us", 7), _touch(3.4, "us", 6)]
    assert [a.skill for a in infer_actions(touches)] == ["R", "E", "A"]


def test_our_serve_then_block_and_counterattack():
    touches = [
        _touch(0, "us", -1),
        _touch(1.5, "them", 15), _touch(2.3, "them", 11), _touch(3.0, "them", 10),
        _touch(3.4, "us", 8.5),  # at the net right after their attack
        _touch(4.2, "us", 3), _touch(5.0, "us", 7), _touch(5.8, "us", 6),
    ]
    assert [a.skill for a in infer_actions(touches)] == ["S", "B", "D", "E", "A"]


def test_rally_starts_at_the_serve_not_at_tossing_before_it():
    toss = _arc(1.0, 0.40, 0.45, 0.8, top=0.5)  # short toss to the server
    serve = _arc(2.5, 0.1, 0.8, 1.2)
    rallies = segment_rallies(link_tracks(_frames(6, lambda t: toss(t) or serve(t))))
    assert len(rallies) == 1
    assert abs(rallies[0].start - 1.5) < 0.1  # serve start minus the lead


def test_ball_handling_without_long_flights_is_not_a_rally():
    tosses = [_arc(1.0 + 1.2 * i, 0.4, 0.45, 0.8, top=0.5) for i in range(4)]
    frames = _frames(8, lambda t: next((p for a in tosses if (p := a(t))), None))
    assert segment_rallies(link_tracks(frames)) == []


def _noise_with_tones(seconds: float, tones: list[tuple[float, float, float, float]], seed: int = 1) -> np.ndarray:
    """White-ish hall noise plus pure tones: (start, duration, frequency, amplitude)."""
    from app.cv.audio import SAMPLE_RATE

    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    x = rng.normal(0, 0.05, len(t)).astype(np.float32)
    for start, dur, freq, amp in tones:
        m = (t >= start) & (t < start + dur)
        x[m] += (amp * np.sin(2 * np.pi * freq * t[m])).astype(np.float32)
    return x


def test_whistle_tones_are_found_in_noise():
    from app.cv.audio import classify, detect_tones

    samples = _noise_with_tones(20, [(3.0, 0.6, 3600, 0.5), (11.0, 0.3, 1600, 0.15)])
    tones = detect_tones(samples)
    high = [t for t in tones if t.band == "high"]
    low = [t for t in tones if t.band == "low"]
    assert len(high) == 1 and abs(high[0].start - 3.0) < 0.1 and high[0].strength > 40
    assert len(low) == 1 and abs(low[0].start - 11.0) < 0.1

    whistles = classify(tones, start_db=40, end_db=30, min_seconds=0.1)
    assert [w.kind for w in whistles] == ["start", "end"]


def test_whistles_set_rally_boundaries():
    from app.cv.audio import Whistle
    from app.cv.base import RallySegment
    from app.cv.params import DEFAULT_PARAMS
    from app.cv.rallies import with_whistles

    p = DEFAULT_PARAMS.with_values(whistle_lead=0.5, whistle_end_tail=1.0, ball_only_min_conf=0.7)
    ball = [
        RallySegment(12.0, 20.0, 0.9),  # rally 1 seen by the ball, starts late (serve flight missed)
        RallySegment(31.0, 35.0, 0.9),  # rally 2: end whistle heard at 33 — ends there, not at 35
        RallySegment(60.0, 64.0, 0.4),  # ball handling in a break: no whistle, low confidence
    ]
    whistles = [
        Whistle(10.0, 10.6, "start", 48), Whistle(10.7, 11.0, "start", 47),  # one long whistle, split
        Whistle(30.0, 30.5, "start", 49), Whistle(33.0, 33.4, "end", 38),
    ]
    rallies = with_whistles(ball, whistles, p)
    assert [(r.start, round(r.end, 1)) for r in rallies] == [(9.5, 20.0), (29.5, 34.4)]


def test_without_whistles_ball_rallies_stay():
    from app.cv.base import RallySegment
    from app.cv.rallies import with_whistles

    ball = [RallySegment(1.0, 5.0, 0.5)]
    assert with_whistles(ball, []) == ball


def test_serve_box_only_when_the_player_stands_behind_the_baseline():
    behind = infer_actions([_touch(0, "us", -1), _touch(1.5, "them", 15)])
    assert behind[0].skill == "S" and behind[0].player_box is not None
    # server outside the frame: the nearest person is a teammate on the court — keep the serve, drop his box
    on_court = infer_actions([_touch(0, "us", 4), _touch(1.5, "them", 15)])
    assert on_court[0].skill == "S" and on_court[0].player_box is None


def test_whistles_alone_give_sure_and_doubtful_rallies():
    from app.cv.audio import Whistle
    from app.cv.params import DEFAULT_PARAMS
    from app.cv.rallies import with_whistles

    p = DEFAULT_PARAMS.with_values(whistle_without_ball=True, whistle_default_rally=8.0)
    whistles = [Whistle(10.0, 10.5, "start", 48), Whistle(18.0, 18.4, "end", 40), Whistle(40.0, 40.5, "start", 47)]
    found = with_whistles([], whistles, p)
    assert len(found) == 2
    sure, doubtful = found
    assert sure.confidence >= 0.75 and sure.end < 20  # ended at the end whistle
    assert doubtful.confidence < 0.75 and abs(doubtful.end - 48.0) < 0.01  # no end whistle: the usual length
