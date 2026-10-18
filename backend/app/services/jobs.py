"""In-process background jobs. Single worker on purpose: ffmpeg and CV saturate the machine anyway."""

import logging
import time
import traceback
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from sqlmodel import Session, select

from app.db import engine
from app.models import Job

log = logging.getLogger(__name__)

JobContext = Callable[[float], None]
Handler = Callable[[dict, JobContext], dict | None]

_handlers: dict[str, Handler] = {}
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="krimson-job")


def handler(kind: str) -> Callable[[Handler], Handler]:
    def register(fn: Handler) -> Handler:
        _handlers[kind] = fn
        return fn
    return register


def _update(job_id: int, **fields) -> None:
    with Session(engine) as s:
        job = s.get(Job, job_id)
        if job is None:
            return
        for k, v in fields.items():
            setattr(job, k, v)
        s.add(job)
        s.commit()


def _run(job_id: int, kind: str, payload: dict) -> None:
    _update(job_id, status="running")
    last_report = 0.0

    def progress(value: float) -> None:
        nonlocal last_report
        now = time.monotonic()
        if now - last_report > 0.5 or value >= 1:
            last_report = now
            _update(job_id, progress=round(value, 4))

    try:
        result = _handlers[kind](payload, progress)
        _update(job_id, status="done", progress=1.0, result=result or {})
    except Exception as exc:  # noqa: BLE001  job failures are reported to the UI
        log.error("job %s failed: %s", job_id, traceback.format_exc())
        _update(job_id, status="failed", error=str(exc)[:2000])


def submit(session: Session, kind: str, payload: dict) -> Job:
    if kind not in _handlers:
        raise ValueError(f"unknown job kind {kind}")
    job = Job(kind=kind, payload=payload)
    session.add(job)
    session.commit()
    session.refresh(job)
    _executor.submit(_run, job.id, kind, payload)
    return job


def recover_interrupted() -> None:
    with Session(engine) as s:
        for job in s.exec(select(Job).where(Job.status.in_(("queued", "running")))):
            job.status = "failed"
            job.error = "Прервано перезапуском сервера"
            s.add(job)
        s.commit()
