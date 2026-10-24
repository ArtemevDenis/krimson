from collections import Counter, defaultdict
from dataclasses import dataclass, field

from app.domain.rotation import RallyState, Side
from app.domain.scouting import EVALUATIONS, FAULTS, SKILLS


@dataclass(frozen=True)
class ActionRecord:
    player_id: int | None
    skill: str
    evaluation: str
    fault: str | None = None


@dataclass(frozen=True)
class RallyRecord:
    state: RallyState
    winner: Side | None
    actions: list[ActionRecord]


@dataclass
class PlayerStats:
    player_id: int
    rallies_on_court: int = 0
    counts: dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))
    faults: Counter = field(default_factory=Counter)

    def total(self, skill: str) -> int:
        return sum(self.counts[skill].values())

    def n(self, skill: str, *evals: str) -> int:
        return sum(self.counts[skill][e] for e in evals)

    def to_dict(self) -> dict:
        def ratio(a: int, b: int) -> float | None:
            return round(a / b, 3) if b else None

        serve_total, rec_total, att_total = self.total("S"), self.total("R"), self.total("A")
        ace, serve_err = self.n("S", "#"), self.n("S", "=")
        kill, att_err, blocked = self.n("A", "#"), self.n("A", "="), self.n("A", "/")
        block_pts = self.n("B", "#")
        over_pts = self.n("G", "#")
        return {
            "player_id": self.player_id,
            "rallies_on_court": self.rallies_on_court,
            "points": ace + kill + block_pts + over_pts,
            "errors": sum(self.counts[s]["="] for s in SKILLS) + self.n("B", "/") + self.n("G", "/"),
            "serve": {"total": serve_total, "ace": ace, "error": serve_err, "eff": ratio(ace - serve_err, serve_total)},
            "reception": {
                "total": rec_total,
                "perfect": self.n("R", "#"),
                "positive": self.n("R", "#", "+"),
                "error": self.n("R", "="),
                "pos_pct": ratio(self.n("R", "#", "+"), rec_total),
                "perf_pct": ratio(self.n("R", "#"), rec_total),
            },
            "attack": {
                "total": att_total,
                "kill": kill,
                "error": att_err,
                "blocked": blocked,
                "kill_pct": ratio(kill, att_total),
                "eff": ratio(kill - att_err - blocked, att_total),
            },
            "block": {"total": self.total("B"), "point": block_pts, "error": self.n("B", "=", "/")},
            "dig": {"total": self.total("D"), "positive": self.n("D", "#", "+"), "error": self.n("D", "=")},
            "set": {"total": self.total("E"), "error": self.n("E", "=")},
            # Balls given over without an attack: many of them mean the team often can't build an attack
            "over": {"total": self.total("G"), "point": over_pts, "error": self.n("G", "=", "/")},
            "faults": {"total": sum(self.faults.values()), **{k: self.faults[k] for k in FAULTS}},
            "raw": {s: {e: self.counts[s][e] for e in EVALUATIONS} for s in SKILLS},
        }


@dataclass
class RotationStats:
    setter_zone: int
    sideout_total: int = 0
    sideout_won: int = 0
    break_total: int = 0
    break_won: int = 0

    def to_dict(self) -> dict:
        return {
            "setter_zone": self.setter_zone,
            "sideout_total": self.sideout_total,
            "sideout_won": self.sideout_won,
            "break_total": self.break_total,
            "break_won": self.break_won,
        }


def compute(rallies: list[RallyRecord]) -> dict:
    players: dict[int, PlayerStats] = {}
    rotations: dict[int, RotationStats] = {}
    team = {"rallies": 0, "won": 0, "opponent_errors": 0, "opponent_points": 0, "faults": 0}

    def player(pid: int) -> PlayerStats:
        return players.setdefault(pid, PlayerStats(pid))

    for rally in rallies:
        for pid in rally.state.on_court:
            player(pid).rallies_on_court += 1
        for action in rally.actions:
            if action.fault:
                team["faults"] += 1
            if action.player_id is not None:
                player(action.player_id).counts[action.skill][action.evaluation] += 1
                if action.fault:
                    player(action.player_id).faults[action.fault] += 1

        if rally.winner is None:
            continue
        team["rallies"] += 1
        won = rally.winner == "us"
        team["won"] += won

        last = rally.actions[-1] if rally.actions else None
        if won and (last is None or last.evaluation != "#"):
            team["opponent_errors"] += 1
        if not won and (last is None or last.evaluation not in ("=", "/")):
            team["opponent_points"] += 1

        zone = rally.state.setter_zone
        if zone is not None:
            rot = rotations.setdefault(zone, RotationStats(zone))
            if rally.state.serving == "them":
                rot.sideout_total += 1
                rot.sideout_won += won
            else:
                rot.break_total += 1
                rot.break_won += won

    return {
        "team": team,
        "players": [p.to_dict() for p in players.values()],
        "rotations": [r.to_dict() for r in sorted(rotations.values(), key=lambda r: r.setter_zone)],
    }
