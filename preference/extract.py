import os
import json
import hashlib

from config import LEDGER_FILE, DOWNLOADS_DIR, ARENA_CROSS_MIN_GAP, ARENA_CROSS_MAX_PER_PROMPT
from utils.file_io import load_json
from utils.common import ERROR_PREFIXES


def load_ledger(source_kind, source_ref):
    if source_kind == "live":
        return _read_jsonl(LEDGER_FILE), {}
    data = load_json(os.path.join(DOWNLOADS_DIR, source_ref)) or {}
    return data.get("ledger_entries", []), (data.get("session_data") or {})


def _read_jsonl(path):
    out = []
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return out


def _sha(s):
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def _usable(e):
    r = e.get("layer1_reply", "")
    return bool(r) and not str(r).startswith(ERROR_PREFIXES)


def _layer3(entries):
    return [e for e in entries if e.get("layer") == "Layer3" and _usable(e)]


def _side(e):
    t = e["layer1_reply"]
    return {"text": t, "hash": _sha(t.strip()), "tag": e.get("grade_tag", "?"),
            "iteration": int(e.get("iteration", 0) or 0), "model": e.get("model_used", "?"),
            "overall": float(e.get("overall_score", 0) or 0), "grades": e.get("grade", {}) or {}}


def _prompt_text(entries_for_pn):
    for e in entries_for_pn:
        if e.get("grade_tag") == "original" and e.get("prompt"):
            return str(e["prompt"])
    for e in entries_for_pn:
        if e.get("prompt"):
            return str(e["prompt"])
    return ""


def make_pair_id(source_ref, pn, L, R):
    sig = f"{source_ref}|{pn}|{L['iteration']}:{L['tag']}|{R['iteration']}:{R['tag']}|" \
          f"{L['hash'][:12]}|{R['hash'][:12]}"
    return _sha(sig)[:16]


def _assemble(sk, sr, mode, pn, ptext, gs, L, R):
    return {"pair_id": make_pair_id(sr, pn, L, R), "source_kind": sk, "source_ref": sr,
            "pair_mode": mode, "prompt_number": pn, "prompt_text": ptext,
            "grader_setting": gs, "left": L, "right": R}


def _dedupe_by_text(entries):
    best = {}
    for e in entries:
        t = e.get("layer1_reply", "").strip()
        if t and (t not in best or _side(e)["overall"] > _side(best[t])["overall"]):
            best[t] = e
    return list(best.values())


def extract_same_iter(entries, sk, sr, gs):
    pairs, groups, by_pn = [], {}, {}
    for e in _layer3(entries):
        groups.setdefault((e["prompt_number"], e.get("iteration", 0)), {})[e.get("grade_tag")] = e
        by_pn.setdefault(e["prompt_number"], []).append(e)
    for (pn, _it), tags in groups.items():
        o, im = tags.get("original"), tags.get("improved")
        if not (o and im):
            continue
        if o["layer1_reply"].strip() == im["layer1_reply"].strip():
            continue
        pairs.append(_assemble(sk, sr, "same_iter", pn, _prompt_text(by_pn[pn]), gs, _side(o), _side(im)))
    return pairs


def extract_cross_iter(entries, sk, sr, gs):
    pairs, by_pn = [], {}
    for e in _layer3(entries):
        by_pn.setdefault(e["prompt_number"], []).append(e)
    for pn, raw in by_pn.items():
        uniq = _dedupe_by_text(raw)
        if len(uniq) < 2:
            continue
        anchor = max(uniq, key=lambda e: _side(e)["overall"])
        a = _side(anchor)
        a["tag"] = "best"
        cands = [e for e in uniq if e is not anchor]
        ranked = sorted(((abs(a["overall"] - _side(e)["overall"]), e) for e in cands), key=lambda t: t[0])
        picked = [e for gap, e in ranked if gap >= ARENA_CROSS_MIN_GAP][:ARENA_CROSS_MAX_PER_PROMPT]
        for e in picked:
            pairs.append(_assemble(sk, sr, "cross_iter", pn, _prompt_text(raw), gs, dict(a), _side(e)))
    return pairs


def extract_pairs(source_kind, source_ref, pair_mode, grader_setting):
    entries, sdata = load_ledger(source_kind, source_ref)
    if source_kind == "backup":
        grader_setting = sdata.get("grader_setting_name", grader_setting)
    out = []
    if pair_mode in ("same_iter", "both"):
        out += extract_same_iter(entries, source_kind, source_ref, grader_setting)
    if pair_mode in ("cross_iter", "both"):
        out += extract_cross_iter(entries, source_kind, source_ref, grader_setting)
    return list({p["pair_id"]: p for p in out}.values())
