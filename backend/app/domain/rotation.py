"""Replay of a set: score, serve and 5-1 rotation are derived from rally outcomes,
so editing any past rally automatically fixes everything after it."""

from dataclasses import dataclass, field
from typing import Literal

Side = Literal["us", "them"]

BACK_ROW_INDEXES = (0, 4, 5)  # zones 1, 5, 6
FRONT_ROW_INDEXES = (1, 2, 3)  # zones 2, 3, 4

# regular — ordinary substitution; serve — a sub comes in to serve, the starter is expected back later;
# libero_out / libero_in — the libero sits out for the back-row middle, or comes back (no player ids)
SubKind = Literal["regular", "serve", "libero_out", "libero_in"]


@dataclass(frozen=True)
class Substitution:
    out_id: int | None
    in_id: int | None
    kind: SubKind = "regular"
    # Role the incoming player takes (S / OH / OPP / MB); None = the role of the player he replaces
    role: str | None = None


@dataclass(frozen=True)
class ServeSub:
    in_id: int
    out_id: int
    # Hint to bring the starter back: serve_lost — the serve is gone; front_row — the sub reached the front row
    due: Literal["serve_lost", "front_row"] | None


@dataclass(frozen=True)
class RallyInput:
    winner: Side | None
    substitutions: list[Substitution] = field(default_factory=list)


@dataclass(frozen=True)
class SetConfig:
    # lineup[0] is zone 1 (server), lineup[1] is zone 2, ... lineup[5] is zone 6
    lineup: list[int]
    libero_ids: list[int]
    we_serve_first: bool
    positions: dict[int, str]  # player_id -> S / OH / OPP / MB / L


@dataclass(frozen=True)
class RallyState:
    our_score: int
    their_score: int
    serving: Side
    lineup: list[int]
    on_court: list[int]
    server_id: int | None
    setter_zone: int | None
    libero_replaces: int | None
    serve_subs: list[ServeSub] = field(default_factory=list)
    libero_out: bool = False
    lineup_roles: list[str | None] = field(default_factory=list)  # role each lineup player plays in this set


@dataclass
class Bench:
    """What persists between rallies besides the lineup."""

    serve_subs: dict[int, int] = field(default_factory=dict)  # sub in_id -> starter out_id
    # The back-row middle the libero does not replace; cleared once that player leaves the back row
    libero_skip: int | None = None
    # Role played in this set when it differs from the roster position (a sub takes over the replaced
    # player's role by default, so the libero still replaces him and rotations keep counting)
    roles: dict[int, str] = field(default_factory=dict)

    def positions(self, config: SetConfig) -> dict[int, str]:
        return {**config.positions, **self.roles}


def rotate(lineup: list[int]) -> list[int]:
    return lineup[1:] + lineup[:1]


def back_row_middle(lineup: list[int], positions: dict[int, str]) -> int | None:
    return next((lineup[i] for i in BACK_ROW_INDEXES if positions.get(lineup[i]) == "MB"), None)


def apply_substitutions(lineup: list[int], subs: list[Substitution], bench: Bench, config: SetConfig) -> list[int]:
    result = list(lineup)
    for sub in subs:
        if sub.kind == "libero_out":
            bench.libero_skip = back_row_middle(result, bench.positions(config))
        elif sub.kind == "libero_in":
            bench.libero_skip = None
        elif sub.out_id in result and sub.in_id is not None:
            role = sub.role or bench.positions(config).get(sub.out_id)
            if role:
                bench.roles[sub.in_id] = role
            result[result.index(sub.out_id)] = sub.in_id
            bench.serve_subs.pop(sub.out_id, None)  # the serving sub leaves (usually for the starter)
            if sub.kind == "serve":
                bench.serve_subs[sub.in_id] = sub.out_id
    return result


def on_court(
    lineup: list[int], config: SetConfig, serving: Side, positions: dict[int, str], libero_skip: int | None = None
) -> tuple[list[int], int | None]:
    """Libero takes the back-row middle blocker's place, except when that MB is about to serve
    or the user marked that the libero sits out for him."""
    players = list(lineup)
    if not config.libero_ids:
        return players, None
    libero = config.libero_ids[0]
    for idx in BACK_ROW_INDEXES:
        player = players[idx]
        if positions.get(player) != "MB" or player == libero_skip:
            continue
        if idx == 0 and serving == "us":
            continue
        players[idx] = libero
        return players, player
    return players, None


def _serve_sub_due(lineup: list[int], in_id: int, serving: Side) -> Literal["serve_lost", "front_row"] | None:
    if in_id in lineup and lineup.index(in_id) in FRONT_ROW_INDEXES:
        return "front_row"
    return "serve_lost" if serving == "them" else None


def make_state(
    lineup: list[int], config: SetConfig, serving: Side, ours: int, theirs: int, bench: Bench | None = None
) -> RallyState:
    bench = bench or Bench()
    positions = bench.positions(config)
    court, replaced = on_court(lineup, config, serving, positions, bench.libero_skip)
    setter_zone = next((i + 1 for i, p in enumerate(lineup) if positions.get(p) == "S"), None)
    return RallyState(
        our_score=ours,
        their_score=theirs,
        serving=serving,
        lineup=list(lineup),
        on_court=court,
        server_id=lineup[0] if serving == "us" and lineup else None,
        setter_zone=setter_zone,
        libero_replaces=replaced,
        serve_subs=[ServeSub(i, o, _serve_sub_due(lineup, i, serving)) for i, o in bench.serve_subs.items()],
        libero_out=bench.libero_skip is not None,
        lineup_roles=[positions.get(p) for p in lineup],
    )


def replay(config: SetConfig, rallies: list[RallyInput]) -> tuple[list[RallyState], RallyState]:
    """Returns the state before each rally plus the state after the last one."""
    lineup = list(config.lineup)
    serving: Side = "us" if config.we_serve_first else "them"
    ours = theirs = 0
    bench = Bench()
    states: list[RallyState] = []

    for rally in rallies:
        lineup = apply_substitutions(lineup, rally.substitutions, bench, config)
        states.append(make_state(lineup, config, serving, ours, theirs, bench))
        if rally.winner == "us":
            ours += 1
            if serving == "them":
                lineup = rotate(lineup)
                serving = "us"
                if bench.libero_skip is not None and bench.libero_skip not in [lineup[i] for i in BACK_ROW_INDEXES]:
                    bench.libero_skip = None
        elif rally.winner == "them":
            theirs += 1
            serving = "them"

    return states, make_state(lineup, config, serving, ours, theirs, bench)


def is_set_finished(ours: int, theirs: int, set_number: int) -> bool:
    target = 15 if set_number == 5 else 25
    return max(ours, theirs) >= target and abs(ours - theirs) >= 2
