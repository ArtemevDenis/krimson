"""Training wrappers. Run on the Windows/CUDA machine for reasonable speed; they work on Mac (MPS) too.
They return the path of the best weights; the caller stores them as a new version in the model store."""

from pathlib import Path

from app import config
from app.cv.base import ProgressFn
from app.cv.detection import pick_device, stock_weights


def _progress_callback(epochs: int, progress: ProgressFn):
    def on_epoch_end(trainer) -> None:
        progress(min((trainer.epoch + 1) / epochs, 0.99))
    return on_epoch_end


def _metrics(results) -> dict:
    data = getattr(results, "results_dict", {}) or {}
    return {k.replace("metrics/", ""): round(float(v), 4) for k, v in data.items()}


def train_ball(
    dataset: Path, progress: ProgressFn, base: Path | None = None, epochs: int = 60, imgsz: int = 1280, batch: int | None = None
) -> tuple[Path, dict]:
    """Starts from `base` (the hall's current detector, or the general one) so a new hall builds on what was
    already learned; falls back to the small stock model."""
    from ultralytics import YOLO

    device = pick_device()
    if batch is None:
        batch = -1 if device == "cuda" else 4  # auto batch sizing works only on CUDA
    model = YOLO(base or stock_weights("yolo11s.pt"))
    model.add_callback("on_fit_epoch_end", _progress_callback(epochs, progress))
    results = model.train(
        data=str(dataset / "data.yaml"), epochs=epochs, imgsz=imgsz, batch=batch, device=device,
        project=str(config.TRAINING_RUNS), name="ball", exist_ok=True, patience=15, verbose=False,
        fliplr=0.5, mosaic=0.5, scale=0.3,
        classes=[0, 32],  # only person and ball are labeled; other COCO classes are ignored
    )
    return Path(model.trainer.best), _metrics(results)


def train_players(dataset: Path, progress: ProgressFn, epochs: int = 40, imgsz: int = 224) -> tuple[Path, dict]:
    from ultralytics import YOLO

    model = YOLO(stock_weights("yolo11n-cls.pt"))
    model.add_callback("on_fit_epoch_end", _progress_callback(epochs, progress))
    results = model.train(
        data=str(dataset), epochs=epochs, imgsz=imgsz, device=pick_device(),
        project=str(config.TRAINING_RUNS), name="players", exist_ok=True, patience=10, verbose=False,
        fliplr=0.0,  # a mirrored number is not the same number
    )
    return Path(model.trainer.best), _metrics(results)
