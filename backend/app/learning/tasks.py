"""Background jobs for the learning page. Every job works within one scope (hall / general / team);
results become new versions in the model store, so other halls' models are never touched."""

import json
from pathlib import Path

from sqlmodel import Session

from app import config
from app.db import engine
from app.learning import ball_dataset, evaluate, players_dataset, train, tune
from app.learning.scope import Scope, parse
from app.modelstore import store
from app.models import Venue
from app.services import jobs


def dataset_dir(scope: Scope, kind: str) -> Path:
    return config.DATA_DIR / "datasets" / scope.file_tag / kind


def _scope(payload: dict, allowed: tuple[str, ...]) -> Scope:
    scope = parse(payload.get("scope"))
    if scope.kind not in allowed:
        raise ValueError(f"Эта задача не для области «{scope.key}»")
    return scope


def _verified(scope: Scope):
    with Session(engine) as s:
        sets = scope.verified_sets(s)
    if not sets:
        raise ValueError("Нет проверенных партий в этой области: отметьте партии «Проверена» после полной разметки")
    return sets


def _describe_venue(scope: Scope) -> None:
    """Saves the hall's display name next to its models so another device can recreate the hall."""
    if scope.kind != "venue":
        return
    from sqlmodel import select

    with Session(engine) as s:
        venue = s.exec(select(Venue).where(Venue.slug == scope.slug)).first()
    store().describe_venue(scope.slug, venue.name if venue else scope.slug)


def _prepared(scope: Scope, progress: jobs.JobContext, share: float = 0.1):
    prepared, skipped = evaluate.prepare(_verified(scope), lambda p: progress(p * share))
    if not prepared:
        raise ValueError("Ни одна проверенная партия не готова к оценке: " + "; ".join(skipped))
    return prepared, skipped


@jobs.handler("learn_evaluate")
def run_evaluate(payload: dict, progress: jobs.JobContext) -> dict:
    scope = _scope(payload, ("general", "venue"))
    prepared, skipped = _prepared(scope, progress)
    profile = scope.profile()
    report = evaluate.evaluate(prepared, profile.params) | {"skipped": skipped, "profile": profile.describe()}
    evaluate.save_report(scope.file_tag, report)
    return report


@jobs.handler("learn_tune")
def run_tune(payload: dict, progress: jobs.JobContext) -> dict:
    """New params version in this scope; activated only if it beats the current one on the verified sets."""
    scope = _scope(payload, ("general", "venue"))
    prepared, skipped = _prepared(scope, progress)
    result = tune.tune(prepared, scope.params(), lambda p: progress(0.1 + p * 0.9))
    version = None
    if result["improved"]:
        _describe_venue(scope)
        version = store().add_version(scope.key, "params", {
            "params": result["params"],
            "metrics": result["after"]["overall"],
            "baseline": result["before"]["overall"],
            "sets": [ps.gt.label for ps in prepared],
        })
        evaluate.save_report(scope.file_tag, result["after"] | {"skipped": skipped, "profile": scope.profile().describe()})
    return {k: v for k, v in result.items() if k != "params"} | {"skipped": skipped, "version": version}


@jobs.handler("learn_ball_dataset")
def run_ball_dataset(payload: dict, progress: jobs.JobContext) -> dict:
    scope = _scope(payload, ("general", "venue"))
    sets = [s for s in _verified(scope) if s.detections is not None]
    if not sets:
        raise ValueError("У проверенных партий нет детекций — сначала авторазметка")
    out = dataset_dir(scope, "ball")
    return ball_dataset.build(sets, out, progress) | {"path": str(out)}


@jobs.handler("learn_train_ball")
def run_train_ball(payload: dict, progress: jobs.JobContext) -> dict:
    """Not activated automatically: a new detector means recomputing detections for the videos."""
    scope = _scope(payload, ("general", "venue"))
    data = Path(payload["data"]) if payload.get("data") else dataset_dir(scope, "ball")
    if not (data / "data.yaml").is_file():
        raise ValueError("Сначала соберите датасет мяча")
    profile = scope.profile()
    base = profile.detector_weights()
    extra = {"epochs": payload["epochs"]} if payload.get("epochs") else {}
    weights, metrics = train.train_ball(data, progress, base=base, **extra)
    info_path = data / "info.json"
    _describe_venue(scope)
    version = store().add_version(scope.key, "ball", {
        "metrics": metrics,
        "base": profile.detector.tag if profile.detector else "stock yolo11s",
        "dataset": json.loads(info_path.read_text()) if info_path.is_file() else None,
    }, weights=weights, activate=False)
    return {"version": version, "metrics": metrics}


@jobs.handler("learn_players_dataset")
def run_players_dataset(payload: dict, progress: jobs.JobContext) -> dict:
    scope = _scope(payload, ("team",))
    out = dataset_dir(scope, "players")
    return players_dataset.build(_verified(scope), out, progress) | {"path": str(out)}


@jobs.handler("learn_train_players")
def run_train_players(payload: dict, progress: jobs.JobContext) -> dict:
    scope = _scope(payload, ("team",))
    data = Path(payload["data"]) if payload.get("data") else dataset_dir(scope, "players")
    if not (data / "train").is_dir():
        raise ValueError("Сначала соберите датасет игроков")
    extra = {"epochs": payload["epochs"]} if payload.get("epochs") else {}
    weights, metrics = train.train_players(data, progress, **extra)
    info_path = data / "info.json"
    version = store().add_version(scope.key, "players", {
        "metrics": metrics,
        "dataset": json.loads(info_path.read_text()) if info_path.is_file() else None,
    }, weights=weights)
    return {"version": version, "metrics": metrics}
