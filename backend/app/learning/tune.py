"""Fits analyzer thresholds to the verified sets: coarse grid over tracking parameters (tracks are the
expensive part, cached per combination), random search over rally/touch thresholds on top."""

import random
from dataclasses import asdict
from itertools import product

from app.cv.base import ProgressFn
from app.cv.params import AnalyzerParams
from app.learning.evaluate import PreparedSet, evaluate

TRACKING_GRID = {
    "max_gap": [0.25, 0.35, 0.5],
    "min_track_extent": [0.03, 0.05],
}

SEARCH_SPACE = {
    "merge_gap": (1.0, 4.5),
    "min_rally": (0.5, 3.0),
    "lead": (0.0, 2.5),
    "tail": (0.0, 3.0),
    "long_flight_extent": (0.12, 0.45),
    "long_flight_seconds": (0.4, 1.4),
    "touch_dedup": (0.2, 0.6),
    "turn_angle_deg": (35.0, 80.0),
    "min_turn_speed": (0.05, 0.4),
    "max_person_dist": (0.02, 0.08),
    "block_window": (0.4, 1.2),
}


def tune(prepared: list[PreparedSet], base: AnalyzerParams, progress: ProgressFn, trials_per_combo: int = 40, seed: int = 7) -> dict:
    rng = random.Random(seed)
    baseline = evaluate(prepared, base)
    best_params, best = base, baseline

    combos = [dict(zip(TRACKING_GRID, values)) for values in product(*TRACKING_GRID.values())]
    total = len(combos) * (trials_per_combo + 1)
    done = 0
    for combo in combos:
        anchor = best_params.with_values(**combo)
        for trial in range(trials_per_combo + 1):
            if trial == 0:
                candidate = anchor
            else:
                # Half of the trials explore around the best so far, half sample the whole range
                around = trial % 2 == 0
                values = {}
                for name, (lo, hi) in SEARCH_SPACE.items():
                    if around:
                        cur = getattr(best_params, name)
                        values[name] = min(hi, max(lo, cur + rng.gauss(0, (hi - lo) * 0.1)))
                    else:
                        values[name] = rng.uniform(lo, hi)
                candidate = anchor.with_values(**{k: round(v, 3) for k, v in values.items()})
            report = evaluate(prepared, candidate)
            if report["objective"] > best["objective"]:
                best_params, best = candidate, report
            done += 1
            progress(done / total)

    return {
        "params": asdict(best_params),
        "before": baseline,
        "after": best,
        "improved": best["objective"] > baseline["objective"],
    }


def params_from(data: dict) -> AnalyzerParams:
    return AnalyzerParams(**data)
