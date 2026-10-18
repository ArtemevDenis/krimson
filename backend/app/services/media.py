import json
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from app import config

ProgressFn = Callable[[float], None]


@dataclass(frozen=True)
class ProbeResult:
    duration: float
    fps: float
    width: int
    height: int


@dataclass(frozen=True)
class Segment:
    source: Path
    start: float
    end: float


def require_ffmpeg() -> None:
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RuntimeError("ffmpeg/ffprobe не найдены в PATH")


def probe(path: Path) -> ProbeResult:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, check=True,
    )
    data = json.loads(out.stdout)
    video = next(s for s in data["streams"] if s.get("codec_type") == "video")
    num, _, den = video.get("avg_frame_rate", "0/1").partition("/")
    fps = float(num) / float(den) if float(den or 0) else 0.0
    return ProbeResult(
        duration=float(data["format"].get("duration", 0)),
        fps=round(fps, 3),
        width=int(video.get("width", 0)),
        height=int(video.get("height", 0)),
    )


@cache
def _encoders() -> str:
    return subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout


def video_codec_args(bitrate: str, crf: int) -> list[str]:
    """Hardware encoder when available: VideoToolbox on Mac, NVENC on the Windows RTX box."""
    encoders = _encoders()
    if "h264_videotoolbox" in encoders:
        return ["-c:v", "h264_videotoolbox", "-b:v", bitrate]
    if "h264_nvenc" in encoders:
        return ["-c:v", "h264_nvenc", "-preset", "p4", "-b:v", bitrate]
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf)]


def _run_with_progress(args: list[str], duration: float, on_progress: ProgressFn | None) -> None:
    proc = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-y", "-nostats", "-progress", "pipe:1", *args],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        key, _, value = line.strip().partition("=")
        if key == "out_time_us" and on_progress and duration > 0 and value.isdigit():
            on_progress(min(int(value) / 1_000_000 / duration, 1.0))
    _, stderr = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg завершился с кодом {proc.returncode}: {stderr[-1500:]}")


def make_proxy(source: Path, target: Path, duration: float, on_progress: ProgressFn | None = None) -> None:
    """Phone footage is variable-frame-rate; a constant-fps proxy with a keyframe every second
    keeps browser seeking precise and gives CV a stable timeline."""
    _run_with_progress(
        [
            "-i", str(source),
            "-vf", f"scale=-2:{config.PROXY_HEIGHT},fps={config.PROXY_FPS}",
            *video_codec_args("3M", 23),
            "-g", str(config.PROXY_FPS),
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(target),
        ],
        duration, on_progress,
    )


def export_reel(segments: list[Segment], target: Path, on_progress: ProgressFn | None = None) -> None:
    """Re-encodes each segment to a uniform format, then concatenates without re-encoding."""
    total = sum(s.end - s.start for s in segments) or 1.0
    done = 0.0
    with tempfile.TemporaryDirectory(dir=config.EXPORTS_DIR) as tmp:
        parts: list[Path] = []
        for i, seg in enumerate(segments):
            part = Path(tmp) / f"part_{i:04d}.mp4"
            length = seg.end - seg.start

            def report(p: float, base: float = done, length: float = length) -> None:
                if on_progress:
                    on_progress(min((base + p * length) / total, 0.99))

            _run_with_progress(
                [
                    "-ss", f"{seg.start:.3f}", "-i", str(seg.source), "-t", f"{length:.3f}",
                    "-vf", f"scale=-2:1080,fps={config.PROXY_FPS}",
                    *video_codec_args("8M", 20),
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
                    str(part),
                ],
                length, report,
            )
            parts.append(part)
            done += length

        listing = Path(tmp) / "list.txt"
        listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts))
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
             "-c", "copy", "-movflags", "+faststart", str(target)],
            capture_output=True, check=True,
        )
    if on_progress:
        on_progress(1.0)
