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
