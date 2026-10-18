from dataclasses import dataclass

LONG_RALLY_MIN_SECONDS = 12.0
LONG_RALLY_LIMIT = 10


@dataclass(frozen=True)
class HighlightRally:
    rally_id: int
    set_id: int
    set_number: int
    video_id: int
    start: float
    end: float
    score: str
    tags: list[str]
    actions: list[tuple[int | None, str, str]]  # (player_id, skill, evaluation)


@dataclass(frozen=True)
class HighlightGroup:
    key: str
    title: str
    rallies: list[HighlightRally]


def _with_action(rallies: list[HighlightRally], skill: str, evaluation: str, player_id: int | None = None) -> list[HighlightRally]:
    return [
        r for r in rallies
        if any(s == skill and e == evaluation and (player_id is None or p == player_id) for p, s, e in r.actions)
    ]


def build_groups(rallies: list[HighlightRally], player_names: dict[int, str]) -> list[HighlightGroup]:
    timed = [r for r in rallies if r.end > r.start]
    long_rallies = sorted(
        (r for r in timed if r.end - r.start >= LONG_RALLY_MIN_SECONDS), key=lambda r: r.end - r.start, reverse=True
    )[:LONG_RALLY_LIMIT]

    groups = [
        HighlightGroup("starred", "Отмеченные ★", [r for r in timed if "star" in r.tags]),
        HighlightGroup("emotion", "Эмоциональные моменты", [r for r in timed if "emotion" in r.tags]),
        HighlightGroup("long", "Длинные розыгрыши", sorted(long_rallies, key=lambda r: (r.set_number, r.start))),
        HighlightGroup("aces", "Эйсы", _with_action(timed, "S", "#")),
        HighlightGroup("kills", "Результативные атаки", _with_action(timed, "A", "#")),
        HighlightGroup("blocks", "Блоки", _with_action(timed, "B", "#")),
        HighlightGroup("digs", "Защита", _with_action(timed, "D", "#")),
    ]

    for pid, name in player_names.items():
        moments = [
            r for r in timed
            if any(p == pid and e == "#" for p, _, e in r.actions)
        ]
        if moments:
            groups.append(HighlightGroup(f"player:{pid}", name, moments))

    return [g for g in groups if g.rallies]
