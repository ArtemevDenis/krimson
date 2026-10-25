"""Re-point videos to another location, e.g. after copying the database to the Windows machine:

    uv run python -m app.relocate D:/krimson/video

Each video is looked up by file name anywhere under the folder; its proxy is dropped if that file isn't there
(the app then streams the original). Detection files next to the video come along by name, so nothing else changes.
"""

import argparse
import sys
from pathlib import Path, PureWindowsPath

from sqlmodel import Session, select

from app.db import engine, init_db
from app.models import Video


def _file_name(stored: str) -> str:
    # The path may come from the other OS: Windows paths accept both separators, so this works for Mac paths too
    return PureWindowsPath(stored).name


def relocate(session: Session, folder: Path) -> list[tuple[Video, Path | None]]:
    by_name: dict[str, Path] = {}
    for path in folder.rglob("*"):
        if path.is_file():
            by_name.setdefault(path.name, path.resolve())
    result = []
    for video in session.exec(select(Video)):
        found = by_name.get(_file_name(video.original_path))
        if found is not None:
            video.original_path = str(found)
        if video.proxy_path and not Path(video.proxy_path).is_file():
            video.proxy_path = None
        session.add(video)
        result.append((video, found))
    session.commit()
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.relocate", description="Krimson: перенести пути к видео в другую папку")
    parser.add_argument("folder", type=Path, help="папка, где лежат видео (ищется и во вложенных папках)")
    args = parser.parse_args(argv)
    if not args.folder.is_dir():
        print(f"Нет папки {args.folder}", file=sys.stderr)
        return 1
    init_db()
    with Session(engine) as session:
        for video, found in relocate(session, args.folder):
            print(f"{'✓' if found else '—'} {_file_name(video.original_path)}: {found or 'не найдено, путь не изменён'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
