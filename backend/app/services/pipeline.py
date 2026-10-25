"""Where a set is in the processing pipeline: what's done, what needs a look, what to do next.

video → lineup → court → rallies (whistles) → people (Mac) → players pass → ball (Windows) → suggestions → tagging
→ training. People and the ball are independent: the players pass can be done while the Windows machine works.
"""

from functools import lru_cache
from pathlib import Path

from sqlmodel import Session, select

from app import config
from app.cv import detection
from app.models import CourtCalibration, GameSet, Job, Match, PlayerMark, Rally, Suggestion, Venue, Video
from app.services.sets import get_or_404

SURE_RALLY = 0.75
SERVE_OFFSET_SECONDS = 1.0  # the players pass stops this long after a rally's start
MARK_NEAR_SECONDS = 0.5


@lru_cache(maxsize=32)
def _has_balls(path: str, _mtime: float) -> bool:
    return any(len(f.balls) for f in detection.load(Path(path)).frames[:3000])


def ball_source(video: Path) -> Path | None:
    for path in detection.existing_sidecars(video, config.DATA_DIR / "cv"):
        if _has_balls(str(path), path.stat().st_mtime):
            return path
    return None


def _job(session: Session, kind: str, set_id: int) -> Job | None:
    jobs = session.exec(select(Job).where(Job.kind == kind).order_by(Job.id.desc()).limit(30))
    return next((j for j in jobs if j.payload.get("set_id") == set_id), None)


def _step(key: str, title: str, status: str, detail: str, action: str | None = None, **extra) -> dict:
    return {"key": key, "title": title, "status": status, "detail": detail, "action": action, **extra}


def _with_job(step: dict, job: Job | None) -> dict:
    """A running job overrides the step's status; a failed one shows its error."""
    if job is None:
        return step
    if job.status in ("queued", "running"):
        return {**step, "status": "running", "progress": job.progress, "job_id": job.id}
    if job.status == "failed" and step["status"] != "done":
        return {**step, "status": "attention", "detail": f"Ошибка: {job.error or 'неизвестно'}"}
    return step


def pipeline(session: Session, set_id: int) -> list[dict]:
    game_set = get_or_404(session, GameSet, set_id)
    match = get_or_404(session, Match, game_set.match_id)
    venue = session.get(Venue, match.venue_id) if match.venue_id else None
    video = session.get(Video, game_set.video_id) if game_set.video_id else None
    path = Path(video.original_path) if video else None
    steps: list[dict] = []

    # 1. Video
    if video is None:
        steps.append(_step("video", "Видео", "todo", "Подключите запись партии", "video"))
    elif video.status != "ready":
        steps.append(_step("video", "Видео", "running" if video.status in ("pending", "processing") else "attention",
                           "Готовится облегчённая копия для просмотра" if video.status != "failed" else f"Ошибка: {video.error}"))
    else:
        steps.append(_step("video", "Видео", "done", Path(video.original_path).name))

    # 2. Lineup
    lineup_ok = len(game_set.lineup) == 6
    steps.append(_step("lineup", "Состав и расстановка", "done" if lineup_ok else "todo",
                       "Расстановка, роли, либеро" if lineup_ok else "Задайте расстановку партии", None if lineup_ok else "lineup"))

    # 3. Court
    calibrations = list(session.exec(select(CourtCalibration).where(CourtCalibration.video_id == video.id))) if video else []
    steps.append(_step("court", "Площадка", "done" if calibrations else ("todo" if video else "blocked"),
                       f"Разметок: {len(calibrations)}" if calibrations else "Разметьте площадку (8 кликов)",
                       None if calibrations else "court"))

    # 4. Rallies from whistles
    rallies = list(session.exec(select(Rally).where(Rally.set_id == set_id).order_by(Rally.index)))
    timed = [r for r in rallies if r.start_time is not None and r.end_time is not None]
    doubtful = [r for r in rallies if r.source == "auto" and r.confidence is not None and r.confidence < SURE_RALLY]
    if not video:
        steps.append(_step("rallies", "Розыгрыши по свисткам", "blocked", "Нужно видео"))
    elif not rallies:
        steps.append(_with_job(_step("rallies", "Розыгрыши по свисткам", "todo", "Найти розыгрыши по свисткам судьи — секунды",
                                     "find_rallies"), _job(session, "find_rallies", set_id)))
    else:
        steps.append(_with_job(_step(
            "rallies", "Розыгрыши по свисткам", "attention" if doubtful else "done",
            f"{len(rallies)} розыгрышей" + (f", {len(doubtful)} под вопросом — проверьте" if doubtful else ""),
            "review_rallies" if doubtful else None, doubtful=len(doubtful),
        ), _job(session, "find_rallies", set_id)))

    # 5. People (Mac)
    persons = detection.persons_source(path, config.DATA_DIR / "cv") if path else None
    if persons is not None:
        steps.append(_step("persons", "Люди на видео", "done", "Найдены (на этом устройстве или в общем расчёте)"))
    else:
        steps.append(_with_job(_step("persons", "Люди на видео", "todo" if calibrations else "blocked",
                                     "Найти людей на видео — на Mac, около 10–20 минут на партию" if calibrations else "Нужна площадка",
                                     "detect_persons" if calibrations else None), _job(session, "detect_persons", set_id)))

    # 6. Players pass
    marks = list(session.exec(select(PlayerMark).where(PlayerMark.set_id == set_id)))
    serve_moments = [r.start_time + SERVE_OFFSET_SECONDS for r in timed]
    marked = sum(1 for t in serve_moments if any(abs(m.time - t) <= MARK_NEAR_SECONDS for m in marks))
    if persons is None or not timed:
        steps.append(_step("players", "Игроки", "blocked", "Нужны розыгрыши и люди на видео"))
    else:
        status = "done" if marked == len(serve_moments) else ("attention" if marked else "todo")
        steps.append(_step("players", "Игроки", status, f"Отмечено розыгрышей: {marked} из {len(serve_moments)}",
                           None if status == "done" else "players_pass", marked=marked, total=len(serve_moments)))

    # 7. Ball (Windows)
    ball = ball_source(path) if path else None
    if ball is not None:
        steps.append(_step("ball", "Мяч", "done", ball.name))
    else:
        slug = venue.slug if venue else None
        hint = (f".\\precompute.ps1 --what ball{' --venue ' + slug if slug else ''} <путь к {path.name if path else 'видео'}>"
                if path else "")
        steps.append(_step("ball", "Мяч", "todo" if path else "blocked",
                           "Посчитать на Windows и загрузить файл сюда", "upload_ball" if path else None, command=hint))

    # 8. Suggestions
    pending = len(list(session.exec(select(Suggestion.id).where(Suggestion.set_id == set_id, Suggestion.status == "pending"))))
    reviewed = len(list(session.exec(select(Suggestion.id).where(Suggestion.set_id == set_id, Suggestion.status != "pending"))))
    analyze = _job(session, "analyze_set", set_id)
    if ball is None or not calibrations:
        steps.append(_step("suggestions", "Подсказки касаний", "blocked", "Нужны мяч и площадка"))
    elif pending or reviewed or (analyze and analyze.status == "done"):
        steps.append(_with_job(_step("suggestions", "Подсказки касаний", "done",
                                     f"К проверке: {pending}, проверено: {reviewed}", "analyze"), analyze))
    else:
        steps.append(_with_job(_step("suggestions", "Подсказки касаний", "todo", "Касания по мячу, номер по ведению игроков",
                                     "analyze"), analyze))

    # 9. Tagging
    won = sum(1 for r in rallies if r.winner is not None)
    if game_set.verified:
        steps.append(_step("tagging", "Разметка действий", "done", "Партия проверена"))
    elif not rallies:
        steps.append(_step("tagging", "Разметка действий", "blocked", "Нужны розыгрыши"))
    else:
        steps.append(_step("tagging", "Разметка действий", "attention" if won else "todo",
                           f"Розыгрышей со счётом: {won} из {len(rallies)}. Когда всё размечено — «Отметить проверенной»",
                           "tagging"))

    # 10. Training
    steps.append(_step("training", "Обучение", "todo" if game_set.verified else "blocked",
                       "Проверенная партия пойдёт в обучение: «Обучение» → зал" if game_set.verified else "После проверки партии",
                       "learning" if game_set.verified else None))
    return steps
