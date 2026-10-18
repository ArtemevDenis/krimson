import re
from dataclasses import dataclass

POSITIONS = ("S", "OH", "OPP", "MB", "L")

_ALIASES = {
    "S": ("s", "set", "setter", "св", "связ", "связующий", "пас", "пасующий"),
    "OH": ("oh", "wing", "outside", "дг", "доиг", "доигровщик", "нап", "нападающий"),
    "OPP": ("opp", "op", "opposite", "диаг", "диагональный", "диагональ"),
    "MB": ("mb", "middle", "цб", "центр", "центральный", "блокирующий"),
    "L": ("l", "lib", "libero", "либ", "либеро"),
}
_LOOKUP = {alias: pos for pos, aliases in _ALIASES.items() for alias in aliases}


@dataclass(frozen=True)
class ParsedPlayer:
    number: int | None
    name: str
    position: str


def normalize_position(raw: str) -> str | None:
    return _LOOKUP.get(raw.strip().lower().rstrip("."))


def parse_roster(text: str) -> list[ParsedPlayer]:
    """One player per line: `15 Иван Петров доигровщик`, `15; Иван Петров; OH`, `#7 Пётр (L)`."""
    players = []
    for line in text.splitlines():
        tokens = [t for t in re.split(r"[\s;,\t|()]+", line.strip()) if t]
        if not tokens:
            continue
        number = None
        if m := re.fullmatch(r"#?(\d{1,2})\.?", tokens[0]):
            number = int(m.group(1))
            tokens = tokens[1:]
        position = "OH"
        if tokens and (pos := normalize_position(tokens[-1])):
            position = pos
            tokens = tokens[:-1]
        name = " ".join(tokens) or (f"Игрок {number}" if number is not None else "")
        if name:
            players.append(ParsedPlayer(number, name, position))
    return players
