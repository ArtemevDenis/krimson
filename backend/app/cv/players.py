"""Recognizing our players from a crop around their box. A classifier over the team roster (not jersey OCR):
it learns the whole look — number, build, kit, knee pads — so it also works when the number is hidden."""

from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

from app.cv.base import ActionHint, ProgressFn

CROP_PAD = 0.15  # extra context around the person box
MIN_CONFIDENCE = 0.5


def crop_box(frame: np.ndarray, box: tuple[float, float, float, float] | list[float]) -> np.ndarray | None:
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = box
    pw, ph = (x2 - x1) * CROP_PAD, (y2 - y1) * CROP_PAD
    a, b = int(max(0, (x1 - pw) * w)), int(max(0, (y1 - ph) * h))
    c, d = int(min(w, (x2 + pw) * w)), int(min(h, (y2 + ph) * h))
    if c - a < 8 or d - b < 16:
        return None
    return frame[b:d, a:c]


def read_frames(video: Path, times: list[float]):
    """Yields (time, frame) for sorted times; seeks only when the next time is far ahead."""
    import cv2

    cap = cv2.VideoCapture(str(video))
    try:
        for t in sorted(times):
            pos = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if not (0 <= t - pos < 1.0):
                cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, t - 0.05) * 1000)
            frame = None
            while True:
                ok, f = cap.read()
                if not ok:
                    break
                frame = f
                if cap.get(cv2.CAP_PROP_POS_MSEC) / 1000 >= t:
                    break
            if frame is not None:
                yield t, frame
    finally:
        cap.release()


@dataclass
class PlayerClassifier:
    path: Path

    def __post_init__(self) -> None:
        from ultralytics import YOLO

        self.model = YOLO(self.path)

    def classify(self, crops: list[np.ndarray]) -> list[tuple[int, float]]:
        from app.cv.detection import pick_device

        results = self.model.predict(crops, device=pick_device(), verbose=False)
        out = []
        for r in results:
            idx = int(r.probs.top1)
            out.append((int(self.model.names[idx]), float(r.probs.top1conf)))
        return out


def label_hints(video: Path, hints: list[ActionHint], classifier: PlayerClassifier, progress: ProgressFn) -> list[ActionHint]:
    with_box = [h for h in hints if h.player_box is not None]
    labeled: dict[float, tuple[int, float]] = {}
    batch: list[tuple[float, np.ndarray]] = []
    for i, (t, frame) in enumerate(read_frames(video, [h.time for h in with_box])):
        hint = next(h for h in with_box if h.time == t)
        crop = crop_box(frame, hint.player_box)  # type: ignore[arg-type]
        if crop is not None:
            batch.append((t, crop))
        if len(batch) >= 32:
            labeled.update(zip([b[0] for b in batch], classifier.classify([b[1] for b in batch])))
            batch = []
        progress(i / max(len(with_box), 1))
    if batch:
        labeled.update(zip([b[0] for b in batch], classifier.classify([b[1] for b in batch])))

    out = []
    for h in hints:
        pid, conf = labeled.get(h.time, (None, None))
        if pid is not None and conf is not None and conf >= MIN_CONFIDENCE:
            out.append(replace(h, player_id=pid, player_confidence=round(conf, 2)))
        else:
            out.append(h)
    return out
