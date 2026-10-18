"""Replay of a set: score, serve and 5-1 rotation are derived from rally outcomes,
so editing any past rally automatically fixes everything after it."""

from dataclasses import dataclass, field
from typing import Literal

Side = Literal["us", "them"]

BACK_ROW_INDEXES = (0, 4, 5)  # zones 1, 5, 6


@dataclass(frozen=True)
class Substitution:
    out_id: int
    in_id: int


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


def rotate(lineup: list[int]) -> list[int]:
    return lineup[1:] + lineup[:1]


def apply_substitutions(lineup: list[int], subs: list[Substitution]) -> list[int]:
    result = list(lineup)
    for sub in subs:
        if sub.out_id in result:
            result[result.index(sub.out_id)] = sub.in_id
    return result


def on_court(lineup: list[int], config: SetConfig, serving: Side) -> tuple[list[int], int | None]:
    """Libero takes the back-row middle blocker's place, except when that MB is about to serve."""
    players = list(lineup)
    if not config.libero_ids:
        return players, None
    libero = config.libero_ids[0]
    for idx in BACK_ROW_INDEXES:
        player = players[idx]
        if config.positions.get(player) != "MB":
            continue
        if idx == 0 and serving == "us":
            continue
        players[idx] = libero
        return players, player
    return players, None


def make_state(lineup: list[int], config: SetConfig, serving: Side, ours: int, theirs: int) -> RallyState:
    court, replaced = on_court(lineup, config, serving)
    setter_zone = next((i + 1 for i, p in enumerate(lineup) if config.positions.get(p) == "S"), None)
    return RallyState(
        our_score=ours,
        their_score=theirs,
        serving=serving,
        lineup=list(lineup),
        on_court=court,
        server_id=lineup[0] if serving == "us" and lineup else None,
        setter_zone=setter_zone,
        libero_replaces=replaced,
    )


def replay(config: SetConfig, rallies: list[RallyInput]) -> tuple[list[RallyState], RallyState]:
    """Returns the state before each rally plus the state after the last one."""
    lineup = list(config.lineup)
    serving: Side = "us" if config.we_serve_first else "them"
    ours = theirs = 0
    states: list[RallyState] = []

    for rally in rallies:
        lineup = apply_substitutions(lineup, rally.substitutions)
        states.append(make_state(lineup, config, serving, ours, theirs))
        if rally.winner == "us":
            ours += 1
            if serving == "them":
                lineup = rotate(lineup)
                serving = "us"
        elif rally.winner == "them":
            theirs += 1
            serving = "them"

    return states, make_state(lineup, config, serving, ours, theirs)


def is_set_finished(ours: int, theirs: int, set_number: int) -> bool:
    target = 15 if set_number == 5 else 25
    return max(ours, theirs) >= target and abs(ours - theirs) >= 2
