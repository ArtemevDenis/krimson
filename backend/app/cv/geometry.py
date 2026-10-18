"""Image <-> court floor mapping from the user's clicks.

Court frame: x across the court 0..9 m, y along it 0..18 m; y=0 is OUR baseline, y=9 the center line.
Points are normalized image coordinates (0..1), so they hold for both the original and the proxy video.
"""

from dataclasses import dataclass

import numpy as np

COURT_WIDTH = 9.0
COURT_LENGTH = 18.0
NET_Y = COURT_LENGTH / 2

# Click order in the UI: our baseline left/right, far baseline right/left, center line left/right
# ("left/right" as seen by the camera)
COURT_POINTS = np.array(
    [
        [0.0, 0.0],
        [COURT_WIDTH, 0.0],
        [COURT_WIDTH, COURT_LENGTH],
        [0.0, COURT_LENGTH],
        [0.0, NET_Y],
        [COURT_WIDTH, NET_Y],
    ]
)


def fit_homography(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Least-squares DLT; with 6 points a slightly off click (e.g. a corner guessed outside the frame) is averaged out."""
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        rows.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        rows.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    _, _, vt = np.linalg.svd(np.asarray(rows, dtype=float))
    h = vt[-1].reshape(3, 3)
    return h / h[2, 2]


def apply_homography(h: np.ndarray, points: np.ndarray) -> np.ndarray:
    pts = np.atleast_2d(np.asarray(points, dtype=float))
    homo = np.hstack([pts, np.ones((len(pts), 1))]) @ h.T
    return homo[:, :2] / homo[:, 2:3]


@dataclass(frozen=True)
class Court:
    from_time: float
    image_points: np.ndarray  # 6x2 normalized
    to_court: np.ndarray  # homography image -> court
    to_image: np.ndarray  # homography court -> image

    @classmethod
    def from_points(cls, from_time: float, points: list[list[float]]) -> "Court":
        img = np.asarray(points, dtype=float)
        if img.shape != (6, 2):
            raise ValueError("Нужно 6 точек: 4 угла площадки и 2 точки центральной линии")
        return cls(from_time, img, fit_homography(img, COURT_POINTS), fit_homography(COURT_POINTS, img))

    def court_xy(self, image_xy) -> np.ndarray:
        return apply_homography(self.to_court, image_xy)

    def reprojection_error(self) -> float:
        """Mean error of the clicks in meters — a sanity check shown to the user."""
        return float(np.linalg.norm(self.court_xy(self.image_points) - COURT_POINTS, axis=1).mean())


def court_at(courts: list[Court], t: float) -> Court | None:
    """Calibration in effect at time t (the camera may be moved during a set)."""
    active = [c for c in courts if c.from_time <= t]
    if active:
        return max(active, key=lambda c: c.from_time)
    return min(courts, key=lambda c: c.from_time) if courts else None
