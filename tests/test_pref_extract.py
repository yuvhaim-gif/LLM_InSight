import json

from preference import extract


def _entry(pn, it, tag, reply, overall, grades=None, model="m", prompt="P"):
    return {
        "layer": "Layer3",
        "layer1_reply": reply,
        "grade_tag": tag,
        "prompt_number": pn,
        "iteration": it,
        "overall_score": overall,
        "grade": grades or {"accuracy": overall},
        "model_used": model,
        "prompt": prompt,
    }


def test_same_iter_basic():
    entries = [
        _entry(1, 1, "original", "answer A", 60),
        _entry(1, 1, "improved", "answer B", 80),
    ]
    pairs = extract.extract_same_iter(entries, "live", "live_ledger", "default")
    assert len(pairs) == 1
    p = pairs[0]
    assert p["pair_mode"] == "same_iter"
    assert p["left"]["tag"] == "original" and p["right"]["tag"] == "improved"
    assert p["prompt_text"] == "P"
    assert p["grader_setting"] == "default"


def test_same_iter_identical_skipped():
    entries = [
        _entry(1, 1, "original", "same text", 60),
        _entry(1, 1, "improved", "same text", 80),
    ]
    assert extract.extract_same_iter(entries, "live", "live_ledger", "default") == []


def test_error_and_empty_replies_excluded():
    entries = [
        _entry(1, 1, "original", "[OLLAMA_ERROR] boom", 1),
        _entry(1, 1, "improved", "", 1),
        _entry(2, 1, "original", "good A", 50),
        _entry(2, 1, "improved", "good B", 70),
    ]
    pairs = extract.extract_same_iter(entries, "live", "live_ledger", "default")
    assert len(pairs) == 1
    assert pairs[0]["prompt_number"] == 2


def test_non_layer3_excluded():
    entries = [
        dict(_entry(1, 1, "original", "a", 50), layer="Layer1"),
        dict(_entry(1, 1, "improved", "b", 60), layer="Layer1"),
    ]
    assert extract.extract_same_iter(entries, "live", "live_ledger", "default") == []


def test_cross_iter_anchor_gap_cap_and_dedupe():
    entries = [
        _entry(1, 1, "improved", "anchor", 90),
        _entry(1, 2, "improved", "close", 88),       # gap 2 < 5 -> excluded
        _entry(1, 3, "improved", "mid", 80),         # gap 10 -> kept
        _entry(1, 4, "improved", "low", 70),         # gap 20 -> kept
        _entry(1, 5, "improved", "anchor", 50),      # duplicate text of anchor -> deduped (lower overall dropped)
    ]
    pairs = extract.extract_cross_iter(entries, "live", "live_ledger", "default")
    assert len(pairs) == 2
    for p in pairs:
        assert p["left"]["tag"] == "best"
        assert p["left"]["overall"] == 90.0
        assert abs(p["left"]["overall"] - p["right"]["overall"]) >= 5


def test_cross_iter_per_prompt_cap():
    entries = [_entry(1, 0, "improved", "anchor", 100)]
    for i in range(10):
        entries.append(_entry(1, i + 1, "improved", f"cand{i}", 50 - i))
    pairs = extract.extract_cross_iter(entries, "live", "live_ledger", "default")
    assert len(pairs) == extract.ARENA_CROSS_MAX_PER_PROMPT


def test_pair_id_stable():
    entries = [
        _entry(1, 1, "original", "answer A", 60),
        _entry(1, 1, "improved", "answer B", 80),
    ]
    p1 = extract.extract_same_iter(entries, "live", "live_ledger", "default")[0]
    p2 = extract.extract_same_iter(entries, "live", "live_ledger", "default")[0]
    assert p1["pair_id"] == p2["pair_id"]


def test_both_union_dedupe(tmp_path, monkeypatch):
    entries = [
        _entry(1, 1, "original", "answer A", 60),
        _entry(1, 1, "improved", "answer B", 90),
    ]
    ledger = tmp_path / "ledger.jsonl"
    with open(ledger, "w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")
    monkeypatch.setattr(extract, "LEDGER_FILE", str(ledger))
    out = extract.extract_pairs("live", "live_ledger", "both", "default")
    ids = [p["pair_id"] for p in out]
    assert len(ids) == len(set(ids))


def test_load_ledger_backup_uses_backup_grader_setting(tmp_path, monkeypatch):
    backup = {
        "session_data": {"grader_setting_name": "from_backup"},
        "ledger_entries": [
            _entry(1, 1, "original", "answer A", 60),
            _entry(1, 1, "improved", "answer B", 80),
        ],
    }
    fn = "chat_backup_x.json"
    with open(tmp_path / fn, "w", encoding="utf-8") as f:
        json.dump(backup, f)
    monkeypatch.setattr(extract, "DOWNLOADS_DIR", str(tmp_path))
    entries, sdata = extract.load_ledger("backup", fn)
    assert sdata.get("grader_setting_name") == "from_backup"
    out = extract.extract_pairs("backup", fn, "same_iter", "session_value")
    assert out and out[0]["grader_setting"] == "from_backup"
