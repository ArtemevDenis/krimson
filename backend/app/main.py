import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import config
from app.db import init_db
from app.routers import highlights, matches, stats, teams, videos
from app.services import jobs, media
from app.services import tasks  # noqa: F401  registers job handlers

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    media.require_ffmpeg()
    init_db()
    jobs.recover_interrupted()
    yield


app = FastAPI(title="Krimson", lifespan=lifespan)
for router in (teams.router, videos.router, matches.router, stats.router, highlights.router):
    app.include_router(router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# Built frontend is served by the same process, so `npm run build` + backend is the whole app
if config.FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (config.FRONTEND_DIST / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(config.FRONTEND_DIST.resolve()):
            return FileResponse(candidate)
        return FileResponse(config.FRONTEND_DIST / "index.html")
