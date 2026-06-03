import os
import json
import hashlib

from config import (PREFERENCE_EXPORT_DIR, DATASET_TEST_SPLIT, DATASET_DEFAULT_FORMAT,
                    DATASET_AUTO_MIN_MARGIN, DATASET_AUTO_MIN_CONF,
                    JUDGE_CLS_TEMPLATE, JUDGE_GEN_INSTRUCTION)
from utils.common import utc_now_iso
from preference import dataset, store
from utils.grader_settings import get_grader_config
from utils.session import get_grader_setting_name

_PAIRWISE = {"preference"}
_PER_ANSWER = {"sft", "kto", "judge_cls", "judge_gen"}
_TRL_TYPE = {"preference": "preference", "sft": "prompt_completion", "kto": "unpaired_preference",
             "judge_cls": "text_classification", "judge_gen": "prompt_completion"}
_HB_SPLITS = {"preference": ("train_prefs", "test_prefs"), "sft": ("train_sft", "test_sft"),
              "kto": ("train", "test"), "judge_cls": ("train", "test"), "judge_gen": ("train", "test")}


def _truthy(x):
    return str(x).strip().lower() in ("1", "true", "yes", "on")


def _bucket(pair_id, ratio):
    if ratio <= 0:
        return "train"
    return "test" if int(hashlib.sha1(pair_id.encode()).hexdigest(), 16) % 1000 < ratio * 1000 else "train"


def _user_msg(p):
    return [{"role": "user", "content": p}]


def _pair_msgs(p, a):
    return [{"role": "user", "content": p}, {"role": "assistant", "content": a}]


def _emit(fmt, rec, conv):
    if fmt == "preference":
        p, ch, rj = rec["prompt"], rec["chosen"], rec.get("rejected")
        if rj is None:
            return []
        if conv:
            return [{"prompt": _user_msg(p), "chosen": _pair_msgs(p, ch), "rejected": _pair_msgs(p, rj)}]
        return [{"prompt": p, "chosen": ch, "rejected": rj}]
    p, a, lbl = rec["prompt"], rec["answer"], bool(rec["label"])
    if fmt == "sft":
        if not lbl:
            return []
        return [{"messages": _pair_msgs(p, a)} if conv else {"prompt": p, "completion": a}]
    if fmt == "kto":
        if conv:
            return [{"prompt": _user_msg(p), "completion": [{"role": "assistant", "content": a}], "label": lbl}]
        return [{"prompt": p, "completion": a, "label": lbl}]
    if fmt == "judge_cls":
        return [{"text": JUDGE_CLS_TEMPLATE.format(prompt=p, answer=a), "label": int(lbl)}]
    if fmt == "judge_gen":
        verdict = "PASS" if lbl else "FAIL"
        instr = JUDGE_GEN_INSTRUCTION.format(prompt=p, answer=a)
        if conv:
            return [{"messages": [{"role": "user", "content": instr},
                                  {"role": "assistant", "content": verdict}]}]
        return [{"prompt": instr, "completion": verdict}]
    return []


def _records_for(annotator, args, sources=None):
    sources = sources or [("live", "live_ledger")]
    fmt = args.get("format", DATASET_DEFAULT_FORMAT)
    cfg = get_grader_config(get_grader_setting_name())
    minc = float(args.get("min_conf", 0) or 0)
    if fmt in _PAIRWISE:
        pools = dataset.build_pools(annotator, store, cfg, sources)
        include = set((args.get("pools") or "gold,auto").split(","))
        recs = [r for name in ("gold", "auto", "review") if name in include
                for r in pools[name] if r["confidence"] >= minc]
        return recs, cfg, pools.get("kappa")
    ex = dataset.build_examples(annotator, store, cfg, sources)
    only = (args.get("label") or "").lower()
    recs = [e for e in ex["examples"] if e["confidence"] >= minc
            and (only == "" or (e["label"] and only == "pass") or (not e["label"] and only == "fail"))]
    return recs, cfg, ex.get("kappa")


def _atomic_jsonl(path, rows):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _atomic_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def write_export(annotator, args, sources=None):
    os.makedirs(PREFERENCE_EXPORT_DIR, exist_ok=True)
    fmt = args.get("format", DATASET_DEFAULT_FORMAT)
    conv = _truthy(args.get("conversational", ""))
    ratio = float(args.get("split", DATASET_TEST_SPLIT) or 0)
    now = utc_now_iso()
    gs = get_grader_setting_name()
    recs, cfg, kappa = _records_for(annotator, args, sources)

    data = {"train": [], "test": []}
    meta = {"train": [], "test": []}
    seen = set()
    for r in recs:
        split = _bucket(r["pair_id"], ratio)
        for row in _emit(fmt, r, conv):
            key = (split, json.dumps(row, sort_keys=True, ensure_ascii=False))
            if key in seen:
                continue
            seen.add(key)
            data[split].append(row)
            meta[split].append({"pair_id": r["pair_id"], "source": r["source"],
                                "confidence": r["confidence"], "band": r["band"],
                                "label": r.get("label"), "grader_setting": gs,
                                "split": split, "exported_at": now})

    ts = now.replace(":", "-")
    base = os.path.join(PREFERENCE_EXPORT_DIR, f"{fmt}_{'chat' if conv else 'std'}_{ts}")
    splits = ["train"] if ratio <= 0 else ["train", "test"]
    for sp in splits:
        _atomic_jsonl(f"{base}_{sp}.jsonl", data[sp])
        _atomic_jsonl(f"{base}_{sp}.meta.jsonl", meta[sp])
    _atomic_json(f"{base}.card.json", {
        "format": fmt, "trl_type": _TRL_TYPE[fmt], "conversational": conv,
        "stream": "pairwise" if fmt in _PAIRWISE else "per_answer",
        "grader_setting": gs, "weights": cfg["weights"], "calibrated_kappa": kappa,
        "thresholds": {"min_margin": DATASET_AUTO_MIN_MARGIN, "min_conf": DATASET_AUTO_MIN_CONF},
        "counts": {sp: len(data[sp]) for sp in splits},
        "label_balance": {sp: {"pass": sum(1 for m in meta[sp] if m.get("label") is True),
                               "fail": sum(1 for m in meta[sp] if m.get("label") is False)}
                          for sp in splits},
        "alignment_handbook_splits": _HB_SPLITS[fmt], "created_at": now})
    return f"{base}_train.jsonl"


def preview(annotator, args, sources=None, n=10):
    fmt = args.get("format", DATASET_DEFAULT_FORMAT)
    conv = _truthy(args.get("conversational", ""))
    recs, _, _ = _records_for(annotator, args, sources)
    out = []
    for r in recs:
        for row in _emit(fmt, r, conv):
            out.append(row)
            if len(out) >= n:
                return out[:n]
    return out
