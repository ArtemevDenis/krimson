import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from app import config
from app.db import get_session
from app.models import Video
from app.services import jobs, media
from app.services.sets import get_or_404

router = APIRouter(prefix="/api/videos", tags=["videos"])

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".mkv", ".avi"}


class VideoImport(BaseModel):
    path: str


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
