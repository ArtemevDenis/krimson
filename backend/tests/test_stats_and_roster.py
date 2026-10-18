from app.domain.roster import parse_roster
from app.domain.rotation import RallyInput, SetConfig, replay
from app.domain.scouting import terminal_winner
from app.domain.stats import ActionRecord, RallyRecord, compute

POSITIONS = {1: "S", 2: "OH", 3: "MB", 4: "OPP", 5: "OH", 6: "MB", 7: "L"}


def test_terminal_winner():
    assert terminal_winner("S", "#") == "us"
    assert terminal_winner("A", "/") == "them"
    assert terminal_winner("R", "/") is None
    assert terminal_winner("R", "=") == "them"


def test_compute_player_and_rotation_stats():
    cfg = SetConfig([1, 2, 3, 4, 5, 6], [7], True, POSITIONS)
    winners = ["us", "them", "us"]
    states, _ = replay(cfg, [RallyInput(w) for w in winners])
    actions = [
        [ActionRecord(1, "S", "#")],
        [ActionRecord(1, "S", "-"), ActionRecord(4, "A", "=")],
        [ActionRecord(7, "R", "#"), ActionRecord(4, "A", "#")],
    ]
    result = compute([RallyRecord(s, w, a) for s, w, a in zip(states, winners, actions)])
    by_id = {p["player_id"]: p for p in result["players"]}
    assert by_id[1]["serve"] == {"total": 2, "ace": 1, "error": 0, "eff": 0.5}
    assert by_id[4]["attack"]["eff"] == 0.0
    assert by_id[4]["points"] == 1
    assert by_id[7]["reception"]["perf_pct"] == 1.0
    assert result["team"]["won"] == 2
    rot = {r["setter_zone"]: r for r in result["rotations"]}
    assert rot[1]["break_total"] == 2 and rot[1]["sideout_won"] == 1


def test_parse_roster_formats():
    players = parse_roster("15 Иван Петров доигровщик\n#7; Пётр; L\n3 Сергей\n\n10 Олег (связующий)")
    assert [(p.number, p.name, p.position) for p in players] == [
        (15, "Иван Петров", "OH"), (7, "Пётр", "L"), (3, "Сергей", "OH"), (10, "Олег", "S"),
    ]
