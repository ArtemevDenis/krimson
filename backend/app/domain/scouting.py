"""DataVolley-style skills and evaluations."""

from typing import Literal

from app.domain.rotation import Side

Skill = Literal["S", "R", "A", "B", "D", "E", "F"]
Evaluation = Literal["#", "+", "!", "-", "/", "="]

SKILLS: dict[str, str] = {
    "S": "Подача",
    "R": "Приём",
    "A": "Атака",
    "B": "Блок",
    "D": "Защита",
    "E": "Передача",
    "F": "Свободный мяч",
}

EVALUATIONS: tuple[str, ...] = ("#", "+", "!", "-", "/", "=")

# Meaning of each evaluation differs per skill (DataVolley convention)
EVALUATION_LABELS: dict[str, dict[str, str]] = {
    "S": {"#": "эйс", "+": "соперник принял плохо", "!": "соперник принял с ограничениями", "-": "соперник принял хорошо", "/": "соперник перебросил", "=": "ошибка"},
    "R": {"#": "идеально", "+": "хорошо", "!": "без первого темпа", "-": "плохо", "/": "перебросил", "=": "ошибка"},
    "A": {"#": "очко", "+": "хорошая, мяч в игре", "!": "отбита блоком в нашу сторону", "-": "легко защищена", "/": "заблокирована", "=": "ошибка"},
    "B": {"#": "очко", "+": "смягчил, мяч наш", "!": "смягчил, мяч у соперника", "-": "касание, соперник атакует снова", "/": "касание сетки", "=": "ошибка/аут"},
    "D": {"#": "идеально", "+": "хорошо", "!": "в игре", "-": "плохо", "/": "перебросил", "=": "не поднял"},
    "E": {"#": "идеально", "+": "хорошо", "!": "в игре", "-": "плохо", "/": "перебросил", "=": "ошибка"},
    "F": {"#": "идеально", "+": "хорошо", "!": "в игре", "-": "плохо", "/": "перебросил", "=": "ошибка"},
}

POINT_SKILLS = ("S", "A", "B")


def terminal_winner(skill: str, evaluation: str) -> Side | None:
    """If this action of ours always ends the rally, who wins it."""
    if evaluation == "#" and skill in POINT_SKILLS:
        return "us"
    if evaluation == "=":
        return "them"
    if evaluation == "/" and skill in ("A", "B"):
        return "them"
    return None
