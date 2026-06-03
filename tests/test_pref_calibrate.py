import os
import json
import hashlib

import pytest

from preference import calibrate


def _sha(s):
    return hashlib.sha1(s.strip().encode("utf-8")).hexdigest()


def _vote(verdict, lg, rg, lo=None, ro=None, lh=None, rh=None,
          ltext="L", rtext="R", prompt="p", sk="live", sr="live_ledger"):
    if lo is None:
        lo = sum(lg.values()) / len(lg) if lg else 0
    if ro is None:
        ro = sum(rg.values()) / len(rg) if rg else 0
    return {
        "verdict": verdict,
        "left_grades": json.dumps(lg), "right_grades": json.dumps(rg),
        "left_overall": lo, "right_overall": ro,
        "left_human": lh, "right_human": rh,
        "left_text": ltext, "right_text": rtext,
        "left_hash": _sha(ltext), "right_hash": _sha(rtext),
        "prompt_text": prompt, "source_kind": sk, "source_ref": sr,
    }


def test_pairwise_accuracy_perfect():
    votes = [
        _vote("left", {"a": 80}, {"a": 40}, lo=80, ro=40),
        _vote("right", {"a": 30}, {"a": 70}, lo=30, ro=70),
    ]
    acc, n = calibrate.pairwise_accuracy(votes)
    assert acc == 1.0 and n == 2


def test_pairwise_accuracy_none_when_no_decisive():
    votes = [_vote("tie", {"a": 50}, {"a": 50}, lo=50, ro=50)]
    acc, n = calibrate.pairwise_accuracy(votes)
    assert acc is None and n == 0


def test_cohen_kappa_perfect_is_one():
    votes = [
        _vote("left", {"a": 80}, {"a": 40}, lo=80, ro=40),
        _vote("right", {"a": 30}, {"a": 70}, lo=30, ro=70),
    ]
    assert calibrate.cohen_kappa(votes) == 1.0


def test_cohen_kappa_zero_on_constant_grader():
    votes = [
        _vote("left", {"a": 90}, {"a": 10}, lo=90, ro=10),
        _vote("left", {"a": 90}, {"a": 10}, lo=90, ro=10),
        _vote("right", {"a": 90}, {"a": 10}, lo=90, ro=10),
        _vote("right", {"a": 90}, {"a": 10}, lo=90, ro=10),
    ]
    assert calibrate.cohen_kappa(votes) == 0.0


def test_spearman_none_below_three():
    votes = [_vote("left", {"a": 80}, {"a": 40}, lo=80, ro=40, lh=90)]
    assert calibrate.spearman_scalar(votes) is None


def test_spearman_positive_correlation():
    votes = [
        _vote("left", {"a": 80}, {"a": 40}, lo=80, ro=40, lh=85, rh=35),
        _vote("right", {"a": 30}, {"a": 70}, lo=30, ro=70, lh=25, rh=75),
    ]
    sp = calibrate.spearman_scalar(votes)
    assert sp is not None and sp > 0.5


def test_per_category_alignment():
    votes = [
        _vote("left", {"a": 80, "b": 20}, {"a": 40, "b": 90}, lo=50, ro=65),
        _vote("left", {"a": 70, "b": 30}, {"a": 30, "b": 80}, lo=50, ro=55),
    ]
    al = calibrate.per_category_alignment(votes)
    assert al["a"] == 1.0
    assert al["b"] == 0.0


def test_refit_weights_shifts_to_aligned_attribute():
    votes = [
        _vote("left", {"accuracy": 90, "length": 10}, {"accuracy": 50, "length": 90}),
        _vote("left", {"accuracy": 85, "length": 5}, {"accuracy": 45, "length": 95}),
        _vote("right", {"accuracy": 40, "length": 95}, {"accuracy": 88, "length": 12}),
    ]
    equal = {"accuracy": 1.0, "length": 1.0}
    base_acc, _ = calibrate.pairwise_accuracy(votes, equal)
    res = calibrate.refit_weights(votes, ["accuracy", "length"])
    assert res is not None
    assert res["weights"]["accuracy"] > res["weights"]["length"]
    assert res["pairwise_acc"] >= base_acc
    assert res["pairwise_acc"] == 1.0


def test_apply_regrade_overlays_by_hash():
    v = _vote("left", {"a": 80}, {"a": 40}, lo=80, ro=40, ltext="A", rtext="B")
    regraded = {_sha("A"): {"grade": {"a": 10}, "overall": 10.0}}
    out = calibrate.apply_regrade([v], regraded)
    assert out[0]["left_overall"] == 10.0
    assert json.loads(out[0]["left_grades"]) == {"a": 10}
    assert out[0]["right_overall"] == 40


def test_regrade_writes_artifact_and_leaves_ledger_untouched(tmp_path, monkeypatch):
    regrade_dir = str(tmp_path / "regrade")
    ledger = tmp_path / "ledger.jsonl"
    ledger.write_text('{"x": 1}\n', encoding="utf-8")
    before = ledger.read_bytes()

    monkeypatch.setattr("preference.calibrate.PREFERENCE_REGRADE_DIR", regrade_dir)
    monkeypatch.setattr("preference.calibrate._grade_single_category",
                        lambda *a, **k: {"score": 88})
    monkeypatch.setattr("preference.calibrate.get_grader_config",
                        lambda name: {"keys": ["accuracy"],
                                      "grader_models": {"accuracy": "m"},
                                      "rubrics": {"accuracy": "r"},
                                      "weights": {"accuracy": 1.0}})

    votes = [_vote("left", {"accuracy": 80}, {"accuracy": 40},
                   lo=80, ro=40, ltext="A", rtext="B")]
    by_hash = calibrate.regrade_calibration_set(votes, "default")

    assert by_hash[_sha("A")]["overall"] == 88
    assert by_hash[_sha("B")]["grade"]["accuracy"] == 88

    files = [f for f in os.listdir(regrade_dir) if f.startswith("regrade_") and f.endswith(".json")]
    assert len(files) == 1
    artifact = json.loads((tmp_path / "regrade" / files[0]).read_text(encoding="utf-8"))
    assert "origins" in artifact and artifact["origins"]
    o = artifact["origins"][0]
    assert o["source_kind"] == "live" and "first_seen" in o and o["prompts"]
    assert {ver["answer_hash"] for ver in artifact["versions"]} == {_sha("A"), _sha("B")}

    assert ledger.read_bytes() == before
