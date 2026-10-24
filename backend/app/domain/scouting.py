"""DataVolley-style skills and evaluations."""

from typing import Literal

from app.domain.rotation import Side

Skill = Literal["S", "R", "A", "B", "D", "E", "F", "G", "N"]
Evaluation = Literal["#", "+", "!", "-", "/", "="]

SKILLS: dict[str, str] = {
    "S": "Подача",
    "R": "Приём",
    "A": "Атака",
    "B": "Блок",
    "D": "Защита",
    "E": "Передача",
    "F": "Свободный мяч",
    "G": "Перевод",  # ball given over without an attack (a free ball to the opponent), so attack stats stay clean
    "N": "Нарушение",
}

# N is not a ball touch: a rule violation that always loses the rally (evaluation "="), with its kind in Action.fault.
# A foot fault on the serve is a serve error (S=) with fault "foot", so serve stats count it too.
FAULT_SKILL = "N"
SERVE_FAULTS = ("foot",)
FAULTS: dict[str, str] = {
    "foot": "заступ при подаче",
    "net": "касание сетки",
    "line": "заступ за центральную линию",
    "double": "двойное касание",
    "catch": "захват",
    "four": "четыре касания",
    "rotation": "переход / неверная расстановка",
}
TEAM_FAULTS = ("four", "rotation")  # not tied to a player

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
    "G": {"#": "очко", "+": "соперник принял плохо", "!": "соперник принял с ограничениями", "-": "соперник принял хорошо", "/": "заблокирован", "=": "ошибка"},
    "N": {"=": "нарушение"},
}

POINT_SKILLS = ("S", "A", "B", "G")


def terminal_winner(skill: str, evaluation: str) -> Side | None:
    """If this action of ours always ends the rally, who wins it."""
    if evaluation == "#" and skill in POINT_SKILLS:
        return "us"
    if evaluation == "=":
        return "them"
    if evaluation == "/" and skill in ("A", "B", "G"):
        return "them"
    return None
