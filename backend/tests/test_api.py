from fastapi.testclient import TestClient

from app.main import app


def test_full_tagging_flow():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Krimson"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={
            "text": "1 Связ S\n2 Доиг1 OH\n3 Центр1 MB\n4 Диаг OPP\n5 Доиг2 OH\n6 Центр2 MB\n7 Либ L",
        }).json()
        ids = {p["number"]: p["id"] for p in roster}
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "Соперник", "date": "2026-03-28"}).json()
        ws = c.post(f"/api/matches/{match['id']}/sets").json()
        set_id = ws["set"]["id"]
        ws = c.patch(f"/api/sets/{set_id}", json={
            "lineup": [ids[n] for n in (1, 2, 3, 4, 5, 6)], "libero_ids": [ids[7]], "we_serve_first": True,
        }).json()
        assert ws["current"]["server_id"] == ids[1]

        ws = c.post(f"/api/sets/{set_id}/rallies", json={"start_time": 10.0}).json()
        rally_id = ws["rallies"][0]["id"]
        ws = c.post(f"/api/rallies/{rally_id}/actions", json={
            "player_id": ids[1], "skill": "S", "evaluation": "#", "video_time": 12.0,
        }).json()
        assert ws["rallies"][0]["winner"] == "us"
        assert ws["rallies"][0]["end_time"] == 13.5
        assert ws["current"]["our_score"] == 1

        stats = c.get(f"/api/stats/matches/{match['id']}").json()
        assert next(p for p in stats["players"] if p["player_id"] == ids[1])["serve"]["ace"] == 1
        assert c.get(f"/api/matches/{match['id']}").json()["sets"][0]["our_score"] == 1
        assert c.post(f"/api/rallies/{rally_id}/actions", json={"skill": "X", "evaluation": "#"}).status_code == 422

        action_id = ws["rallies"][0]["actions"][0]["id"]
        ws = c.delete(f"/api/actions/{action_id}").json()
        assert ws["rallies"][0]["winner"] is None
        assert ws["current"]["our_score"] == 0


def test_video_and_job_rows_persist():
    from sqlmodel import Session

    from app.db import engine
    from app.models import Job, Video

    with TestClient(app), Session(engine) as s:
        s.add(Video(original_path="/tmp/x.mp4"))
        s.add(Job(kind="proxy", payload={"video_id": 1}))
        s.commit()


def test_import_returns_video_fields(monkeypatch, tmp_path):
    from app.routers import videos as videos_router
    from app.services import jobs, media

    clip = tmp_path / "clip.mp4"
    clip.write_bytes(b"")
    monkeypatch.setattr(media, "probe", lambda _p: media.ProbeResult(10.0, 30.0, 1920, 1080))
    monkeypatch.setattr(videos_router.media, "probe", media.probe)
    monkeypatch.setattr(jobs._executor, "submit", lambda *a, **k: None)
    with TestClient(app) as c:
        body = c.post("/api/videos/import", json={"path": str(clip)}).json()
        assert body["id"] and body["duration"] == 10.0


def test_manual_rally_is_inserted_in_video_order():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Order"}).json()
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-03-28"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        c.post(f"/api/sets/{set_id}/rallies", json={"start_time": 100.0, "end_time": 110.0})
        ws = c.post(f"/api/sets/{set_id}/rallies", json={"start_time": 50.0}).json()
        assert [r["start_time"] for r in ws["rallies"]] == [50.0, 100.0]


def test_calibration_and_suggestion_flow():
    from sqlmodel import Session

    from app.db import engine
    from app.models import Suggestion

    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Cal"}).json()
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-03-28"}).json()
        ws = c.post(f"/api/matches/{match['id']}/sets").json()
        set_id = ws["set"]["id"]
        from app.models import Video
        with Session(engine) as s:
            v = Video(original_path="/tmp/none.mp4")
            s.add(v)
            s.commit()
            s.refresh(v)
            video_id = v.id
            s.add(Suggestion(set_id=set_id, time=12.0, skill="R", confidence=0.7, ball=[0.5, 0.5]))
            s.commit()
        pts = [[0.1, 0.95], [0.9, 0.95], [0.7, 0.45], [0.3, 0.45], [0.18, 0.7], [0.82, 0.7]]
        cals = c.post(f"/api/videos/{video_id}/calibrations", json={"from_time": 0, "points": pts}).json()
        assert len(cals) == 1 and cals[0]["error_m"] >= 0
        assert c.post(f"/api/videos/{video_id}/calibrations", json={"from_time": 0.5, "points": pts}).json()[0]["from_time"] == 0.5

        ws = c.get(f"/api/sets/{set_id}").json()
        sg = ws["suggestions"][0]
        ws = c.patch(f"/api/suggestions/{sg['id']}", json={"status": "rejected"}).json()
        assert ws["suggestions"] == []
