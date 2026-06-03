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


def _vote(pair_id, verdict, lg, rg, ltext, rtext, lo, ro, prompt="p",
          gold_text=None, role="auto"):
    return {"pair_id": pair_id, "verdict": verdict, "prompt_text": prompt,
            "left_text": ltext, "right_text": rtext,
            "left_grades": json.dumps(lg), "right_grades": json.dumps(rg),
            "left_overall": lo, "right_overall": ro,
            "gold_text": gold_text, "role": role}


def _pair(pair_id, lo, ro, lg, rg, ltext, rtext, prompt="p"):
    return {"pair_id": pair_id, "prompt_text": prompt,
            "left": {"text": ltext, "overall": lo, "grades": lg},
            "right": {"text": rtext, "overall": ro, "grades": rg}}


CFG = {"weights": {"a": 1.0}}


def test_gold_from_human_verdict(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [_vote("v1", "left", {"a": 80}, {"a": 40}, "WIN", "LOSE", 80, 40)]
    out = dataset.build_pools("u", FakeStore(votes), CFG)
    assert out["counts"]["gold"] == 1
    g = out["gold"][0]
    assert g["chosen"] == "WIN" and g["rejected"] == "LOSE" and g["band"] == "GOLD"


def test_gold_from_both_bad_and_gold(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [_vote("v1", "both_bad", {"a": 30}, {"a": 30}, "L", "R", 30, 30, gold_text="GOLD")]
    out = dataset.build_pools("u", FakeStore(votes), CFG)
    assert out["counts"]["gold"] == 2
    assert all(r["chosen"] == "GOLD" for r in out["gold"])


def test_role_exclude_omitted(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [_vote("v1", "left", {"a": 80}, {"a": 40}, "WIN", "LOSE", 80, 40, role="exclude")]
    out = dataset.build_pools("u", FakeStore(votes), CFG)
    assert out["counts"]["gold"] == 0


def test_auto_plus_honors_margin_and_conf(monkeypatch):
    pairs = [_pair("p1", 90, 40, {"a": 90}, {"a": 40}, "AUTOWIN", "AUTOLOSE")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    out = dataset.build_pools("u", FakeStore([]), CFG)
    assert out["counts"]["auto"] == 1
    rec = out["auto"][0]
    assert rec["band"] == "AUTO+" and rec["chosen"] == "AUTOWIN"
    assert rec["confidence"] >= 0.66


def test_low_margin_routes_to_review(monkeypatch):
    pairs = [_pair("p1", 55, 50, {"a": 55}, {"a": 50}, "A", "B")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    out = dataset.build_pools("u", FakeStore([]), CFG)
    assert out["counts"]["auto"] == 0
    assert out["counts"]["review"] == 1
    assert out["review"][0]["band"] == "REVIEW"


def test_mid_confidence_routes_to_review(monkeypatch):
    pairs = [_pair("p1", 62, 50, {"a": 51}, {"a": 50}, "A", "B")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    out = dataset.build_pools("u", FakeStore([]), CFG)
    assert out["counts"]["auto"] == 0 and out["counts"]["review"] == 1
    assert out["review"][0]["band"] == "REVIEW"


def test_blacklisted_winner_excluded(monkeypatch):
    pairs = [_pair("p1", 90, 40, {"a": 90}, {"a": 40}, "BADWIN", "LOSE")]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    store = FakeStore([], bl_hashes={_sha("BADWIN")})
    out = dataset.build_pools("u", store, CFG)
    assert out["counts"]["auto"] == 0 and out["counts"]["review"] == 0
    assert out["blacklist_count"] == 1


def test_dedup_and_cap(monkeypatch):
    pairs = [_pair(f"p{i}", 90, 40, {"a": 90}, {"a": 40}, "W", "L") for i in range(3)]
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: pairs)
    out = dataset.build_pools("u", FakeStore([]), CFG)
    assert out["counts"]["auto"] == 1


def test_kappa_in_output(monkeypatch):
    monkeypatch.setattr(dataset, "_candidate_pairs_from_sources", lambda cfg, s: [])
    votes = [
        _vote("v1", "left", {"a": 80}, {"a": 40}, "A", "B", 80, 40),
        _vote("v2", "right", {"a": 30}, {"a": 70}, "C", "D", 30, 70),
    ]
    out = dataset.build_pools("u", FakeStore(votes), CFG)
    assert out["kappa"] == 1.0
