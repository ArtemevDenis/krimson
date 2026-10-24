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


def test_serve_sub_plays_starters_role_and_is_hinted_back():
    # zone1 = MB(6); bench OH 8 comes in to serve for him
    cfg = SetConfig(lineup=[6, 1, 2, 3, 4, 5], libero_ids=[7], we_serve_first=True, positions=POSITIONS)
    states, final = replay(cfg, [RallyInput("us", [Substitution(6, 8, "serve")]), RallyInput("them")])
    assert states[0].server_id == 8
    assert states[0].serve_subs[0].due is None
    # serve lost: hint to bring the MB back, and the libero replaces the sub as he would the MB
    assert final.serve_subs[0].due == "serve_lost"
    assert final.on_court[0] == 7


def test_serve_sub_hinted_at_front_row_and_cleared_on_return():
    cfg = SetConfig(lineup=[6, 1, 2, 3, 4, 5], libero_ids=[7], we_serve_first=True, positions=POSITIONS)
    # sub stays in defense: them, us(rotate: zone 6), them, us(zone 5), them, us(zone 4 — front row)
    rallies = [RallyInput("them", [Substitution(6, 8, "serve")])] + [RallyInput(w) for w in ["us", "them", "us", "them", "us"]]
    _, final = replay(cfg, rallies)
    assert final.lineup.index(8) == 3
    assert final.serve_subs[0].due == "front_row"
    _, final = replay(cfg, rallies + [RallyInput("us", [Substitution(8, 6)])])
    assert final.serve_subs == []


def test_libero_sits_out_until_middle_leaves_back_row():
    cfg = SetConfig(lineup=[6, 1, 2, 3, 4, 5], libero_ids=[7], we_serve_first=True, positions=POSITIONS)
    rallies = [RallyInput("them"), RallyInput("us", [Substitution(None, None, "libero_out")])]
    states, final = replay(cfg, rallies)
    assert states[1].on_court[0] == 6 and states[1].libero_out
    # MB 6 rotated to zone 6, still back row: libero still out
    assert final.on_court[5] == 6
    rallies += [RallyInput(w) for w in ["them", "us", "them", "us"]]  # MB 6 -> zone 5 -> zone 4
    _, final = replay(cfg, rallies)
    assert not final.libero_out
    # the other MB (3) now serves from zone 1; once the serve is lost the libero replaces him
    _, final = replay(cfg, rallies + [RallyInput("them")])
    assert final.on_court[0] == 7


def test_libero_in_cancels_sit_out():
    cfg = SetConfig(lineup=[6, 1, 2, 3, 4, 5], libero_ids=[7], we_serve_first=True, positions=POSITIONS)
    rallies = [RallyInput("them", [Substitution(None, None, "libero_out")]), RallyInput("them", [Substitution(None, None, "libero_in")])]
    states, _ = replay(cfg, rallies)
    assert states[1].on_court[0] == 7


def test_sub_takes_replaced_players_role_by_default():
    # OH 8 comes in for MB 6 (zone 6, back row): the libero still replaces him
    states, _ = replay(config(), [RallyInput("them", [Substitution(6, 8)])])
    assert states[0].on_court[5] == 7


def test_sub_with_own_role():
    # OH 8 replaces MB 6 but plays as OH: no back-row middle left for the libero
    states, _ = replay(config(), [RallyInput("them", [Substitution(6, 8, role="OH")])])
    assert states[0].on_court[5] == 8
    assert states[0].libero_replaces is None
