from app.domain.rotation import RallyInput, SetConfig, Substitution, is_set_finished, replay

# zone1..zone6: S=1, OH=2, MB=3, OPP=4, OH=5, MB=6 ; libero=7
POSITIONS = {1: "S", 2: "OH", 3: "MB", 4: "OPP", 5: "OH", 6: "MB", 7: "L", 8: "OH"}


def config(serve_first: bool = True) -> SetConfig:
    return SetConfig(lineup=[1, 2, 3, 4, 5, 6], libero_ids=[7], we_serve_first=serve_first, positions=POSITIONS)


def test_serving_team_keeps_lineup_on_point():
    states, final = replay(config(), [RallyInput("us"), RallyInput("us")])
    assert final.lineup == [1, 2, 3, 4, 5, 6]
    assert (final.our_score, final.their_score, final.serving) == (2, 0, "us")
    assert states[0].server_id == 1


def test_sideout_rotates_clockwise():
    _, final = replay(config(serve_first=False), [RallyInput("us")])
    assert final.serving == "us"
    assert final.lineup == [2, 3, 4, 5, 6, 1]
    assert final.server_id == 2
    assert final.setter_zone == 6


def test_losing_serve_does_not_rotate():
    _, final = replay(config(), [RallyInput("them")])
    assert final.lineup == [1, 2, 3, 4, 5, 6]
    assert final.serving == "them"


def test_libero_replaces_back_row_middle():
    states, _ = replay(config(), [RallyInput("us")])
    # MB 6 in zone 6 is back row
    assert states[0].on_court == [1, 2, 3, 4, 5, 7]
    assert states[0].libero_replaces == 6


def test_middle_serves_instead_of_libero():
    # zone1 = MB(6) and we serve: MB stays, libero sits
    cfg = SetConfig(lineup=[6, 1, 2, 3, 4, 5], libero_ids=[7], we_serve_first=True, positions=POSITIONS)
    states, _ = replay(cfg, [RallyInput("them")])
    assert states[0].on_court == [6, 1, 2, 3, 4, 5]
    # after losing serve the libero comes back for the same MB
    _, final = replay(cfg, [RallyInput("them")])
    assert final.on_court[0] == 7


def test_substitution_applies_before_rally():
    states, _ = replay(config(), [RallyInput("us", [Substitution(2, 8)])])
    assert states[0].lineup[1] == 8


def test_set_end_rules():
    assert is_set_finished(25, 23, 1)
    assert not is_set_finished(25, 24, 1)
    assert is_set_finished(15, 13, 5)
