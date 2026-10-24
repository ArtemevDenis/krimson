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


def test_serve_sub_and_libero_toggle_flow():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Subs"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={
            "text": "1 Связ S\n2 Доиг1 OH\n3 Центр1 MB\n4 Диаг OPP\n5 Доиг2 OH\n6 Центр2 MB\n7 Либ L\n8 Запас OH",
        }).json()
        ids = {p["number"]: p["id"] for p in roster}
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-24"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        c.patch(f"/api/sets/{set_id}", json={
            "lineup": [ids[n] for n in (6, 1, 2, 3, 4, 5)], "libero_ids": [ids[7]], "we_serve_first": True,
        })
        ws = c.post(f"/api/sets/{set_id}/rallies", json={
            "winner": "them", "substitutions": [{"out_id": ids[6], "in_id": ids[8], "kind": "serve"}],
        }).json()
        assert ws["current"]["serve_subs"] == [{"in_id": ids[8], "out_id": ids[6], "due": "serve_lost"}]
        assert ws["current"]["lineup_roles"][0] == "MB"
        ws = c.post(f"/api/sets/{set_id}/rallies", json={"substitutions": [{"kind": "libero_out"}]}).json()
        assert ws["rallies"][1]["state"]["on_court"][0] == ids[8]
        assert c.post(f"/api/sets/{set_id}/rallies", json={"substitutions": [{"kind": "serve"}]}).status_code == 422


def test_roles_are_assigned_per_set():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Roles"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={
            "text": "1 А S\n2 Б OH\n3 В MB\n4 Г OPP\n5 Д OH\n6 Е OH\n7 Либ L",
        }).json()
        ids = {p["number"]: p["id"] for p in roster}
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-24"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        # roster says 6 is OH, but in this set he plays middle — the libero replaces him in zone 6
        ws = c.patch(f"/api/sets/{set_id}", json={
            "lineup": [ids[n] for n in (1, 2, 3, 4, 5, 6)], "lineup_roles": ["S", "OH", "MB", "OPP", "OH", "MB"],
            "libero_ids": [ids[7]], "we_serve_first": True,
        }).json()
        assert ws["current"]["on_court"][5] == ids[7]
        assert ws["set"]["lineup_roles"][5] == "MB"
        assert c.patch(f"/api/sets/{set_id}", json={"lineup_roles": ["S"]}).status_code == 422


def test_archived_match_is_left_out_of_season_and_set_can_be_cleared():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Archive"}).json()
        p = c.post(f"/api/teams/{team['id']}/players/import", json={"text": "15 Игрок OH"}).json()[0]
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-03-28"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        ws = c.post(f"/api/sets/{set_id}/rallies", json={"winner": "us"}).json()
        c.post(f"/api/rallies/{ws['rallies'][0]['id']}/actions", json={"player_id": p["id"], "skill": "A", "evaluation": "#"})
        assert c.get(f"/api/stats/teams/{team['id']}").json()["matches"] == 1

        assert c.patch(f"/api/matches/{match['id']}", json={"archived": True}).json()["archived"]
        season = c.get(f"/api/stats/teams/{team['id']}").json()
        assert season["matches"] == 0 and season["team"]["rallies"] == 0
        assert [m["archived"] for m in c.get(f"/api/matches?team_id={team['id']}").json()] == [True]  # kept, not deleted

        ws = c.post(f"/api/sets/{set_id}/clear").json()
        assert ws["rallies"] == [] and ws["set"]["id"] == set_id
