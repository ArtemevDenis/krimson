import numpy as np

from app.cv.detection import Frame
from app.cv.geometry import COURT_POINTS, Court, apply_homography, fit_homography
from app.cv.identity import RallyContext, rightward_sign, solve
from app.cv.people import link_people

FPS = 15


def _court() -> Court:
    """Camera behind our baseline, above the floor: our baseline at the bottom of the image."""
    img_to_court = fit_homography(np.array([[0.1, 0.95], [0.9, 0.95], [0.7, 0.45], [0.3, 0.45]]), COURT_POINTS[:4])
    points = apply_homography(np.linalg.inv(img_to_court), COURT_POINTS)
    return Court.from_points(0.0, points.tolist())


COURT = _court()


def _box_at(xy: tuple[float, float]) -> list[float]:
    """A person box whose feet stand at court point xy."""
    u, v = apply_homography(COURT.to_image, np.array([xy]))[0]
    return [u - 0.02, v - 0.12, u + 0.02, v, 0.9]


# Our six in their zones for a reception (zone 1 first): x grows to our right, y from our baseline
ZONES = [(7.5, 2.0), (7.5, 7.5), (4.5, 7.5), (1.5, 7.5), (1.5, 2.0), (4.5, 2.5)]


def _frames(seconds: float, positions) -> list[Frame]:
    frames = []
    for i in range(int(seconds * FPS)):
        t = i / FPS
        boxes = [_box_at(p(t)) for p in positions]
        frames.append(Frame(t, np.zeros((0, 4)), np.array(boxes)))
    return frames


def test_unmirrored_calibration_points_right():
    assert rightward_sign(COURT) == 1.0


def test_people_are_followed_through_a_short_miss():
    frames = _frames(4, [lambda t: (2.0 + t, 3.0)])
    for f in frames[20:24]:  # a third of a second without a detection
        f.persons = np.zeros((0, 5))
    tracks = link_people(frames, [COURT])
    assert len(tracks) == 1 and tracks[0].end - tracks[0].start > 3.5


def test_lineup_names_follow_the_zones_and_a_mark():
    still = [lambda t, z=z: z for z in ZONES]
    tracks = link_people(_frames(10, still), [COURT])
    assert len(tracks) == 6
    names = [11, 12, 13, 14, 15, 16]  # by zone 1..6
    rally = RallyContext(0.0, 9.0, names, our_serve=False)

    result = solve(tracks, [rally], [], [COURT])
    by_track = {n.track_id: n.player_id for n in result.namings}
    for tr in tracks:
        zone = min(range(6), key=lambda k: np.hypot(*(np.array(tr.court[0]) - ZONES[k])))
        assert by_track[tr.id] == names[zone]

    # Players 13 and 14 swapped spots against the rules: the user's mark wins over the zone order
    front_left = next(tr for tr in tracks if abs(tr.court[0][0] - 1.5) < 0.3 and tr.court[0][1] > 5)
    marked = solve(tracks, [rally], [(1.0, front_left.boxes[15], 13)], [COURT])
    assert {n.track_id: n.player_id for n in marked.namings}[front_left.id] == 13
    assert any(n.confirmed and n.track_id == front_left.id for n in marked.namings)


def test_our_server_may_be_out_of_sight():
    # We serve: zone 1 is behind the baseline outside the frame, the other five are in their zones
    visible = [lambda t, z=z: z for z in ZONES[1:]]
    tracks = link_people(_frames(10, visible), [COURT])
    result = solve(tracks, [RallyContext(0.0, 9.0, [11, 12, 13, 14, 15, 16], our_serve=True)], [], [COURT])
    assert sorted(n.player_id for n in result.namings) == [12, 13, 14, 15, 16]


def test_a_person_marked_not_ours_gets_no_name():
    # A referee stands inside our court next to the six: marked "not ours", he is left out
    stand = [lambda t, z=z: z for z in ZONES] + [lambda t: (8.6, 8.6)]
    tracks = link_people(_frames(10, stand), [COURT])
    referee = next(tr for tr in tracks if abs(tr.court[0][0] - 8.6) < 0.3 and abs(tr.court[0][1] - 8.6) < 0.3)
    result = solve(tracks, [RallyContext(0.0, 9.0, [11, 12, 13, 14, 15, 16], our_serve=False)], [], [COURT],
                   ignored=[(1.0, referee.boxes[15])])
    assert referee.id in result.ignored
    assert all(n.track_id != referee.id for n in result.namings)
    assert len(result.namings) == 6


def test_without_the_rotation_the_squad_is_handed_out():
    # Before the set is tagged the zones aren't known: six of the seven (lineup + libero) are on the court
    still = [lambda t, z=z: z for z in ZONES]
    tracks = link_people(_frames(10, still), [COURT])
    squad = (11, 12, 13, 14, 15, 16, 22)  # 22 is the libero, 13 and 16 the middles
    rally = RallyContext(0.0, 9.0, [], our_serve=False, ordered=False, squad=squad, middles=(13, 16), libero=22)
    result = solve(tracks, [rally], [], [COURT])
    named = [n.player_id for n in result.namings]
    assert len(named) == 6 and len(set(named)) == 6
    assert not {22, 13, 16} <= set(named)  # the libero is never on the court with both middles

    # A mark pins a player even without zones
    first = tracks[0]
    marked = solve(tracks, [rally], [(1.0, first.boxes[15], 22)], [COURT])
    assert {n.track_id: n.player_id for n in marked.namings}[first.id] == 22
