"""Crops of our players from confirmed actions (a suggestion gave the box, the user gave the number).
Each action also yields crops from neighbouring frames where the same person is detected, which multiplies
the examples with natural variation in pose."""

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np

from app.cv.base import ProgressFn
from app.cv.players import crop_box, read_frames
from app.learning.groundtruth import GtSet

NEIGHBOUR_OFFSETS = (-0.4, -0.2, 0.2, 0.4)
MIN_IOU = 0.4
VAL_SHARE = 0.15


def _iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def examples_per_player(sets: list[GtSet]) -> dict[int, int]:
    counts: dict[int, int] = {}
    for gt in sets:
        for r in gt.rallies:
            for a in r.actions:
                if a.player_box and a.player_id is not None and a.time is not None:
                    counts[a.player_id] = counts.get(a.player_id, 0) + 1
    return counts


def build(sets: list[GtSet], out: Path, progress: ProgressFn, min_examples: int = 5) -> dict:
    import cv2

    if out.exists():
        shutil.rmtree(out)
    eligible = {pid for pid, n in examples_per_player(sets).items() if n >= min_examples}
    saved: dict[str, int] = {}
    for si, gt in enumerate(sets):
        frames = gt.load_frames() if gt.detections is not None else []
        times = np.array([f.t for f in frames])
        # (time, box, player, split key)
        wanted: list[tuple[float, list[float], int, str]] = []
        for r in gt.rallies:
            for a in r.actions:
                if not (a.player_box and a.player_id in eligible and a.time is not None):
                    continue
                key = f"{gt.set_id}:{a.action_id}"
                wanted.append((a.time, a.player_box, a.player_id, key))
                for dt in NEIGHBOUR_OFFSETS if len(frames) else ():
                    i = int(np.abs(times - (a.time + dt)).argmin())
                    best = max(frames[i].persons, key=lambda p: _iou(p[:4], a.player_box), default=None)
                    if best is not None and _iou(best[:4], a.player_box) >= MIN_IOU:
                        wanted.append((frames[i].t, list(best[:4]), a.player_id, key))

        by_time: dict[float, list[tuple[list[float], int, str]]] = {}
        for t, box, pid, key in wanted:
            by_time.setdefault(round(t, 3), []).append((box, pid, key))
        for n, (t, image) in enumerate(read_frames(gt.video, sorted(by_time))):
            for j, (box, pid, key) in enumerate(by_time.get(round(t, 3), [])):
                crop = crop_box(image, box)
                if crop is None:
                    continue
                split = "val" if int(hashlib.md5(key.encode()).hexdigest(), 16) % 100 < VAL_SHARE * 100 else "train"
                folder = out / split / str(pid)
                folder.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(folder / f"s{gt.set_id}_{int(t * 1000):08d}_{j}.jpg"), crop)
                saved[str(pid)] = saved.get(str(pid), 0) + 1
            progress((si + (n + 1) / max(len(by_time), 1)) / max(len(sets), 1))

    # Classifier training needs every class in both splits
    for pid in list(saved):
        for split in ("train", "val"):
            (out / split / pid).mkdir(parents=True, exist_ok=True)
    info = {"players": saved, "skipped_players_with_few_examples": sorted(set(examples_per_player(sets)) - eligible)}
    (out / "info.json").write_text(json.dumps(info, ensure_ascii=False, indent=2))
    return info
