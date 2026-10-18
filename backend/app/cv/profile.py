"""Which models analyze a given set: the hall's own versions first, then the general profile, then stock.
Training for a new hall never touches another hall's versions."""

from dataclasses import dataclass, fields
from pathlib import Path

from app.cv.params import DEFAULT_PARAMS, AnalyzerParams
from app.modelstore import GENERAL, ModelStore, store, team_scope, venue_scope


@dataclass(frozen=True)
class ModelRef:
    scope: str
    kind: str
    version: str

    @property
    def tag(self) -> str:
        """Stable id used in detection cache file names and in suggestion records."""
        return f"{self.scope.replace('/', '-')}-{self.kind}-{self.version}"


@dataclass(frozen=True)
class Profile:
    venue_slug: str | None
    team_slug: str | None
    params: AnalyzerParams
    params_ref: ModelRef | None
    detector: ModelRef | None  # None = stock COCO model
    players: ModelRef | None

    def detector_weights(self, s: ModelStore | None = None) -> Path | None:
        if self.detector is None:
            return None
        return (s or store()).weights_path(self.detector.scope, self.detector.kind, self.detector.version)

    def players_weights(self, s: ModelStore | None = None) -> Path | None:
        if self.players is None:
            return None
        return (s or store()).weights_path(self.players.scope, self.players.kind, self.players.version)

    def describe(self) -> str:
        parts = [
            f"params={self.params_ref.tag if self.params_ref else 'default'}",
            f"det={self.detector.tag if self.detector else 'stock'}",
        ]
        if self.players:
            parts.append(f"players={self.players.tag}")
        return " ".join(parts)


def _first_active(s: ModelStore, scopes: list[str], kind: str) -> ModelRef | None:
    for scope in scopes:
        version = s.active(scope, kind)
        if version:
            return ModelRef(scope, kind, version)
    return None


def load_params_version(s: ModelStore, ref: ModelRef) -> AnalyzerParams:
    data = s.read_meta(ref.scope, ref.kind, ref.version).get("params", {})
    known = {f.name for f in fields(AnalyzerParams)}
    return DEFAULT_PARAMS.with_values(**{k: v for k, v in data.items() if k in known})


def resolve(venue_slug: str | None, team_slug: str | None, s: ModelStore | None = None) -> Profile:
    s = s or store()
    scopes = ([venue_scope(venue_slug)] if venue_slug else []) + [GENERAL]
    params_ref = _first_active(s, scopes, "params")
    return Profile(
        venue_slug=venue_slug,
        team_slug=team_slug,
        params=load_params_version(s, params_ref) if params_ref else DEFAULT_PARAMS,
        params_ref=params_ref,
        detector=_first_active(s, scopes, "ball"),
        players=_first_active(s, [team_scope(team_slug)], "players") if team_slug else None,
    )


def detection_settings(profile: Profile, s: ModelStore | None = None):
    from app.cv.detection import DetectionSettings

    weights = profile.detector_weights(s)
    if weights is None or profile.detector is None:
        return DetectionSettings()
    return DetectionSettings(model=str(weights), tag=profile.detector.tag)
