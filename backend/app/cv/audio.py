"""Referee whistles from the video's sound track: the clearest signal of where a rally starts.

The whistle for the serve is a loud pure tone (~3.6 kHz on our recordings); the whistle that ends a rally is
softer and usually lower (~1.6 kHz). Frames are scored by how far the strongest tone in a band stands out above
the rest of the spectrum, so crowd noise raises the floor instead of faking a whistle. Candidate tones are kept
with their strength, and the thresholds that turn them into start/end whistles live in AnalyzerParams, so tuning
can fit them to a hall's microphone without decoding the audio again.
"""

import gzip
import json
import shutil
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal

import numpy as np

SAMPLE_RATE = 16000
WINDOW = 1024
HOP = 256  # 16 ms
CHUNK_SECONDS = 60

HIGH_BAND = (3200.0, 4000.0)  # serve whistle
LOW_BAND = (1400.0, 1800.0)  # softer end-of-rally whistle
REFERENCE_BAND = (1000.0, 7000.0)  # the tone is compared with the median of this range
SMOOTH_FRAMES = 4
CANDIDATE_DB = 30.0  # keep everything above this; params decide what counts
MIN_TONE_SECONDS = 0.05
MERGE_GAP_SECONDS = 0.15

CACHE_VERSION = 1

Band = Literal["high", "low"]


@dataclass(frozen=True)
class Tone:
    start: float
    end: float
    band: Band
    strength: float  # dB of the tone above the spectrum median at its peak


@dataclass(frozen=True)
class Whistle:
    t: float
    end: float
    kind: Literal["start", "end"]
    strength: float


def sidecar_path(video: Path) -> Path:
    return video.with_name(f"{video.name}.krimson-audio.json.gz")


def decode(video: Path) -> np.ndarray:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg не найден в PATH")
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(out, dtype=np.float32)


def band_prominence(samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """dB of the strongest bin in the high and low bands over the reference median, per 16 ms frame.
    Processed in chunks: a full spectrogram of a 20-minute set would not fit comfortably in memory."""
    freqs = np.fft.rfftfreq(WINDOW, 1 / SAMPLE_RATE)
    ref = (freqs >= REFERENCE_BAND[0]) & (freqs <= REFERENCE_BAND[1])
    high = (freqs >= HIGH_BAND[0]) & (freqs <= HIGH_BAND[1])
    low = (freqs >= LOW_BAND[0]) & (freqs <= LOW_BAND[1])
    window = np.hanning(WINDOW).astype(np.float32)
    n_frames = max(0, (len(samples) - WINDOW) // HOP + 1)
    out_high = np.empty(n_frames, dtype=np.float32)
    out_low = np.empty(n_frames, dtype=np.float32)
    step = CHUNK_SECONDS * SAMPLE_RATE // HOP
    for first in range(0, n_frames, step):
        last = min(n_frames, first + step)
        chunk = samples[first * HOP : (last - 1) * HOP + WINDOW]
        frames = np.lib.stride_tricks.sliding_window_view(chunk, WINDOW)[::HOP] * window
        power = np.abs(np.fft.rfft(frames, axis=1)) ** 2
        floor = np.median(power[:, ref], axis=1) + 1e-15
        out_high[first:last] = 10 * np.log10(power[:, high].max(axis=1) / floor + 1e-15)
        out_low[first:last] = 10 * np.log10(power[:, low].max(axis=1) / floor + 1e-15)
    kernel = np.ones(SMOOTH_FRAMES) / SMOOTH_FRAMES
    return np.convolve(out_high, kernel, "same"), np.convolve(out_low, kernel, "same")


def find_tones(prominence: np.ndarray, band: Band, threshold: float = CANDIDATE_DB) -> list[Tone]:
    above = prominence >= threshold
    tones: list[Tone] = []
    i, n = 0, len(above)
    while i < n:
        if not above[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and above[j + 1]:
            j += 1
        start, end = i * HOP / SAMPLE_RATE, (j + 1) * HOP / SAMPLE_RATE
        strength = float(prominence[i : j + 1].max())
        if tones and start - tones[-1].end <= MERGE_GAP_SECONDS:
            prev = tones.pop()
            tones.append(Tone(prev.start, end, band, max(prev.strength, strength)))
        else:
            tones.append(Tone(start, end, band, strength))
        i = j + 1
    return [t for t in tones if t.end - t.start >= MIN_TONE_SECONDS]


def detect_tones(samples: np.ndarray) -> list[Tone]:
    high, low = band_prominence(samples)
    return sorted(find_tones(high, "high") + find_tones(low, "low"), key=lambda t: t.start)


def save(tones: list[Tone], path: Path) -> None:
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as f:
        json.dump({"version": CACHE_VERSION, "tones": [asdict(t) for t in tones]}, f)
    tmp.replace(path)


def load(path: Path) -> list[Tone] | None:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        data = json.load(f)
    if data.get("version") != CACHE_VERSION:
        return None
    return [Tone(**t) for t in data["tones"]]


def load_or_detect(video: Path) -> list[Tone] | None:
    """Cached next to the video like the detections. None when the sound can't be read (no ffmpeg, no audio):
    the analyzer then works from the ball alone."""
    path = sidecar_path(video)
    if path.is_file():
        cached = load(path)
        if cached is not None:
            return cached
    try:
        tones = detect_tones(decode(video))
    except (RuntimeError, subprocess.CalledProcessError, OSError):
        return None
    try:
        save(tones, path)
    except OSError:
        pass  # read-only folder: just don't cache
    return tones


def classify(tones: list[Tone], start_db: float, end_db: float, min_seconds: float) -> list[Whistle]:
    """A loud high tone is a serve whistle; a quieter high tone or a low tone may end a rally."""
    whistles = []
    for t in tones:
        if t.end - t.start < min_seconds:
            continue
        if t.band == "high" and t.strength >= start_db:
            whistles.append(Whistle(t.start, t.end, "start", t.strength))
        elif t.strength >= end_db:
            whistles.append(Whistle(t.start, t.end, "end", t.strength))
    return whistles
