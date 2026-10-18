from dataclasses import asdict

from fastapi import HTTPException
from sqlmodel import Session, select

from app.domain import rotation, stats
from app.models import Action, GameSet, Match, Player, Rally, Suggestion, Video


def get_or_404[T](session: Session, model: type[T], obj_id: int) -> T:
    obj = session.get(model, obj_id)
    if obj is None:
        raise HTTPException(404, f"{model.__name__} {obj_id} не найден")
    return obj


def load_rallies(session: Session, set_id: int) -> list[tuple[Rally, list[Action]]]:
    rallies = session.exec(select(Rally).where(Rally.set_id == set_id).order_by(Rally.index)).all()
    ids = [r.id for r in rallies]
    actions = session.exec(select(Action).where(Action.rally_id.in_(ids)).order_by(Action.order)).all() if ids else []
    by_rally: dict[int, list[Action]] = {}
    for a in actions:
        by_rally.setdefault(a.rally_id, []).append(a)
    return [(r, by_rally.get(r.id, [])) for r in rallies]


def team_players(session: Session, team_id: int) -> list[Player]:
    return list(session.exec(select(Player).where(Player.team_id == team_id).order_by(Player.number)).all())


def set_config(game_set: GameSet, players: list[Player]) -> rotation.SetConfig | None:
    if len(game_set.lineup) != 6:
        return None
    return rotation.SetConfig(
        lineup=list(game_set.lineup),
        libero_ids=list(game_set.libero_ids),
        we_serve_first=game_set.we_serve_first,
        positions={p.id: p.position for p in players},
    )


def replay_set(game_set: GameSet, players: list[Player], rallies: list[tuple[Rally, list[Action]]]):
    config = set_config(game_set, players)
    if config is None:
        return None, None
    inputs = [
        rotation.RallyInput(
            winner=r.winner,  # type: ignore[arg-type]
            substitutions=[rotation.Substitution(s["out_id"], s["in_id"]) for s in r.substitutions],
        )
        for r, _ in rallies
    ]
    return rotation.replay(config, inputs)


def stat_records(session: Session, game_set: GameSet, players: list[Player]) -> list[stats.RallyRecord]:
    rallies = load_rallies(session, game_set.id)
    states, _ = replay_set(game_set, players, rallies)
    if states is None:
        return []
    return [
        stats.RallyRecord(
            state=state,
            winner=rally.winner,  # type: ignore[arg-type]
            actions=[stats.ActionRecord(a.player_id, a.skill, a.evaluation) for a in actions],
        )
        for state, (rally, actions) in zip(states, rallies)
    ]


def workspace(session: Session, set_id: int) -> dict:
    """Everything the tagging screen needs in one payload; returned after every mutation."""
    game_set = get_or_404(session, GameSet, set_id)
    match = get_or_404(session, Match, game_set.match_id)
    players = team_players(session, match.team_id)
    video = session.get(Video, game_set.video_id) if game_set.video_id else None
    rallies = load_rallies(session, set_id)
    states, final = replay_set(game_set, players, rallies)

    return {
        "set": game_set.model_dump(),
        "match": match.model_dump(mode="json"),
        "video": video.model_dump(mode="json") if video else None,
        "players": [p.model_dump() for p in players],
        "rallies": [
            {
                **rally.model_dump(),
                "actions": [a.model_dump() for a in actions],
                "state": asdict(states[i]) if states else None,
            }
            for i, (rally, actions) in enumerate(rallies)
        ],
        "suggestions": [
            sg.model_dump()
            for sg in session.exec(
                select(Suggestion).where(Suggestion.set_id == set_id, Suggestion.status == "pending").order_by(Suggestion.time)
            )
        ],
        "current": asdict(final) if final else None,
        "finished": rotation.is_set_finished(final.our_score, final.their_score, game_set.number) if final else False,
    }
