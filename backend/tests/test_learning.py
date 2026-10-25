import numpy as np
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.cv import detection
from app.cv.detection import Detections, DetectionSettings, Frame
from app.learning.metrics import lcs, match_intervals, score_set
from app.main import app


def test_interval_matching_and_scores():
    pred = [(0, 10), (20, 30), (50, 55)]
    gt = [(1, 11), (21, 29), (40, 45)]
    assert sorted(match_intervals(pred, gt)) == [(0, 0), (1, 1)]
    s = score_set(pred, [["R", "E", "A"], ["S"], ["D"]], gt, [["R", "E", "A"], ["S", "D"], ["R"]]).summary()
    assert (s["rallies_found"], s["rallies_false"], s["rallies_true"]) == (2, 1, 3)
    assert s["start_error_s"] == 1.0
    assert s["action_recall"] == round(4 / 6, 3)  # 3 + 1 matched of 6 true touches


def test_lcs_counts_in_order_matches():
    assert lcs(["R", "E", "A"], ["R", "A"]) == 2
    assert lcs([], ["S"]) == 0


def _arc_frames(rallies: list[tuple[float, float]], duration: float) -> list[Frame]:
    frames = []
    for i in range(int(duration * 15)):
        t = i / 15
        balls = []
        for start, end in rallies:
            if start <= t <= end:
                k = (t - start) / (end - start)
                # zig-zag flights across the frame: long flights with turns
                phase = (k * 3) % 1
                balls.append([0.2 + 0.6 * phase, 0.6 - 0.4 * np.sin(np.pi * phase), 0.02, 0.6])
        frames.append(Frame(t, np.array(balls).reshape(-1, 4), np.zeros((0, 5))))
    return frames


def test_verified_set_evaluation_and_tuning(tmp_path):
    from app.db import engine
    from app.models import Video

    truth = [(5.0, 11.0), (30.0, 38.0)]
    video_path = tmp_path / "game.mp4"
    video_path.write_bytes(b"")
    detection.save(Detections(DetectionSettings(), _arc_frames(truth, 45)), detection.sidecar_path(video_path))

    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Learn"}).json()
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "Y", "date": "2026-04-01"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        with Session(engine) as s:
            v = Video(original_path=str(video_path), status="ready")
            s.add(v)
            s.commit()
            s.refresh(v)
            video_id = v.id
        pts = [[0.1, 0.95], [0.9, 0.95], [0.7, 0.45], [0.3, 0.45], [0.18, 0.7], [0.82, 0.7]]
        c.post(f"/api/videos/{video_id}/calibrations", json={"from_time": 0, "points": pts})
        c.patch(f"/api/sets/{set_id}", json={"video_id": video_id})
        for start, end in truth:
            c.post(f"/api/sets/{set_id}/rallies", json={"start_time": start, "end_time": end, "winner": "us"})
        ws = c.patch(f"/api/sets/{set_id}", json={"verified": True}).json()
        assert ws["set"]["verified"] is True

        summary = c.get("/api/learning/summary").json()
        mine = next(s for s in summary["verified_sets"] if s["set_id"] == set_id)
        assert mine["rallies"] == 2 and mine["has_detections"]

        from app.learning import tasks

        report = tasks.run_evaluate({}, lambda p: None)
        assert report["overall"]["rally_recall"] == 1.0

        result = tasks.run_tune({"scope": "general"}, lambda p: None)
        assert result["after"]["objective"] >= result["before"]["objective"]


def test_tuning_a_hall_leaves_other_halls_and_general_untouched(tmp_path):
    from app.db import engine
    from app.learning import tasks
    from app.models import Video
    from app.modelstore import store

    truth = [(5.0, 11.0), (30.0, 38.0)]
    video_path = tmp_path / "away.mp4"
    video_path.write_bytes(b"")
    detection.save(Detections(DetectionSettings(), _arc_frames(truth, 45)), detection.sidecar_path(video_path))

    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Выезд"}).json()
        hall = c.post("/api/venues", json={"name": "Чужой зал"}).json()
        assert hall["slug"] == "chuzhoy-zal"
        c.post("/api/venues", json={"name": "Домашний зал"})
        match = c.post("/api/matches", json={
            "team_id": team["id"], "opponent": "Z", "date": "2026-05-01", "venue_id": hall["id"],
        }).json()
        assert match["venue_name"] == "Чужой зал"
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        with Session(engine) as s:
            v = Video(original_path=str(video_path), status="ready")
            s.add(v)
            s.commit()
            s.refresh(v)
            video_id = v.id
        pts = [[0.1, 0.95], [0.9, 0.95], [0.7, 0.45], [0.3, 0.45], [0.18, 0.7], [0.82, 0.7]]
        c.post(f"/api/videos/{video_id}/calibrations", json={"from_time": 0, "points": pts})
        c.patch(f"/api/sets/{set_id}", json={"video_id": video_id})
        for start, end in truth:
            c.post(f"/api/sets/{set_id}/rallies", json={"start_time": start, "end_time": end, "winner": "us"})
        c.patch(f"/api/sets/{set_id}", json={"verified": True})

        st = store()
        general_before = st.active("general", "params")
        tasks.run_tune({"scope": "venue/chuzhoy-zal"}, lambda p: None)
        assert st.active("general", "params") == general_before
        assert st.versions("venue/domashniy-zal", "params") == []
        assert (st.root / "venue" / "chuzhoy-zal" / "venue.json").is_file()

        scopes = {s["scope"]: s for s in c.get("/api/learning/scopes").json()}
        assert scopes["venue/chuzhoy-zal"]["verified_sets"] == 1
        assert scopes["venue/domashniy-zal"]["verified_sets"] == 0
        summary = c.get("/api/learning/summary", params={"scope": "venue/domashniy-zal"}).json()
        assert summary["verified_sets"] == []


def test_relocate_points_videos_to_new_folder(tmp_path):
    from sqlmodel import Session

    from app.db import engine, init_db
    from app.models import Video
    from app.relocate import relocate

    init_db()
    (tmp_path / "sub").mkdir()
    moved = tmp_path / "sub" / "VID_RELOCATE_1.mp4"
    moved.write_bytes(b"x")
    with Session(engine) as s:
        win = Video(original_path=r"D:\old\VID_RELOCATE_1.mp4", proxy_path="/nowhere/proxy.mp4")
        mac = Video(original_path="/Users/me/krimson/video/VID_RELOCATE_2.mp4")
        s.add(win)
        s.add(mac)
        s.commit()
        results = {v.id: found for v, found in relocate(s, tmp_path)}
        s.refresh(win)
        s.refresh(mac)
        assert win.original_path == str(moved.resolve()) and win.proxy_path is None
        assert results[mac.id] is None and mac.original_path.endswith("VID_RELOCATE_2.mp4")
