import os
import json

import pytest

from preference import export as rm_export


def _pair_rec(pair_id, chosen="C", rejected="R", prompt="p", conf=1.0,
              source="human", band="GOLD"):
    return {"pair_id": pair_id, "prompt": prompt, "chosen": chosen, "rejected": rejected,
            "confidence": conf, "source": source, "band": band}


def _ans_rec(pair_id, answer="A", label=True, prompt="p", conf=1.0,
             source="human", band="GOLD"):
    return {"pair_id": pair_id, "prompt": prompt, "answer": answer, "label": label,
            "confidence": conf, "source": source, "band": band}


@pytest.fixture
def exp(tmp_path, monkeypatch):
    out_dir = str(tmp_path / "exp")
    monkeypatch.setattr(rm_export, "PREFERENCE_EXPORT_DIR", out_dir)
    monkeypatch.setattr(rm_export, "get_grader_setting_name", lambda: "default")
    monkeypatch.setattr(rm_export, "get_grader_config", lambda name: {"weights": {"a": 1.0}})

    state = {"pairs": [], "examples": []}

    monkeypatch.setattr(rm_export.dataset, "build_pools",
                        lambda *a, **k: {"gold": state["pairs"], "auto": [], "review": [], "kappa": 1.0})
    monkeypatch.setattr(rm_export.dataset, "build_examples",
                        lambda *a, **k: {"examples": state["examples"], "kappa": 1.0})
    return {"dir": out_dir, "state": state}


def _read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_preference_standard_shape(exp):
    exp["state"]["pairs"] = [_pair_rec("p1", "GOOD", "BAD")]
    rows = rm_export.preview("u", {"format": "preference"}, None, 10)
    assert rows == [{"prompt": "p", "chosen": "GOOD", "rejected": "BAD"}]
    assert set(rows[0].keys()) == {"prompt", "chosen", "rejected"}


def test_preference_conversational_shape(exp):
    exp["state"]["pairs"] = [_pair_rec("p1", "GOOD", "BAD")]
    rows = rm_export.preview("u", {"format": "preference", "conversational": "1"}, None, 10)
    r = rows[0]
    assert r["prompt"] == [{"role": "user", "content": "p"}]
    assert r["chosen"][-1] == {"role": "assistant", "content": "GOOD"}
    assert r["rejected"][-1] == {"role": "assistant", "content": "BAD"}


def test_preference_drops_tie(exp):
    exp["state"]["pairs"] = [_pair_rec("p1", "GOOD", None)]
    rows = rm_export.preview("u", {"format": "preference"}, None, 10)
    assert rows == []


def test_sft_pass_only(exp):
    exp["state"]["examples"] = [_ans_rec("p1", "GOOD", True), _ans_rec("p2", "BAD", False)]
    rows = rm_export.preview("u", {"format": "sft"}, None, 10)
    assert rows == [{"prompt": "p", "completion": "GOOD"}]


def test_kto_two_rows_bool_label(exp):
    exp["state"]["examples"] = [_ans_rec("p1", "GOOD", True), _ans_rec("p2", "BAD", False)]
    rows = rm_export.preview("u", {"format": "kto"}, None, 10)
    assert len(rows) == 2
    assert {r["label"] for r in rows} == {True, False}
    assert all(set(r.keys()) == {"prompt", "completion", "label"} for r in rows)


def test_judge_cls_shape(exp):
    exp["state"]["examples"] = [_ans_rec("p1", "GOOD", True), _ans_rec("p2", "BAD", False)]
    rows = rm_export.preview("u", {"format": "judge_cls"}, None, 10)
    assert all(set(r.keys()) == {"text", "label"} for r in rows)
    assert {r["label"] for r in rows} == {0, 1}


def test_judge_gen_shape(exp):
    exp["state"]["examples"] = [_ans_rec("p1", "GOOD", True), _ans_rec("p2", "BAD", False)]
    rows = rm_export.preview("u", {"format": "judge_gen"}, None, 10)
    assert all(set(r.keys()) == {"prompt", "completion"} for r in rows)
    assert {r["completion"] for r in rows} == {"PASS", "FAIL"}


def test_identical_row_dedupe(exp):
    exp["state"]["pairs"] = [_pair_rec("p1", "G", "B"), _pair_rec("p2", "G", "B")]
    path = rm_export.write_export("u", {"format": "preference", "split": "0"}, None)
    rows = _read_jsonl(path)
    assert len(rows) == 1


def test_write_export_atomic_with_sidecars(exp):
    exp["state"]["pairs"] = [_pair_rec("p1", "G1", "B1"), _pair_rec("p2", "G2", "B2")]
    path = rm_export.write_export("u", {"format": "preference", "split": "0"}, None)
    assert os.path.exists(path)
    files = os.listdir(exp["dir"])
    assert not any(f.endswith(".tmp") for f in files)
    base = path[:-len("_train.jsonl")]
    train = _read_jsonl(path)
    meta = _read_jsonl(base + "_train.meta.jsonl")
    assert len(train) == len(meta)
    for row in train:
        assert "_meta" not in row
    card = json.loads(open(base + ".card.json", encoding="utf-8").read())
    assert card["stream"] == "pairwise"
    assert "label_balance" in card
    assert card["trl_type"] == "preference"


def test_split_determinism(exp):
    rid = "stable_pair_id_123"
    b1 = rm_export._bucket(rid, 0.5)
    b2 = rm_export._bucket(rid, 0.5)
    assert b1 == b2
    assert rm_export._bucket(rid, 0) == "train"


def test_preview_limit(exp):
    exp["state"]["pairs"] = [_pair_rec(f"p{i}", f"G{i}", f"B{i}") for i in range(20)]
    rows = rm_export.preview("u", {"format": "preference"}, None, 5)
    assert len(rows) == 5
