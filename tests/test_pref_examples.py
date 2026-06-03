import json
import hashlib

import pytest

from preference import dataset


def _sha(s):
    return hashlib.sha1(s.strip().encode("utf-8")).hexdigest()


class FakeStore:
    def __init__(self, votes=None, bl_hashes=None, bl_rows=None):
        self._votes = votes or []
        self._bl = set(bl_hashes or [])
        self._rows = bl_rows or []

    def iter_votes(self, annotator):
        return self._votes

    def blacklist_hashes(self, annotator):
        return self._bl

    def blacklist_rows(self, annotator):
        return self._rows


def _vote(pair_id, verdict, ltext, rtext, lg=None, rg=None, lo=0, ro=0,
          prompt="p", gold_text=None, role="auto"):
    return {"pair_id": pair_id, "verdict": verdict, "prompt_text": prompt,
            "left_text": ltext, "right_text": rtext,
            "left_grades": json.dumps(lg or {"a": lo}), "right_grades": json.dumps(rg or {"a": ro}),
            "left_overall": lo, "right_overall": ro,
            "gold_text": gold_text, "role": role}


def _pair(pair_id, lo, ro, ltext, rtext, prompt="p"):
    return {"pair_id": pair_id, "prompt_text": prompt,
            "left": {"text": ltext, "overall": lo, "grades": {"a": lo}},
            "right": {"text": rtext, "overall": ro, "grades": {"a": ro}}}


CFG = {"weights": {"a": 1.0}}


def test_human_winner_pass_loser_fail(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [_vote("v1", "left", "WIN", "LOSE", lo=80, ro=40)]
    out = dataset.build_examples("u", FakeStore(votes), CFG)
    by_text = {e["answer"]: e for e in out["examples"]}
    assert by_text["WIN"]["label"] is True
    assert by_text["LOSE"]["label"] is False
    assert out["counts"]["pass"] + out["counts"]["fail"] == out["counts"]["total"]


def test_both_bad_losers_fail_gold_pass(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [_vote("v1", "both_bad", "L", "R", lo=30, ro=30, gold_text="GOLD")]
    out = dataset.build_examples("u", FakeStore(votes), CFG)
    by_text = {e["answer"]: e for e in out["examples"]}
    assert by_text["L"]["label"] is False and by_text["R"]["label"] is False
    assert by_text["GOLD"]["label"] is True


def test_blacklist_beats_pass(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [_vote("v1", "left", "WIN", "LOSE", lo=80, ro=40)]
    store = FakeStore(votes, bl_hashes={_sha("WIN")})
    out = dataset.build_examples("u", store, CFG)
    by_text = {e["answer"]: e for e in out["examples"]}
    assert by_text["WIN"]["label"] is False
    assert by_text["WIN"]["source"] == "blacklist"


def test_human_beats_auto(monkeypatch):
    pairs = [_pair("p1", 90, 10, "SAME", "OTHER")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    votes = [_vote("v1", "left", "X", "SAME", lo=80, ro=40)]
    out = dataset.build_examples("u", FakeStore(votes), CFG)
    same = next(e for e in out["examples"] if e["answer"] == "SAME")
    assert same["source"] == "human" and same["label"] is False


def test_review_band_not_labeled(monkeypatch):
    pairs = [_pair("p1", 60, 55, "A", "B")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    out = dataset.build_examples("u", FakeStore([]), CFG)
    assert out["counts"]["total"] == 0


def test_auto_pass_fail_labeling(monkeypatch):
    pairs = [_pair("p1", 100, 0, "GOODAUTO", "BADAUTO")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    out = dataset.build_examples("u", FakeStore([]), CFG)
    by_text = {e["answer"]: e for e in out["examples"]}
    assert by_text["GOODAUTO"]["label"] is True
    assert by_text["BADAUTO"]["label"] is False


def test_dedup_by_hash(monkeypatch):
    pairs = [_pair("p1", 100, 0, "DUP", "X"), _pair("p2", 100, 0, "DUP", "Y")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    out = dataset.build_examples("u", FakeStore([]), CFG)
    dups = [e for e in out["examples"] if e["answer"] == "DUP"]
    assert len(dups) == 1


def test_role_exclude_omitted(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [_vote("v1", "left", "WIN", "LOSE", lo=80, ro=40, role="exclude")]
    out = dataset.build_examples("u", FakeStore(votes), CFG)
    assert out["counts"]["total"] == 0
