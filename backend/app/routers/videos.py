import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import config
from app.db import get_session
from app.cv.geometry import Court
from app.models import CourtCalibration, Video
from app.services import jobs, media
from app.services.sets import get_or_404

router = APIRouter(prefix="/api/videos", tags=["videos"])

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".mkv", ".avi"}


class VideoImport(BaseModel):
    path: str


class CalibrationIn(BaseModel):
    from_time: float = Field(default=0, ge=0)
    points: list[list[float]] = Field(min_length=6, max_length=6)


def _calibration_out(c: CourtCalibration) -> dict:
    return {**c.model_dump(), "error_m": round(Court.from_points(c.from_time, c.points).reprojection_error(), 2)}


def _register(session: Session, path: Path) -> Video:
    try:
        info = media.probe(path)
    except (subprocess.CalledProcessError, StopIteration) as exc:
        raise HTTPException(422, f"Не удалось прочитать видео: {exc}") from exc
    video = Video(original_path=str(path), duration=info.duration, fps=info.fps, width=info.width, height=info.height)
    session.add(video)
    session.commit()
    session.refresh(video)
    jobs.submit(session, "proxy", {"video_id": video.id})
    session.refresh(video)
    return video


@router.get("")
def list_videos(session: Session = Depends(get_session)) -> list[Video]:
    return list(session.exec(select(Video).order_by(Video.created_at.desc())))


@router.post("/import")
def import_by_path(body: VideoImport, session: Session = Depends(get_session)) -> Video:
    """Registers a file in place: multi-GB recordings are not copied."""
    path = Path(body.path.strip().strip("'\"")).expanduser()
    if not path.is_file():
        raise HTTPException(404, f"Файл не найден: {path}")
    if path.suffix.lower() not in VIDEO_SUFFIXES:
        raise HTTPException(422, f"Неподдерживаемый формат: {path.suffix}")
    return _register(session, path.resolve())


@router.post("/upload")
def upload(file: UploadFile, session: Session = Depends(get_session)) -> Video:
    name = Path(file.filename or "video.mp4").name
    target = config.UPLOADS_DIR / name
    counter = 1
    while target.exists():
        target = config.UPLOADS_DIR / f"{Path(name).stem}_{counter}{Path(name).suffix}"
        counter += 1
    with target.open("wb") as out:
        shutil.copyfileobj(file.file, out, length=16 * 1024 * 1024)
    return _register(session, target)


@router.get("/{video_id}")
def get_video(video_id: int, session: Session = Depends(get_session)) -> Video:
    return get_or_404(session, Video, video_id)


@router.post("/{video_id}/reprocess")
def reprocess(video_id: int, session: Session = Depends(get_session)) -> Video:
    video = get_or_404(session, Video, video_id)
    video.status, video.error = "pending", None
    session.add(video)
    session.commit()
    jobs.submit(session, "proxy", {"video_id": video_id})
    session.refresh(video)
    return video


@router.get("/{video_id}/stream")
def stream(video_id: int, session: Session = Depends(get_session)) -> FileResponse:
    video = get_or_404(session, Video, video_id)
    path = Path(video.proxy_path) if video.proxy_path and video.status == "ready" else Path(video.original_path)
    if not path.is_file():
        raise HTTPException(404, "Файл видео недоступен")
    return FileResponse(path, media_type="video/mp4")


@router.post("/{video_id}/detections")
def upload_detections(video_id: int, file: UploadFile, session: Session = Depends(get_session)) -> dict:
    """A detection file computed on the Windows machine (`<video>.krimson-det-….json.gz`): saved next to the video,
    where the analyzer looks for it. The name must belong to this video, the content must load."""
    from app.cv import detection

    video = get_or_404(session, Video, video_id)
    source = Path(video.original_path)
    name = Path(file.filename or "").name
    if not (name.startswith(f"{source.name}.krimson-") and name.endswith(".json.gz")):
        raise HTTPException(422, f"Файл должен называться «{source.name}.krimson-det….json.gz» — это расчёт для другого видео?")
    tmp = config.DATA_DIR / "cv" / f".upload-{name}"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    with tmp.open("wb") as out:
        shutil.copyfileobj(file.file, out, length=4 * 1024 * 1024)
    try:
        det = detection.load(tmp)
    except Exception as exc:  # noqa: BLE001 — anything unreadable is the user's wrong file
        tmp.unlink(missing_ok=True)
        raise HTTPException(422, f"Не удалось прочитать файл детекций: {exc}") from exc
    target = source.with_name(name)
    try:
        shutil.move(str(tmp), target)
    except OSError:
        target = config.DATA_DIR / "cv" / name
        shutil.move(str(tmp), target)
    return {"file": target.name, "frames": len(det.frames), "balls": sum(1 for f in det.frames if len(f.balls))}


@router.get("/{video_id}/calibrations")
def list_calibrations(video_id: int, session: Session = Depends(get_session)) -> list[dict]:
    get_or_404(session, Video, video_id)
    rows = session.exec(select(CourtCalibration).where(CourtCalibration.video_id == video_id).order_by(CourtCalibration.from_time))
    return [_calibration_out(c) for c in rows]


@router.post("/{video_id}/calibrations")
def add_calibration(video_id: int, body: CalibrationIn, session: Session = Depends(get_session)) -> list[dict]:
    """A calibration at the same moment replaces the old one (re-clicking the court)."""
    get_or_404(session, Video, video_id)
    if any(len(p) != 2 for p in body.points):
        raise HTTPException(422, "Каждая точка — пара [x, y]")
    try:
        Court.from_points(body.from_time, body.points)
    except (ValueError, ArithmeticError) as exc:
        raise HTTPException(422, f"Не удалось построить площадку: {exc}") from exc
    for old in session.exec(select(CourtCalibration).where(CourtCalibration.video_id == video_id)):
        if abs(old.from_time - body.from_time) < 1.0:
            session.delete(old)
    session.add(CourtCalibration(video_id=video_id, from_time=body.from_time, points=body.points))
    session.commit()
    return list_calibrations(video_id, session)


@router.delete("/calibrations/{calibration_id}")
def delete_calibration(calibration_id: int, session: Session = Depends(get_session)) -> list[dict]:
    cal = get_or_404(session, CourtCalibration, calibration_id)
    video_id = cal.video_id
    session.delete(cal)
    session.commit()
    return list_calibrations(video_id, session)
