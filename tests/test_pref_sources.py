import os
import json

import pytest

import config


def _write_backup(name, grader="myset"):
    data = {
        "version": "2.0",
        "prompt_history": ["p1", "p2"],
        "ledger_entries": [{"x": 1}, {"x": 2}, {"x": 3}],
        "iteration_history": {},
        "session_data": {"grader_setting_name": grader,
                         "current_weights": {"accuracy": 0.5, "clarity": 0.5}},
    }
    path = os.path.join(config.DOWNLOADS_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return path


REAL = "chat_backup_pre_run_20251201120000.json"
OLD_ISO = "chat_backup_old_2025-01-01T10-00-00.json"


def test_sources_requires_auth(client):
    r = client.get("/api/arena/sources")
    assert r.status_code == 401


def test_sources_lists_live_and_backups(auth_client):
    _write_backup(REAL)
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    r = auth_client.get("/api/arena/sources")
    body = r.get_json()
    assert body["live"]["ephemeral"] is True
    files = [b["file"] for b in body["backups"]]
    assert REAL in files


def test_real_stamp_kept_old_iso_excluded(auth_client):
    _write_backup(REAL)
    _write_backup(OLD_ISO)
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    auth_client.post("/api/arena/source/restore", json={"file": OLD_ISO})
    r = auth_client.get("/api/arena/sources")
    files = {b["file"]: b["label"] for b in r.get_json()["backups"]}
    assert REAL in files and files[REAL] == REAL
    assert OLD_ISO not in files


def test_source_meta_valid_and_invalid(auth_client):
    _write_backup(REAL, grader="myset")
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    r = auth_client.get("/api/arena/source/meta", query_string={"file": REAL})
    body = r.get_json()
    assert body["grader_setting"] == "myset"
    assert body["prompts"] == 2 and body["ledger_lines"] == 3
    bad = auth_client.get("/api/arena/source/meta", query_string={"file": "../etc/passwd"})
    assert bad.status_code == 400


def test_source_analyze_valid(auth_client):
    _write_backup(REAL, grader="myset")
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    r = auth_client.get("/api/arena/source/analyze", query_string={"file": REAL})
    assert r.status_code == 200
    body = r.get_json()
    assert body["file"] == REAL
    assert body["grader_setting"] == "myset"


def test_forget_and_restore(auth_client):
    _write_backup(REAL)
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    r = auth_client.post("/api/arena/source/forget", json={"file": REAL})
    files = {b["file"] for b in r.get_json()["backups"]}
    assert REAL not in files
    r2 = auth_client.post("/api/arena/source/restore", json={"file": REAL})
    files2 = {b["file"] for b in r2.get_json()["backups"]}
    assert REAL in files2


def test_source_ops_do_not_touch_ledger(auth_client):
    with open(config.LEDGER_FILE, "w", encoding="utf-8") as f:
        f.write('{"layer":"Layer3"}\n')
    before = open(config.LEDGER_FILE, "rb").read()
    _write_backup(REAL)
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    auth_client.get("/api/arena/sources")
    auth_client.get("/api/arena/source/meta", query_string={"file": REAL})
    auth_client.get("/api/arena/source/analyze", query_string={"file": REAL})
    auth_client.post("/api/arena/source/forget", json={"file": REAL})
    after = open(config.LEDGER_FILE, "rb").read()
    assert before == after
