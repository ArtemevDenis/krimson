"""YOLO pass over a video — the only expensive CV step, so its output is cached in a sidecar file
next to the video (`<video>.krimson-det.json.gz`). It can be computed on the Windows/CUDA machine
with `python -m app.cv.precompute` and copied over together with the video."""

import gzip
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from app import config
from app.cv.base import ProgressFn

FORMAT_VERSION = 1
BALL_NAMES = ("sports ball", "ball")
STOCK_DETECTOR = "yolo11m.pt"


@dataclass(frozen=True)
class DetectionSettings:
    model: str = STOCK_DETECTOR  # stock weights name, or a path to fine-tuned weights from the model store
    tag: str = ""  # model version tag for the cache file name; empty for the stock model
    imgsz: int = 1920
    fps: float = 15.0
    ball_conf: float = 0.1
    person_conf: float = 0.3


@dataclass
class Frame:
    t: float
    balls: np.ndarray  # (n, 4): cx, cy, size, conf — normalized
    persons: np.ndarray  # (m, 5): x1, y1, x2, y2, conf — normalized


@dataclass
class Detections:
    settings: DetectionSettings
    frames: list[Frame] = field(default_factory=list)

    def to_json(self) -> dict:
        r = lambda a: np.round(a, 4).tolist()  # noqa: E731
        return {
            "version": FORMAT_VERSION,
            "settings": self.settings.__dict__,
            "frames": [{"t": round(f.t, 3), "b": r(f.balls), "p": r(f.persons)} for f in self.frames],
        }

    @classmethod
    def from_json(cls, data: dict) -> "Detections":
        if data.get("version") != FORMAT_VERSION:
            raise ValueError("Устаревший формат файла детекций — пересчитайте")
        frames = [
            Frame(f["t"], np.asarray(f["b"], dtype=float).reshape(-1, 4), np.asarray(f["p"], dtype=float).reshape(-1, 5))
            for f in data["frames"]
        ]
        known = {k: v for k, v in data["settings"].items() if k in DetectionSettings.__dataclass_fields__}
        return cls(DetectionSettings(**known), frames)


def sidecar_path(video: Path, tag: str = "") -> Path:
    """One cache per detector version, so a fine-tuned detector doesn't silently reuse stock detections."""
    return video.with_name(f"{video.name}.krimson-det{'-' + tag if tag else ''}.json.gz")


def existing_sidecars(video: Path, cache_dir: Path | None) -> list[Path]:
    dirs = [video.parent] + ([cache_dir] if cache_dir is not None and cache_dir.is_dir() else [])
    found = [p for d in dirs for p in d.glob(f"{video.name}.krimson-det*.json.gz")]
    return sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)


def save(det: Detections, path: Path) -> None:
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump(det.to_json(), f, separators=(",", ":"))
    tmp.replace(path)


def load(path: Path) -> Detections:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return Detections.from_json(json.load(f))


def pick_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def stock_weights(name: str) -> Path:
    """Stock Ultralytics weights, downloaded once into data/weights (not into the git-tracked models/)."""
    from ultralytics.utils.downloads import attempt_download_asset

    path = config.WEIGHTS_CACHE / name
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        attempt_download_asset(path)
    return path


def model_path(name: str) -> Path:
    path = Path(name)
    if path.is_absolute():
        if not path.is_file():
            raise FileNotFoundError(f"Нет файла модели {path}")
        return path
    return stock_weights(name)


def class_ids(names: dict[int, str]) -> tuple[int, int]:
    """Stock COCO model and our fine-tuned one number classes differently — look them up by name."""
    person = next(i for i, n in names.items() if n == "person")
    ball = next(i for i, n in names.items() if n in BALL_NAMES)
    return person, ball


def run(video: Path, settings: DetectionSettings, progress: ProgressFn) -> Detections:
    import cv2
    from ultralytics import YOLO

    model = YOLO(model_path(settings.model))
    person_id, ball_id = class_ids(model.names)
    device = pick_device()
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"Не удалось открыть видео {video}")
    duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / max(cap.get(cv2.CAP_PROP_FPS), 1)
    det = Detections(settings)
    step = 1.0 / settings.fps
    next_t = 0.0
    conf = min(settings.ball_conf, settings.person_conf)
    try:
        # Sequential decode + time-based skipping: phone footage is variable-frame-rate
        while True:
            if not cap.grab():
                break
            t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if t + 1e-6 < next_t:
                continue
            next_t = t + step
            ok, frame = cap.retrieve()
            if not ok:
                continue
            h, w = frame.shape[:2]
            res = model.predict(frame, imgsz=settings.imgsz, classes=[person_id, ball_id], conf=conf, device=device, verbose=False)[0]
            cls = res.boxes.cls.cpu().numpy()
            scores = res.boxes.conf.cpu().numpy()
            xyxy = res.boxes.xyxy.cpu().numpy() / np.array([w, h, w, h])
            ball = (cls == ball_id) & (scores >= settings.ball_conf)
            person = (cls == person_id) & (scores >= settings.person_conf)
            b = xyxy[ball]
            balls = np.column_stack([(b[:, 0] + b[:, 2]) / 2, (b[:, 1] + b[:, 3]) / 2, np.maximum(b[:, 2] - b[:, 0], b[:, 3] - b[:, 1]), scores[ball]])
            persons = np.column_stack([xyxy[person], scores[person]])
            det.frames.append(Frame(t, balls.reshape(-1, 4), persons.reshape(-1, 5)))
            if duration > 0:
                progress(min(t / duration, 0.999))
    finally:
        cap.release()
    return det


def load_or_run(video: Path, settings: DetectionSettings, progress: ProgressFn, cache_dir: Path | None = None) -> Detections:
    """Prefers detections of the requested model; otherwise reuses any existing cache (e.g. computed on the
    Windows machine with another model) rather than spending an hour recomputing. Computes only if none exist."""
    preferred = [sidecar_path(video, settings.tag)]
    if cache_dir is not None:
        preferred.append(cache_dir / sidecar_path(video, settings.tag).name)
    for path in [*preferred, *existing_sidecars(video, cache_dir)]:
        if path.is_file():
            progress(1.0)
            return load(path)
    det = run(video, settings, progress)
    try:
        save(det, preferred[0])
    except OSError:
        # Video folder may be read-only — fall back to the app's data dir
        if cache_dir is None:
            raise
        cache_dir.mkdir(parents=True, exist_ok=True)
        save(det, preferred[1])
    return det
