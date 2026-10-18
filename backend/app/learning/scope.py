"""Learning scopes: a hall (its own thresholds + ball detector), the general fallback trained on all halls,
or a team (player recognition, the same players in any hall)."""

from dataclasses import dataclass

from sqlmodel import Session

from app.cv.params import AnalyzerParams
from app.cv.profile import Profile, resolve
from app.learning.groundtruth import GtSet, load_verified
from app.modelstore import GENERAL


@dataclass(frozen=True)
class Scope:
    key: str  # "general" | "venue/<slug>" | "team/<slug>"

    @property
    def kind(self) -> str:
        return self.key.split("/", 1)[0]

    @property
    def slug(self) -> str | None:
        return self.key.split("/", 1)[1] if "/" in self.key else None

    @property
    def file_tag(self) -> str:
        return self.key.replace("/", "-")

    def verified_sets(self, session: Session) -> list[GtSet]:
        if self.kind == "venue":
            return load_verified(session, venue_slug=self.slug)
        if self.kind == "team":
            return load_verified(session, team_slug=self.slug)
        return load_verified(session)

    def profile(self) -> Profile:
        """Models this scope is judged with: a hall falls back to general; general uses only general/stock."""
        return resolve(self.slug if self.kind == "venue" else None, self.slug if self.kind == "team" else None)

    def params(self) -> AnalyzerParams:
        return self.profile().params


def parse(key: str | None) -> Scope:
    key = key or GENERAL
    kind = key.split("/", 1)[0]
    if key != GENERAL and (kind not in ("venue", "team") or "/" not in key):
        raise ValueError(f"Неизвестная область моделей {key}")
    return Scope(key)
