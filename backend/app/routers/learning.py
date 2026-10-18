import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, func, select

from app.cv import registry
from app.db import get_session
from app.learning import evaluate
from app.learning.groundtruth import load_verified, suggestion_stats
from app.learning.players_dataset import examples_per_player
from app.learning.scope import Scope, parse
from app.learning.tasks import dataset_dir
from app.modelstore import GENERAL, KINDS, store
from app.models import GameSet, Player, Team, Venue
from app.services import jobs

router = APIRouter(prefix="/api/learning", tags=["learning"])

JOB_KINDS = {
    "evaluate": "learn_evaluate",
    "tune": "learn_tune",
    "ball_dataset": "learn_ball_dataset",
    "train_ball": "learn_train_ball",
    "players_dataset": "learn_players_dataset",
    "train_players": "learn_train_players",
}
NEEDS_CV = {"ball_dataset", "train_ball", "players_dataset", "train_players"}

# Rough amounts below which training is not worth it (shown as hints, not enforced)
MIN_SETS_BALL = 3
MIN_EXAMPLES_PLAYER = 15


class VersionRef(BaseModel):
    scope: str
    kind: str = Field(pattern="^(params|ball|players)$")
    version: str | None = None


def _scope_or_422(key: str | None) -> Scope:
    try:
        return parse(key)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def _dataset_info(scope: Scope, kind: str) -> dict | None:
    path = dataset_dir(scope, kind) / "info.json"
    return json.loads(path.read_text()) if path.is_file() else None


def _versions(scope: str, kinds: tuple[str, ...]) -> dict[str, list[dict]]:
    s = store()
    return {kind: [v.to_dict() for v in s.versions(scope, kind)] for kind in kinds}


@router.get("/scopes")
def scopes(session: Session = Depends(get_session)) -> list[dict]:
    """General + every hall (from the database and from models/ pulled via git) + every team."""
    verified = load_verified(session)
    by_venue: dict[str | None, int] = {}
    by_team: dict[str | None, int] = {}
    for gt in verified:
        by_venue[gt.venue_slug] = by_venue.get(gt.venue_slug, 0) + 1
        by_team[gt.team_slug] = by_team.get(gt.team_slug, 0) + 1

    out = [{"scope": GENERAL, "kind": "general", "label": "Общая модель (все залы)", "verified_sets": len(verified)}]
    venues = {v.slug: v.name for v in session.exec(select(Venue).order_by(Venue.name))}
    for slug, name in {**store().known_venues(), **venues}.items():
        out.append({"scope": f"venue/{slug}", "kind": "venue", "label": name, "verified_sets": by_venue.get(slug, 0)})
    for team in session.exec(select(Team).order_by(Team.name)):
        if team.slug:
            out.append({"scope": f"team/{team.slug}", "kind": "team", "label": team.name, "verified_sets": by_team.get(team.slug, 0)})
    return out


@router.get("/summary")
def summary(scope: str | None = None, session: Session = Depends(get_session)) -> dict:
    sc = _scope_or_422(scope)
    verified = sc.verified_sets(session)
    sets = []
    for gt in verified:
        actions = [a for r in gt.rallies for a in r.actions]
        sets.append({
            "set_id": gt.set_id,
            "label": gt.label,
            "rallies": len(gt.rallies),
            "actions": len(actions),
            "precise_actions": sum(a.precise for a in actions),
            "with_player_box": sum(a.player_box is not None and a.player_id is not None for a in actions),
            "has_detections": gt.detections is not None,
            "has_calibration": bool(gt.calibrations),
        })
    ready_sets = sum(s["has_detections"] and s["has_calibration"] for s in sets)

    players: list[dict] = []
    if sc.kind == "team":
        examples = examples_per_player(verified)
        roster = {p.id: p for p in session.exec(select(Player).where(Player.id.in_(list(examples))))} if examples else {}
        players = sorted(
            ({"player_id": pid, "number": roster[pid].number if pid in roster else None,
              "name": roster[pid].name if pid in roster else "?", "examples": n} for pid, n in examples.items()),
            key=lambda p: -p["examples"],
        )

    return {
        "scope": sc.key,
        "scope_kind": sc.kind,
        "cv_installed": registry.cv_installed(),
        "total_sets": session.exec(select(func.count()).select_from(GameSet)).one(),
        "verified_sets": sets,
        "players": players,
        "suggestions": suggestion_stats(session),
        "readiness": {
            "tune": ready_sets >= 1,
            "ball": ready_sets >= MIN_SETS_BALL,
            "players": sum(p["examples"] >= MIN_EXAMPLES_PLAYER for p in players) >= 2,
            "min_sets_ball": MIN_SETS_BALL,
            "min_examples_player": MIN_EXAMPLES_PLAYER,
        },
        "profile": sc.profile().describe() if sc.kind != "team" else None,
        "last_evaluation": evaluate.last_report(sc.file_tag),
        "datasets": {"ball": _dataset_info(sc, "ball"), "players": _dataset_info(sc, "players")},
        "versions": _versions(sc.key, ("players",) if sc.kind == "team" else ("params", "ball")),
    }


@router.post("/run/{kind}")
def run(kind: str, scope: str | None = None, session: Session = Depends(get_session)) -> dict:
    if kind not in JOB_KINDS:
        raise HTTPException(404, f"Неизвестная задача {kind}")
    if kind in NEEDS_CV and not registry.cv_installed():
        raise HTTPException(422, "CV-зависимости не установлены: `uv sync --extra cv`")
    sc = _scope_or_422(scope)
    return jobs.submit(session, JOB_KINDS[kind], {"scope": sc.key}).model_dump(mode="json")


@router.post("/versions/activate")
def activate(body: VersionRef) -> dict:
    """Also the rollback: point the scope at any earlier version (or none → fall back to general/stock)."""
    sc = _scope_or_422(body.scope)
    if body.kind not in KINDS:
        raise HTTPException(422, "Неизвестный вид модели")
    try:
        store().set_active(sc.key, body.kind, body.version)
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    return _versions(sc.key, (body.kind,))


@router.post("/versions/delete")
def delete_version(body: VersionRef) -> dict:
    sc = _scope_or_422(body.scope)
    if body.version is None:
        raise HTTPException(422, "Не указана версия")
    try:
        store().delete(sc.key, body.kind, body.version)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return _versions(sc.key, (body.kind,))
