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


def test_next_set_takes_lineup_and_roles_from_previous():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Carry"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={"text": "1 А S\n2 Б OH\n3 В MB\n4 Г OPP\n5 Д OH\n6 Е OH"}).json()
        ids = [p["id"] for p in roster]
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-24"}).json()
        first = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        second = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]  # created before the first is set up
        roles = ["S", "OH", "MB", "OPP", "OH", "MB"]
        c.patch(f"/api/sets/{first}", json={"lineup": ids, "lineup_roles": roles, "we_serve_first": True})

        ws = c.get(f"/api/sets/{second}").json()
        assert ws["previous_set"]["lineup_roles"] == roles
        c.patch(f"/api/sets/{second}", json={"lineup": ids, "lineup_roles": roles})
        third = c.post(f"/api/matches/{match['id']}/sets").json()["set"]
        assert third["lineup"] == ids and third["lineup_roles"] == roles
        assert c.get(f"/api/sets/{first}").json()["previous_set"] is None


def test_fault_loses_rally_and_counts_as_player_error():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Faults"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={
            "text": "1 А S\n2 Б OH\n3 В MB\n4 Г OPP\n5 Д OH\n6 Е MB",
        }).json()
        ids = [p["id"] for p in roster]
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-24"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        c.patch(f"/api/sets/{set_id}", json={"lineup": ids, "we_serve_first": False})
        rally_id = c.post(f"/api/sets/{set_id}/rallies", json={}).json()["rallies"][0]["id"]
        # good set, then the setter touches the net
        c.post(f"/api/rallies/{rally_id}/actions", json={"player_id": ids[0], "skill": "E", "evaluation": "+"})
        ws = c.post(f"/api/rallies/{rally_id}/actions", json={
            "player_id": ids[0], "skill": "N", "evaluation": "=", "fault": "net",
        }).json()
        assert ws["rallies"][0]["winner"] == "them"
        assert ws["rallies"][0]["actions"][1]["fault"] == "net"
        # team fault without a player
        rally2 = c.post(f"/api/sets/{set_id}/rallies", json={}).json()["rallies"][1]["id"]
        c.post(f"/api/rallies/{rally2}/actions", json={"skill": "N", "evaluation": "=", "fault": "four"})

        stats = c.get(f"/api/stats/matches/{match['id']}").json()
        setter = next(p for p in stats["players"] if p["player_id"] == ids[0])
        assert setter["faults"]["net"] == 1 and setter["errors"] == 1
        assert setter["set"] == {"total": 1, "error": 0}
        assert stats["team"]["faults"] == 2

        assert c.post(f"/api/rallies/{rally_id}/actions", json={"skill": "N", "evaluation": "="}).status_code == 422
        assert c.post(f"/api/rallies/{rally_id}/actions", json={"skill": "E", "evaluation": "+", "fault": "net"}).status_code == 422


def test_serve_foot_fault_is_a_serve_error():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Foot"}).json()
        p = c.post(f"/api/teams/{team['id']}/players/import", json={"text": "9 Подающий OH"}).json()[0]
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-24"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        rally_id = c.post(f"/api/sets/{set_id}/rallies", json={}).json()["rallies"][0]["id"]
        ws = c.post(f"/api/rallies/{rally_id}/actions", json={"player_id": p["id"], "skill": "S", "evaluation": "=", "fault": "foot"}).json()
        assert ws["rallies"][0]["winner"] == "them"
        assert c.post(f"/api/rallies/{rally_id}/actions", json={"skill": "N", "evaluation": "=", "fault": "foot"}).status_code == 422
        assert c.post(f"/api/rallies/{rally_id}/actions", json={"skill": "S", "evaluation": "=", "fault": "net"}).status_code == 422


def test_ball_given_over_is_not_an_attack():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Over"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={"text": "1 А S\n2 Б OH\n3 В MB\n4 Г OPP\n15 Игрок OH\n6 Е MB"}).json()
        p = next(x for x in roster if x["number"] == 15)
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-24"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        c.patch(f"/api/sets/{set_id}", json={"lineup": [x["id"] for x in roster]})
        r1 = c.post(f"/api/sets/{set_id}/rallies", json={}).json()["rallies"][0]["id"]
        ws = c.post(f"/api/rallies/{r1}/actions", json={"player_id": p["id"], "skill": "G", "evaluation": "-"}).json()
        assert ws["rallies"][0]["winner"] is None  # rally goes on
        c.patch(f"/api/rallies/{r1}", json={"winner": "them"})
        r2 = c.post(f"/api/sets/{set_id}/rallies", json={}).json()["rallies"][1]["id"]
        ws = c.post(f"/api/rallies/{r2}/actions", json={"player_id": p["id"], "skill": "G", "evaluation": "#"}).json()
        assert ws["rallies"][1]["winner"] == "us"

        s = next(x for x in c.get(f"/api/stats/matches/{match['id']}").json()["players"] if x["player_id"] == p["id"])
        assert s["over"] == {"total": 2, "point": 1, "error": 0}
        assert s["attack"]["total"] == 0 and s["points"] == 1


def test_match_stats_compare_sets():
    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "BySet"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={"text": "1 А S\n2 Б OH\n3 В MB\n4 Г OPP\n5 Д OH\n6 Е MB"}).json()
        ids = [p["id"] for p in roster]
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-24"}).json()
        sets = []
        for _ in range(2):
            set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
            c.patch(f"/api/sets/{set_id}", json={"lineup": ids, "we_serve_first": True})
            sets.append(set_id)
        # set 1: ace, then a serve error; set 2: a kill
        for set_id, codes in ((sets[0], [("S", "#"), ("S", "=")]), (sets[1], [("A", "#")])):
            for i, (skill, ev) in enumerate(codes):
                rally = c.post(f"/api/sets/{set_id}/rallies", json={}).json()["rallies"][i]["id"]
                c.post(f"/api/rallies/{rally}/actions", json={"player_id": ids[1], "skill": skill, "evaluation": ev})

        s = c.get(f"/api/stats/matches/{match['id']}").json()
        assert [b["number"] for b in s["by_set"]] == [1, 2]
        first, second = s["by_set"]
        assert first["summary"]["aces"] == 1 and first["summary"]["serve_errors"] == 1
        assert first["team"]["our_points"] == 1 and first["team"]["our_errors"] == 1
        assert second["summary"]["kills"] == 1 and second["team"]["won"] == 1
        assert s["summary"]["aces"] == 1 and s["summary"]["kills"] == 1 and s["team"]["rallies"] == 3


def test_accepting_a_suggestion_can_drop_a_wrong_box():
    from sqlmodel import Session

    from app.db import engine
    from app.models import Action, Suggestion

    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Boxes"}).json()
        p = c.post(f"/api/teams/{team['id']}/players/import", json={"text": "9 Игрок OH"}).json()[0]
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-25"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        rally_id = c.post(f"/api/sets/{set_id}/rallies", json={}).json()["rallies"][0]["id"]
        with Session(engine) as s:
            ids = []
            for t in (1.0, 2.0):
                sg = Suggestion(set_id=set_id, time=t, skill="R", ball=[0.5, 0.5], player_box=[0.1, 0.1, 0.2, 0.4])
                s.add(sg)
                s.commit()
                ids.append(sg.id)
        c.post(f"/api/rallies/{rally_id}/actions", json={"player_id": p["id"], "skill": "R", "evaluation": "+", "suggestion_id": ids[0]})
        c.post(f"/api/rallies/{rally_id}/actions", json={
            "player_id": p["id"], "skill": "R", "evaluation": "+", "suggestion_id": ids[1], "drop_box": True,
        })
        with Session(engine) as s:
            boxes = [a.player_box for a in s.query(Action).filter(Action.suggestion_id.in_(ids)).order_by(Action.suggestion_id)]
        assert boxes == [[0.1, 0.1, 0.2, 0.4], None]


def test_marking_players_on_a_frame(tmp_path):
    import numpy as np
    from sqlmodel import Session

    from app.cv import detection
    from app.db import engine
    from app.models import Video

    video_path = tmp_path / "VID_MARKS.mp4"
    video_path.write_bytes(b"")
    frames = [
        detection.Frame(t, np.zeros((0, 4)), np.array([[0.1, 0.4, 0.2, 0.8, 0.9], [0.5, 0.4, 0.6, 0.8, 0.8]]))
        for t in (0.0, 0.5, 1.0)
    ]
    detection.save(detection.Detections(detection.DetectionSettings(), frames), detection.sidecar_path(video_path))

    with TestClient(app) as c:
        team = c.post("/api/teams", json={"name": "Marks"}).json()
        roster = c.post(f"/api/teams/{team['id']}/players/import", json={"text": "7 А OH\n9 Б MB"}).json()
        p7, p9 = (p["id"] for p in roster)
        match = c.post("/api/matches", json={"team_id": team["id"], "opponent": "X", "date": "2026-10-25"}).json()
        set_id = c.post(f"/api/matches/{match['id']}/sets").json()["set"]["id"]
        with Session(engine) as s:
            v = Video(original_path=str(video_path), status="ready")
            s.add(v)
            s.commit()
            vid = v.id
        c.patch(f"/api/sets/{set_id}", json={"video_id": vid})

        frame = c.get(f"/api/sets/{set_id}/persons", params={"time": 0.6}).json()
        assert frame["time"] == 0.5 and len(frame["persons"]) == 2
        left, right = (p["box"] for p in frame["persons"])

        c.post(f"/api/sets/{set_id}/player-marks", json={"time": 0.5, "box": left, "player_id": p7})
        marks = c.post(f"/api/sets/{set_id}/player-marks", json={"time": 0.5, "box": left, "player_id": p9}).json()["marks"]
        assert [(m["player_id"], m["box"]) for m in marks] == [(p9, left)]  # same person re-marked
        marks = c.post(f"/api/sets/{set_id}/player-marks", json={"time": 0.5, "box": right, "player_id": p9}).json()["marks"]
        assert [(m["player_id"], m["box"]) for m in marks] == [(p9, right)]  # a player is one person per frame

        # "not ours" replaces a mark on that person, and a mark replaces "not ours"
        state = c.post(f"/api/sets/{set_id}/ignored", json={"time": 0.5, "box": right}).json()
        assert state["marks"] == [] and [i["box"] for i in state["ignored"]] == [right]
        state = c.post(f"/api/sets/{set_id}/player-marks", json={"time": 0.5, "box": right, "player_id": p7}).json()
        assert state["ignored"] == [] and [m["player_id"] for m in state["marks"]] == [p7]
        assert c.delete(f"/api/player-marks/{state['marks'][0]['id']}").json() == {"marks": [], "ignored": []}

        both = c.post(f"/api/sets/{set_id}/player-marks/batch", json=[
            {"time": 0.5, "box": left, "player_id": p7}, {"time": 0.5, "box": right, "player_id": p9},
        ]).json()["marks"]
        assert sorted((m["player_id"], m["box"] == left) for m in both) == sorted([(p7, True), (p9, False)])
