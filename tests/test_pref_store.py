import json
import pytest

from preference import store


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = str(tmp_path / "preferences.db")
    monkeypatch.setattr(store, "PREFERENCES_DB", path)
    store.init_pref_db()
    return path


def _pair(pid="p1"):
    return {
        "pair_id": pid, "source_kind": "live", "source_ref": "live_ledger",
        "pair_mode": "same_iter", "prompt_number": 1, "prompt_text": "P",
        "grader_setting": "default", "disagreement": 0.5,
        "left": {"text": "A", "hash": "ha", "tag": "original", "model": "m", "overall": 60.0, "grades": {"accuracy": 60}},
        "right": {"text": "B", "hash": "hb", "tag": "improved", "model": "m", "overall": 80.0, "grades": {"accuracy": 80}},
    }


def test_upsert_idempotent(db):
    store.upsert_vote(_pair(), "left", "u")
    store.upsert_vote(_pair(), "right", "u")
    rows = store.iter_votes("u")
    assert len(rows) == 1
    assert rows[0]["verdict"] == "right"


def test_scalar_and_role_survive_ordering_only_revote(db):
    store.upsert_vote(_pair(), "left", "u", left_human=80, right_human=40, role="ground_truth")
    store.upsert_vote(_pair(), "right", "u")  # ordering only
    row = store.iter_votes("u")[0]
    assert row["left_human"] == 80
    assert row["right_human"] == 40
    assert row["role"] == "ground_truth"
    assert row["verdict"] == "right"


def test_rebuild_queue_preserves_annotated(db):
    p = _pair()
    p["disagreement"] = 0.9
    store.rebuild_queue("u", [p])
    store.upsert_vote(p, "left", "u")
    assert store.progress("u") == {"annotated": 1, "total": 1}
    store.rebuild_queue("u", [p])  # re-scan
    assert store.progress("u") == {"annotated": 1, "total": 1}
    assert store.next_pair("u") is None  # already annotated


def test_blacklist_idempotent_by_hash(db):
    h1 = store.blacklist_add("u", "bad answer", "P", "r")
    h2 = store.blacklist_add("u", "bad answer", "P", "r")
    assert h1 == h2
    assert len(store.blacklist_rows("u")) == 1
    assert h1 in store.blacklist_hashes("u")


def test_set_gold_and_set_role(db):
    p = _pair()
    store.set_gold(p, "the gold answer", "u")
    row = store.iter_votes("u")[0]
    assert row["verdict"] == "both_bad"
    assert row["gold_text"] == "the gold answer"
    store.set_role("u", p["pair_id"], "exclude")
    assert store.iter_votes("u")[0]["role"] == "exclude"


def test_requeue_pairs(db):
    p = _pair()
    store.rebuild_queue("u", [p])
    store.upsert_vote(p, "left", "u")
    store.requeue_pairs("u", [p["pair_id"]])
    assert store.next_pair("u") is not None


def test_calibration_runs_logged_and_listed(db):
    from utils.common import utc_now_iso
    row = {
        "run_id": "r1", "annotator": "u", "grader_setting": "default",
        "weights_json": json.dumps({"accuracy": 1.0}), "tier": "weights",
        "n_pairs": 10, "pairwise_acc": 0.9, "cohen_kappa": 0.8, "spearman": None,
        "per_category": json.dumps({"accuracy": 0.9}), "suggested_weights": None,
        "created_at": utc_now_iso(),
    }
    store.save_calibration_run(row)
    runs = store.list_calibration_runs("u")
    assert len(runs) == 1 and runs[0]["run_id"] == "r1"
