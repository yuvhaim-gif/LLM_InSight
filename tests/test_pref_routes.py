import os
import json

import pytest

import config
import preference.store as store


def _entry(pn, it, tag, reply, overall, grade):
    return {"layer": "Layer3", "prompt_number": pn, "iteration": it, "grade_tag": tag,
            "prompt": f"prompt {pn}", "layer1_reply": reply, "model_used": "m",
            "overall_score": overall, "grade": grade}


def _seed_ledger():
    lines = [
        _entry(1, 0, "original", "answer A original", 80, {"accuracy": 80, "clarity": 70}),
        _entry(1, 0, "improved", "answer B improved", 40, {"accuracy": 40, "clarity": 50}),
    ]
    with open(config.LEDGER_FILE, "w", encoding="utf-8") as f:
        for line in lines:
            f.write(json.dumps(line) + "\n")


def test_next_requires_auth(client):
    assert client.get("/api/arena/next").status_code == 401


def test_studio_pages_render(auth_client):
    for path in ("/arena", "/dataset"):
        r = auth_client.get(path)
        assert r.status_code == 200
        html = r.get_data(as_text=True)
        assert "studio-tab" in html
        assert 'id="source-manager"' in html
        assert 'id="table-area"' in html
        assert 'js/studio/init.js' in html
    assert '"arena"' in auth_client.get("/arena").get_data(as_text=True)
    assert '"dataset"' in auth_client.get("/dataset").get_data(as_text=True)


def test_scan_invalid_backup_ref(auth_client):
    r = auth_client.post("/api/arena/scan",
                         json={"source_kind": "backup", "source_ref": "nope.json"})
    assert r.status_code == 400


def test_full_arena_flow_and_swap(auth_client):
    _seed_ledger()
    r = auth_client.post("/api/arena/scan", json={"source_kind": "live", "pair_mode": "same_iter"})
    body = r.get_json()
    assert body["queued"] == 1

    nv = auth_client.get("/api/arena/next").get_json()
    pid = nv["pair_id"]
    assert nv["blind"] is True

    auth_client.post("/api/arena/vote", json={
        "pair_id": pid, "verdict": "left", "display_swap": True,
        "left_human": 10, "right_human": 90})

    votes = store.iter_votes("testadmin")
    assert len(votes) == 1
    v = votes[0]
    assert v["verdict"] == "right"
    assert v["left_human"] == 90
    assert v["right_human"] == 10


def test_refine_sets_gold(auth_client):
    _seed_ledger()
    auth_client.post("/api/arena/scan", json={"source_kind": "live", "pair_mode": "same_iter"})
    pid = auth_client.get("/api/arena/next").get_json()["pair_id"]
    auth_client.post("/api/arena/refine", json={"pair_id": pid, "gold_text": "the gold answer"})
    v = store.iter_votes("testadmin")[0]
    assert v["verdict"] == "both_bad"
    assert v["gold_text"] == "the gold answer"


def test_role_endpoint(auth_client):
    _seed_ledger()
    auth_client.post("/api/arena/scan", json={"source_kind": "live", "pair_mode": "same_iter"})
    pid = auth_client.get("/api/arena/next").get_json()["pair_id"]
    auth_client.post("/api/arena/vote", json={"pair_id": pid, "verdict": "left", "display_swap": False})
    r = auth_client.post("/api/arena/role", json={"pair_id": pid, "role": "ground_truth"})
    assert r.get_json()["ok"] is True
    assert store.iter_votes("testadmin")[0]["role"] == "ground_truth"


def test_calibrate_report_refit_history(auth_client):
    _seed_ledger()
    auth_client.post("/api/arena/scan", json={"source_kind": "live", "pair_mode": "same_iter"})
    pid = auth_client.get("/api/arena/next").get_json()["pair_id"]
    auth_client.post("/api/arena/vote", json={"pair_id": pid, "verdict": "left", "display_swap": False})

    rep = auth_client.get("/api/calibrate/report").get_json()
    assert "n_pairs" in rep and "settings" in rep

    refit = auth_client.post("/api/calibrate/refit").get_json()
    assert "weights" in refit or "error" in refit

    hist = auth_client.get("/api/calibrate/history").get_json()
    assert isinstance(hist, list)


def test_dataset_build_examples_preview(auth_client):
    _seed_ledger()
    auth_client.post("/api/arena/scan", json={"source_kind": "live", "pair_mode": "same_iter"})
    pid = auth_client.get("/api/arena/next").get_json()["pair_id"]
    auth_client.post("/api/arena/vote", json={"pair_id": pid, "verdict": "left", "display_swap": False})

    build = auth_client.get("/api/dataset/build").get_json()
    assert "counts" in build and build["counts"]["gold"] == 1

    ex = auth_client.get("/api/dataset/examples").get_json()
    assert "counts" in ex

    prev = auth_client.get("/api/dataset/export/preview",
                           query_string={"format": "preference", "n": 5}).get_json()
    assert isinstance(prev, list)


def test_send_to_arena_requeues(auth_client):
    _seed_ledger()
    auth_client.post("/api/arena/scan", json={"source_kind": "live", "pair_mode": "same_iter"})
    pid = auth_client.get("/api/arena/next").get_json()["pair_id"]
    auth_client.post("/api/arena/vote", json={"pair_id": pid, "verdict": "left", "display_swap": False})
    r = auth_client.post("/api/dataset/send_to_arena", json={"pair_ids": [pid]})
    body = r.get_json()
    assert body["requeued"] == 1
