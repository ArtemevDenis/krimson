"""Versioned, git-friendly store of trained models.

    models/
      registry.json                      which version is active per scope/kind
      general/params/v001.json           fallback for halls without their own models
      general/ball/v001.pt + v001.json   weights + metadata (metrics, dataset, base model)
      venue/<slug>/venue.json            {"name": ...} so another device can recreate the venue
      venue/<slug>/params/..., venue/<slug>/ball/...
      team/<slug>/players/v001.pt + .json

Scopes are keyed by slugs, not database ids, so the folder can be committed and pulled on another
device. Versions are immutable; rolling back = pointing registry.json at an older version.
"""

import json
import re
import shutil
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app import config

GENERAL = "general"
KINDS = ("params", "ball", "players")
WEIGHT_KINDS = ("ball", "players")
_VERSION_RE = re.compile(r"^v(\d{3,})$")

_TRANSLIT = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f",
     "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"],
))


def slugify(name: str) -> str:
    latin = "".join(_TRANSLIT.get(ch, ch) for ch in name.lower())
    return re.sub(r"[^a-z0-9]+", "-", latin).strip("-") or "unnamed"


def unique_slug(name: str, taken: set[str]) -> str:
    base = slugify(name)
    slug, n = base, 2
    while slug in taken:
        slug, n = f"{base}-{n}", n + 1
    return slug


def venue_scope(slug: str) -> str:
    return f"venue/{slug}"


def team_scope(slug: str) -> str:
    return f"team/{slug}"


@dataclass(frozen=True)
class Version:
    scope: str
    kind: str
    version: str
    meta: dict
    active: bool

    def to_dict(self) -> dict:
        return {"scope": self.scope, "kind": self.kind, "version": self.version, "active": self.active, **self.meta}


class ModelStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or config.MODELS_DIR

    # --- registry -----------------------------------------------------------

    def _registry_path(self) -> Path:
        return self.root / "registry.json"

    def _registry(self) -> dict:
        path = self._registry_path()
        return json.loads(path.read_text()) if path.is_file() else {"active": {}}

    def _save_registry(self, data: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        data["active"] = dict(sorted(data.get("active", {}).items()))
        # Stable formatting keeps git diffs to the one changed line
        self._registry_path().write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

    def active(self, scope: str, kind: str) -> str | None:
        version = self._registry()["active"].get(f"{scope}/{kind}")
        return version if version and self._meta_path(scope, kind, version).is_file() else None

    def set_active(self, scope: str, kind: str, version: str | None) -> None:
        data = self._registry()
        key = f"{scope}/{kind}"
        if version is None:
            data["active"].pop(key, None)
        else:
            if not self._meta_path(scope, kind, version).is_file():
                raise FileNotFoundError(f"Нет версии {version} для {key}")
            data["active"][key] = version
        self._save_registry(data)

    # --- versions -----------------------------------------------------------

    def kind_dir(self, scope: str, kind: str) -> Path:
        if kind not in KINDS:
            raise ValueError(f"Неизвестный вид модели {kind}")
        return self.root / scope / kind

    def _meta_path(self, scope: str, kind: str, version: str) -> Path:
        return self.kind_dir(scope, kind) / f"{version}.json"

    def weights_path(self, scope: str, kind: str, version: str) -> Path:
        return self.kind_dir(scope, kind) / f"{version}.pt"

    def versions(self, scope: str, kind: str) -> list[Version]:
        d = self.kind_dir(scope, kind)
        if not d.is_dir():
            return []
        active = self.active(scope, kind)
        out = []
        for meta in d.glob("v*.json"):
            if _VERSION_RE.match(meta.stem):
                out.append(Version(scope, kind, meta.stem, json.loads(meta.read_text()), meta.stem == active))
        return sorted(out, key=lambda v: int(v.version[1:]), reverse=True)

    def add_version(self, scope: str, kind: str, meta: dict, weights: Path | None = None, activate: bool = True) -> str:
        if kind in WEIGHT_KINDS and weights is None:
            raise ValueError(f"Для {kind} нужен файл весов")
        d = self.kind_dir(scope, kind)
        d.mkdir(parents=True, exist_ok=True)
        existing = [int(m.group(1)) for p in d.glob("v*.json") if (m := _VERSION_RE.match(p.stem))]
        version = f"v{(max(existing) + 1) if existing else 1:03d}"
        if weights is not None:
            shutil.copy(weights, self.weights_path(scope, kind, version))
        full_meta = {"created": datetime.now(UTC).isoformat(timespec="seconds"), **meta}
        self._meta_path(scope, kind, version).write_text(json.dumps(full_meta, ensure_ascii=False, indent=2) + "\n")
        if activate:
            self.set_active(scope, kind, version)
        return version

    def read_meta(self, scope: str, kind: str, version: str) -> dict:
        return json.loads(self._meta_path(scope, kind, version).read_text())

    def delete(self, scope: str, kind: str, version: str) -> None:
        if self.active(scope, kind) == version:
            raise ValueError("Нельзя удалить активную версию — сначала сделайте активной другую")
        self._meta_path(scope, kind, version).unlink(missing_ok=True)
        self.weights_path(scope, kind, version).unlink(missing_ok=True)

    # --- scopes -------------------------------------------------------------

    def describe_venue(self, slug: str, name: str) -> None:
        d = self.root / venue_scope(slug)
        d.mkdir(parents=True, exist_ok=True)
        (d / "venue.json").write_text(json.dumps({"name": name}, ensure_ascii=False, indent=2) + "\n")

    def known_venues(self) -> dict[str, str]:
        """slug -> name for venues that have a folder (e.g. pulled from git)."""
        base = self.root / "venue"
        if not base.is_dir():
            return {}
        out = {}
        for d in base.iterdir():
            info = d / "venue.json"
            if info.is_file():
                out[d.name] = json.loads(info.read_text()).get("name", d.name)
        return out


def store() -> ModelStore:
    return ModelStore()
