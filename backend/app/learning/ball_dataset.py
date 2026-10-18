"""YOLO dataset of the user's hall from verified rallies.

Labels come from ball tracks inside verified rallies (consistent flights, not stray detections), and the
gaps where the stock detector lost the ball mid-flight are filled by interpolation — exactly the frames
the fine-tuned model should learn. Static false positives (wall clock, spare balls) get no label, so they
become background. Persons are labeled from confident stock detections to keep the second class."""

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np

from app.cv import tracking
from app.cv.base import ProgressFn
from app.cv.detection import Frame
from app.cv.profile import resolve
from app.cv.players import read_frames
from app.learning.groundtruth import GtSet

PERSON_CONF = 0.5
# COCO numbering is kept (person=0, sports ball=32) so fine-tuning reuses the pretrained detection head
# instead of learning a fresh 2-class head from scratch
PERSON_CLASS, BALL_CLASS = 0, 32
DEFAULT_BALL_SIZE = 0.02  # height share of the frame; detection 'size' is the box's larger normalized side
MAX_INTERP_GAP = 0.3  # don't invent the ball across long gaps
VAL_SHARE = 0.15


def _ball_labels(frames: list[Frame], gt: GtSet) -> dict[int, tuple[float, float, float]]:
    """frame index -> (cx, cy, size) for frames inside verified rallies."""
    p = resolve(gt.venue_slug, None).params  # the same thresholds the hall is analyzed with
    times = np.array([f.t for f in frames])
    labels: dict[int, tuple[float, float, float]] = {}
    for tr in tracking.link_tracks(frames, p):
        if not any(r.start <= tr.start <= r.end or r.start <= tr.end <= r.end for r in gt.rallies):
            continue
        t = np.asarray(tr.t)
        lo, hi = np.searchsorted(times, t[0]), np.searchsorted(times, t[-1], side="right")
        for idx in range(lo, hi):
            ft = times[idx]
            k = int(np.searchsorted(t, ft))
            exact = k < len(t) and abs(t[k] - ft) < 1e-3
            if not exact:
                left, right = max(k - 1, 0), min(k, len(t) - 1)
                if t[right] - t[left] > MAX_INTERP_GAP:
                    continue
            x = float(np.interp(ft, t, tr.x))
            y = float(np.interp(ft, t, tr.y))
            size = DEFAULT_BALL_SIZE
            balls = frames[idx].balls
            if len(balls):
                d = np.hypot(balls[:, 0] - x, balls[:, 1] - y)
                if d.min() < 0.02:
                    size = float(balls[int(d.argmin()), 2])
            labels[idx] = (x, y, max(size, 0.01))
    return labels


def _split(key: str) -> str:
    return "val" if int(hashlib.md5(key.encode()).hexdigest(), 16) % 100 < VAL_SHARE * 100 else "train"


def build(sets: list[GtSet], out: Path, progress: ProgressFn, max_frames_per_set: int = 600) -> dict:
    if out.exists():
        shutil.rmtree(out)
    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True)
        (out / "labels" / split).mkdir(parents=True)

    import cv2

    counts = {"train": 0, "val": 0}
    usable = [s for s in sets if s.detections is not None]
    for si, gt in enumerate(usable):
        frames = gt.load_frames()
        labels = _ball_labels(frames, gt)
        chosen = sorted(labels)
        if len(chosen) > max_frames_per_set:
            step = len(chosen) / max_frames_per_set
            chosen = [chosen[int(i * step)] for i in range(max_frames_per_set)]
        by_time = {round(frames[i].t, 3): i for i in chosen}
        for n, (t, image) in enumerate(read_frames(gt.video, [frames[i].t for i in chosen])):
            idx = by_time.get(round(t, 3))
            if idx is None:
                continue
            rally = next((r for r in gt.rallies if r.start <= t <= r.end), None)
            split = _split(f"{gt.set_id}:{rally.rally_id if rally else 0}")
            name = f"s{gt.set_id}_{int(t * 1000):08d}"
            cv2.imwrite(str(out / "images" / split / f"{name}.jpg"), image, [cv2.IMWRITE_JPEG_QUALITY, 88])
            lines = []
            for x1, y1, x2, y2, conf in frames[idx].persons:
                if conf >= PERSON_CONF:
                    lines.append(f"{PERSON_CLASS} {(x1 + x2) / 2:.5f} {(y1 + y2) / 2:.5f} {x2 - x1:.5f} {y2 - y1:.5f}")
            bx, by, size = labels[idx]
            lines.append(f"{BALL_CLASS} {bx:.5f} {by:.5f} {size * 9 / 16:.5f} {size:.5f}")  # round ball in a 16:9 frame
            (out / "labels" / split / f"{name}.txt").write_text("\n".join(lines) + "\n")
            counts[split] += 1
            progress((si + (n + 1) / max(len(chosen), 1)) / max(len(usable), 1))

    from ultralytics.utils import ROOT, YAML

    coco_names = YAML.load(ROOT / "cfg/datasets/coco.yaml")["names"]
    names = "".join(f"  {i}: {json.dumps(n)}\n" for i, n in coco_names.items())
    (out / "data.yaml").write_text(f"path: {json.dumps(out.resolve().as_posix())}\ntrain: images/train\nval: images/val\nnames:\n{names}")
    info = {"sets": [s.label for s in usable], "images": counts}
    (out / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=2))
    return info
