import json
import hashlib

from config import (DATASET_AUTO_MIN_MARGIN, DATASET_AUTO_MIN_CONF, DATASET_MAX_PER_PROMPT,
                    JUDGE_PASS_GRADE, JUDGE_FAIL_GRADE)
from preference import extract, calibrate


def _sha(s):
    return hashlib.sha1(s.strip().encode("utf-8")).hexdigest()


# ----------------------- 15.2 statistical highlighting -----------------------
def confidence(margin, cat_agree, kappa):
    m = min(margin / 50.0, 1.0)
    return round(0.5 * m + 0.3 * cat_agree + 0.2 * max(kappa or 0, 0), 3)


# ----------------------- 15.3 pool assembly (pure) -----------------------
def build_pools(annotator, store, cfg, sources=None):
    sources = sources or [("live", "live_ledger")]
    votes = store.iter_votes(annotator)
    bl = store.blacklist_hashes(annotator)
    kappa = calibrate.cohen_kappa(votes, cfg["weights"])
    gold, auto, review = [], [], []

    for v in votes:
        if v.get("role") == "exclude":
            continue
        if v["verdict"] in ("left", "right"):
            win, lose = (("left", "right") if v["verdict"] == "left" else ("right", "left"))
            gold.append(_record(v["prompt_text"], v[f"{win}_text"], v[f"{lose}_text"],
                                source="human", conf=1.0, band="GOLD", pair_id=v["pair_id"]))
        if v["verdict"] == "both_bad" and v.get("gold_text"):
            gold.append(_record(v["prompt_text"], v["gold_text"], v["left_text"],
                                source="gold", conf=1.0, band="GOLD", pair_id=v["pair_id"] + "_L"))
            gold.append(_record(v["prompt_text"], v["gold_text"], v["right_text"],
                                source="gold", conf=1.0, band="GOLD", pair_id=v["pair_id"] + "_R"))

    judged_ids = {v["pair_id"] for v in votes}

    for pair in _candidate_pairs_from_sources(cfg, sources):
        if pair["pair_id"] in judged_ids:
            continue
        L, R = pair["left"], pair["right"]
        margin = abs(L["overall"] - R["overall"])
        if margin < DATASET_AUTO_MIN_MARGIN:
            review.append(_as_review(pair))
            continue
        win, lose = (L, R) if L["overall"] >= R["overall"] else (R, L)
        if _sha(win["text"]) in bl:
            continue
        cat_agree = _winner_cat_share(win, lose)
        conf = confidence(margin, cat_agree, kappa)
        rec = _record(pair["prompt_text"], win["text"], lose["text"],
                      source="auto", conf=conf,
                      band=("AUTO+" if conf >= DATASET_AUTO_MIN_CONF else "REVIEW"),
                      pair_id=pair["pair_id"])
        (auto if rec["band"] == "AUTO+" else review).append(rec)

    auto = _cap_per_prompt(_dedup(auto), DATASET_MAX_PER_PROMPT)
    return {"gold": gold, "auto": auto, "review": review,
            "blacklist_count": len(bl), "kappa": kappa,
            "counts": {"gold": len(gold), "auto": len(auto), "review": len(review)}}


def _record(prompt, chosen, rejected, source, conf, band, pair_id):
    return {"pair_id": pair_id, "prompt": prompt, "chosen": chosen, "rejected": rejected,
            "source": source, "confidence": conf, "band": band}


def _winner_cat_share(win, lose):
    wg, lg = win.get("grades") or {}, lose.get("grades") or {}
    shared = [k for k in wg if k in lg and wg[k] != lg[k]]
    if not shared:
        return 0.0
    return round(sum(1 for k in shared if wg[k] > lg[k]) / len(shared), 3)


def _dedup(records):
    best = {}
    for r in records:
        key = (_sha(r["chosen"]), _sha(r["rejected"]))
        if key not in best or r["confidence"] > best[key]["confidence"]:
            best[key] = r
    return list(best.values())


def _cap_per_prompt(records, cap):
    by_prompt, out = {}, []
    for r in sorted(records, key=lambda x: x["confidence"], reverse=True):
        n = by_prompt.get(r["prompt"], 0)
        if n >= cap:
            continue
        by_prompt[r["prompt"]] = n + 1
        out.append(r)
    return out


def _as_review(pair):
    L, R = pair["left"], pair["right"]
    win, lose = (L, R) if L["overall"] >= R["overall"] else (R, L)
    return _record(pair["prompt_text"], win["text"], lose["text"],
                   source="auto", conf=0.0, band="REVIEW", pair_id=pair["pair_id"])


def _candidate_pairs_from_sources(cfg, sources):
    name = cfg.get("name", "")
    out = []
    for source_kind, source_ref in (sources or [("live", "live_ledger")]):
        out += extract.extract_pairs(source_kind, source_ref, "both", name)
    return list({p["pair_id"]: p for p in out}.values())


# ----------------------- 15.4 per-answer PASS/FAIL examples -----------------------
_SRC_RANK = {"blacklist": 3, "human": 3, "gold": 3, "auto": 1}


def build_examples(annotator, store, cfg, sources=None):
    sources = sources or [("live", "live_ledger")]
    votes = store.iter_votes(annotator)
    bl = store.blacklist_hashes(annotator)
    kappa = calibrate.cohen_kappa(votes, cfg["weights"])
    seen = {}

    def put(prompt, answer, label, source, conf, band, pid):
        if not answer or not str(answer).strip():
            return
        h = _sha(answer)
        if h in bl:
            label, source, conf, band = False, "blacklist", 1.0, "GOLD"
        ex = {"pair_id": pid, "prompt": prompt, "answer": answer, "label": bool(label),
              "source": source, "confidence": conf, "band": band, "answer_hash": h}
        prev = seen.get(h)
        if prev is None:
            seen[h] = ex
            return
        if (_SRC_RANK[source] > _SRC_RANK[prev["source"]] or
                (_SRC_RANK[source] == _SRC_RANK[prev["source"]] and prev["label"] and not ex["label"])):
            seen[h] = ex

    for v in votes:
        if v.get("role") == "exclude":
            continue
        if v["verdict"] in ("left", "right"):
            win, lose = (("left", "right") if v["verdict"] == "left" else ("right", "left"))
            put(v["prompt_text"], v[f"{win}_text"], True, "human", 1.0, "GOLD", v["pair_id"])
            put(v["prompt_text"], v[f"{lose}_text"], False, "human", 1.0, "GOLD", v["pair_id"])
        if v["verdict"] == "both_bad":
            put(v["prompt_text"], v["left_text"], False, "human", 1.0, "GOLD", v["pair_id"])
            put(v["prompt_text"], v["right_text"], False, "human", 1.0, "GOLD", v["pair_id"])
            if v.get("gold_text"):
                put(v["prompt_text"], v["gold_text"], True, "gold", 1.0, "GOLD", v["pair_id"])

    for r in store.blacklist_rows(annotator):
        put(r.get("prompt_text") or "", r["answer_text"], False, "blacklist", 1.0, "GOLD",
            "bl_" + r["answer_hash"][:12])

    for pair in _candidate_pairs_from_sources(cfg, sources):
        for side in ("left", "right"):
            s = pair[side]
            ov = s["overall"]
            if ov >= JUDGE_PASS_GRADE:
                lbl = True
            elif ov < JUDGE_FAIL_GRADE:
                lbl = False
            else:
                continue
            conf = _grade_confidence(ov, kappa)
            if conf < DATASET_AUTO_MIN_CONF:
                continue
            put(pair["prompt_text"], s["text"], lbl, "auto", conf, "AUTO+",
                pair["pair_id"] + "_" + side)

    examples = list(seen.values())
    npass = sum(1 for e in examples if e["label"])
    return {"examples": examples, "kappa": kappa,
            "counts": {"pass": npass, "fail": len(examples) - npass, "total": len(examples)}}


def _grade_confidence(overall, kappa):
    m = min(abs(overall - 50) / 50.0, 1.0)
    return round(0.7 * m + 0.3 * max(kappa or 0, 0), 3)
