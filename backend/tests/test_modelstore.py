import json

import pytest

from app.cv.params import DEFAULT_PARAMS
from app.cv.profile import resolve
from app.modelstore import ModelStore, slugify, unique_slug


def test_slugify_transliterates_russian():
    assert slugify("Домашний зал №2") == "domashniy-zal-2"
    assert slugify("СШОР «Юность»") == "sshor-yunost"
    assert unique_slug("Krimson", {"krimson", "krimson-2"}) == "krimson-3"


def test_versions_are_immutable_and_rollback_switches_active(tmp_path):
    st = ModelStore(tmp_path)
    v1 = st.add_version("venue/home", "params", {"params": {"merge_gap": 2.0}})
    v2 = st.add_version("venue/home", "params", {"params": {"merge_gap": 3.0}})
    assert (v1, v2) == ("v001", "v002")
    assert st.active("venue/home", "params") == "v002"

    st.set_active("venue/home", "params", "v001")
    assert resolve("home", None, st).params.merge_gap == 2.0
    assert [v.version for v in st.versions("venue/home", "params")] == ["v002", "v001"]

    with pytest.raises(ValueError):
        st.delete("venue/home", "params", "v001")
    st.delete("venue/home", "params", "v002")
    assert [v.version for v in st.versions("venue/home", "params")] == ["v001"]

    registry = json.loads((tmp_path / "registry.json").read_text())
    assert registry == {"active": {"venue/home/params": "v001"}}


def test_weights_versions_require_a_file(tmp_path):
    st = ModelStore(tmp_path)
    with pytest.raises(ValueError):
        st.add_version("general", "ball", {})
    weights = tmp_path / "best.pt"
    weights.write_bytes(b"weights")
    version = st.add_version("general", "ball", {"metrics": {}}, weights=weights, activate=False)
    assert st.weights_path("general", "ball", version).read_bytes() == b"weights"
    assert st.active("general", "ball") is None


def test_unknown_hall_falls_back_to_general_then_defaults(tmp_path):
    st = ModelStore(tmp_path)
    assert resolve("new-hall", None, st).params == DEFAULT_PARAMS
    st.add_version("general", "params", {"params": {"lead": 0.5}})
    profile = resolve("new-hall", None, st)
    assert profile.params.lead == 0.5 and profile.params_ref.scope == "general"
    st.add_version("venue/new-hall", "params", {"params": {"lead": 2.0}})
    assert resolve("new-hall", None, st).params.lead == 2.0
    assert resolve("other-hall", None, st).params.lead == 0.5


def test_venues_from_git_are_listed(tmp_path):
    st = ModelStore(tmp_path)
    st.describe_venue("home", "Домашний зал")
    assert st.known_venues() == {"home": "Домашний зал"}
