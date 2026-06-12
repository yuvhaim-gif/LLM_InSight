import os
import json

import config

REAL = "chat_backup_pre_run_20251201120000.json"


def _layer3(pn, it, tag, reply, model, overall, grade):
    return {
        "layer": "Layer3",
        "prompt_number": pn,
        "iteration": it,
        "grade_tag": tag,
        "layer1_reply": reply,
        "model_used": model,
        "overall_score": overall,
        "grade": grade,
        "prompt": "What is 2+2?",
    }


def _iter(it, a_score, b_score):
    return {
        "iteration": it,
        "best_score": max(a_score, b_score),
        "is_best_best": it == 1,
        "winner": "improved" if b_score >= a_score else "original",
        "layer1a_score": a_score,
        "layer1b_score": b_score,
        "layer1a_model_used": "modelA",
        "layer1b_model_used": "modelB",
        "layer1a_grades": {"accuracy": a_score, "clarity": a_score},
        "layer1b_grades": {"accuracy": b_score, "clarity": b_score},
        "total_runtime": 5,
    }


def _write_backup_with_pairs(name):
    data = {
        "version": "2.0",
        "prompt_history": ["What is 2+2?", "What is 3+3?"],
        "ledger_entries": [
            _layer3(1, 1, "original", "Answer A original text", "modelA", 70,
                    {"accuracy": 70, "clarity": 70}),
            _layer3(1, 1, "improved", "Answer B improved text", "modelB", 90,
                    {"accuracy": 90, "clarity": 90}),
        ],
        "iteration_history": {
            "prompts": {
                "prompt_1": {
                    "prompt_number": 1,
                    "iterations": [_iter(1, 70, 90), _iter(2, 75, 80), _iter(3, 60, 95)],
                },
                "prompt_2": {
                    "prompt_number": 2,
                    "iterations": [_iter(1, 50, 65), _iter(2, 55, 60)],
                },
            }
        },
        "session_data": {
            "grader_setting_name": "default",
            "current_weights": {"accuracy": 0.5, "clarity": 0.5},
        },
    }
    path = os.path.join(config.DOWNLOADS_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return path


def _prompt_by_number(body, n):
    for pdata in body["prompts"].values():
        if str(pdata.get("prompt_number")) == str(n):
            return pdata
    return None


def test_prompt_number_present_in_analyze(auth_client):
    _write_backup_with_pairs(REAL)
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    body = auth_client.get("/api/arena/source/analyze", query_string={"file": REAL}).get_json()
    assert any(str(p.get("prompt_number")) == "1" for p in body["prompts"].values())
    assert any(str(p.get("prompt_number")) == "2" for p in body["prompts"].values())


def test_all_iterations_preserved_per_prompt(auth_client):
    _write_backup_with_pairs(REAL)
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    body = auth_client.get("/api/arena/source/analyze", query_string={"file": REAL}).get_json()
    p1 = _prompt_by_number(body, 1)
    p2 = _prompt_by_number(body, 2)
    assert p1 is not None and p2 is not None
    assert [it["iteration"] for it in p1["iterations"]] == [1, 2, 3]
    assert [it["iteration"] for it in p2["iterations"]] == [1, 2]


def test_analyze_does_not_inject_user_pref(auth_client):
    _write_backup_with_pairs(REAL)
    auth_client.post("/api/arena/source/restore", json={"file": REAL})
    auth_client.post("/api/arena/scan",
                     json={"source_kind": "backup", "source_ref": REAL, "pair_mode": "same_iter"})
    nxt = auth_client.get("/api/arena/next").get_json()
    if nxt.get("pair_id"):
        auth_client.post("/api/arena/vote",
                         json={"pair_id": nxt["pair_id"], "verdict": "left", "display_swap": False})
    body = auth_client.get("/api/arena/source/analyze", query_string={"file": REAL}).get_json()
    for pdata in body["prompts"].values():
        for it in pdata.get("iterations", []):
            assert "user_pref" not in it
