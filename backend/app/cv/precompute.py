"""Run the expensive detection pass outside the app, e.g. on the Windows/CUDA machine:

    uv run python -m app.cv.precompute D:/volley/VID_20260328_185649.mp4 [more videos...]

Writes `<video>.krimson-det[-<model version>].json.gz` next to each video. Copy it along with the video; the app
picks it up instead of recomputing. With `--venue <slug>` the hall's fine-tuned detector is used (models/ from git).
"""

import argparse
import sys
import time
from pathlib import Path

from app.cv import detection
from app.cv.profile import detection_settings, resolve


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Krimson: предрасчёт детекций мяча и игроков")
    parser.add_argument("videos", nargs="+", type=Path)
    defaults = detection.DetectionSettings()
    parser.add_argument("--venue", help="слаг зала: взять его дообученный детектор (иначе общий, иначе стандартный)")
    parser.add_argument("--imgsz", type=int, default=defaults.imgsz)
    parser.add_argument("--fps", type=float, default=defaults.fps)
    parser.add_argument("--force", action="store_true", help="пересчитать, даже если файл уже есть")
    args = parser.parse_args(argv)

    base = detection_settings(resolve(args.venue, None))
    settings = detection.DetectionSettings(model=base.model, tag=base.tag, imgsz=args.imgsz, fps=args.fps)
    print(f"Устройство: {detection.pick_device()}, модель {settings.tag or settings.model}, {settings.imgsz}px, {settings.fps} кадр/с")
    for video in args.videos:
        target = detection.sidecar_path(video, settings.tag)
        if target.exists() and not args.force:
            print(f"✓ {video.name}: уже посчитано ({target.name})")
            continue
        started = time.monotonic()

        def report(p: float, name: str = video.name) -> None:
            sys.stdout.write(f"\r{name}: {p:6.1%}  {time.monotonic() - started:6.0f} с")
            sys.stdout.flush()

        det = detection.run(video, settings, report)
        detection.save(det, target)
        print(f"\n✓ {video.name}: {len(det.frames)} кадров за {time.monotonic() - started:.0f} с → {target.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
