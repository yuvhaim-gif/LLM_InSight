import os
import json
import itertools

from ai.layer3 import _grade_single_category
from utils.common import compute_score, utc_now_iso, normalize_score
from utils.grader_settings import get_grader_config
from utils.file_io import save_json
from config import PREFERENCE_REGRADE_DIR


# ----------------------------- 11.1 metrics (pure) -----------------------------
def _decisive(votes):
    return [v for v in votes if v["verdict"] in ("left", "right")]


def _grader_pick(v, weights=None):
    lo = compute_score(json.loads(v["left_grades"]), weights) if weights else v["left_overall"]
    ro = compute_score(json.loads(v["right_grades"]), weights) if weights else v["right_overall"]
    if lo == ro:
        return "tie"
    return "left" if lo > ro else "right"


def pairwise_accuracy(votes, weights=None):
    d = _decisive(votes)
    if not d:
        return None, 0
    hits = sum(1 for v in d if _grader_pick(v, weights) == v["verdict"])
    return hits / len(d), len(d)


def cohen_kappa(votes, weights=None):
    d = _decisive(votes)
    if not d:
        return None
    g = [_grader_pick(v, weights) for v in d]
    h = [v["verdict"] for v in d]
    po = sum(1 for a, b in zip(g, h) if a == b) / len(d)

    def pc(lbl):
        return (g.count(lbl) / len(d)) * (h.count(lbl) / len(d))
    pe = pc("left") + pc("right")
    return (po - pe) / (1 - pe) if pe < 1 else 1.0


def spearman_scalar(votes, weights=None):
    xs, ys = [], []
    for v in votes:
        for side in ("left", "right"):
            hv = v.get(f"{side}_human")
            if hv is None:
                continue
            gv = compute_score(json.loads(v[f"{side}_grades"]), weights) if weights else v[f"{side}_overall"]
            xs.append(hv)
            ys.append(gv)
    if len(xs) < 3:
        return None

    def _avg_ranks(a):
        order = sorted(range(len(a)), key=lambda i: a[i])
        r = [0.0] * len(a)
        i = 0
        while i < len(a):
            j = i
            while j + 1 < len(a) and a[order[j + 1]] == a[order[i]]:
                j += 1
            avg = (i + j) / 2.0
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx, ry = _avg_ranks(xs), _avg_ranks(ys)
    n = len(xs)
    mx, my = sum(rx) / n, sum(ry) / n
    cov = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    vx = sum((rx[i] - mx) ** 2 for i in range(n))
    vy = sum((ry[i] - my) ** 2 for i in range(n))
    if vx <= 0 or vy <= 0:
        return None
    return round(cov / (vx * vy) ** 0.5, 4)


def per_category_alignment(votes):
    d = _decisive(votes)
    out = {}
    keys = set()
    for v in d:
        keys |= set(json.loads(v["left_grades"])) | set(json.loads(v["right_grades"]))
    for k in keys:
        hit = tot = 0
        for v in d:
            lg, rg = json.loads(v["left_grades"]), json.loads(v["right_grades"])
            if k not in lg or k not in rg or lg[k] == rg[k]:
                continue
            pick = "left" if lg[k] > rg[k] else "right"
            tot += 1
            if pick == v["verdict"]:
                hit += 1
        out[k] = round(hit / tot, 3) if tot else None
    return out


# ----------------------- 11.2 instant weight re-fit (Tier A) -----------------------
def _candidate_simplex(keys, grid, max_combos=10000):
    n = len(keys)
    if n == 0:
        return
    if n <= 5:
        seen = 0
        for combo in itertools.product(grid, repeat=n):
            if sum(combo) <= 0:
                continue
            seen += 1
            if seen > max_combos:
                break
            yield {k: float(w) for k, w in zip(keys, combo)}
    else:
        base = {k: 1.0 for k in keys}
        yield dict(base)
        for k in keys:
            for w in grid:
                cand = dict(base)
                cand[k] = float(w)
                if sum(cand.values()) > 0:
                    yield cand


def refit_weights(votes, keys, grid=(0.0, 0.1, 0.2, 0.3, 0.4, 0.5)):
    best = None
    for w in _candidate_simplex(keys, grid):
        acc, n = pairwise_accuracy(votes, w)
        if acc is None:
            continue
        k = cohen_kappa(votes, w)
        score = (acc, k or 0)
        if best is None or score > best[0]:
            best = (score, w)
    return None if best is None else {"weights": best[1],
                                      "pairwise_acc": best[0][0], "cohen_kappa": best[0][1]}


# ----------------------- 11.3 full re-grade (Tier B) -----------------------
def _regrade_one_answer(prompt_text, answer_text, cfg, max_retries=3):
    grade = {}
    full_prompt = f"[Prompt]: {prompt_text}"
    for cat in cfg["keys"]:
        res = _grade_single_category(cat, cfg["grader_models"].get(cat, ""),
                                     full_prompt, answer_text, max_retries,
                                     cfg["rubrics"].get(cat))
        grade[cat] = normalize_score(res.get("score", 50))
    return {"grade": grade, "overall": compute_score(grade, cfg["weights"])}


def regrade_calibration_set(votes, grader_setting_name, run_id=None):
    cfg = get_grader_config(grader_setting_name)
    by_hash, sources = {}, {}
    for v in votes:
        for side in ("left", "right"):
            h, txt = v[f"{side}_hash"], v[f"{side}_text"]
            if not txt or h in by_hash:
                continue
            by_hash[h] = _regrade_one_answer(v["prompt_text"], txt, cfg)
            sources[h] = {"source_kind": v["source_kind"], "source_ref": v["source_ref"],
                          "prompt_text": v["prompt_text"], "original_overall": v[f"{side}_overall"]}
    _write_regrade_artifact(grader_setting_name, cfg, by_hash, sources, run_id)
    return by_hash


def _write_regrade_artifact(name, cfg, by_hash, sources, run_id=None):
    os.makedirs(PREFERENCE_REGRADE_DIR, exist_ok=True)
    now = utc_now_iso()
    origins = {}
    for h, s in sources.items():
        key = f"{s['source_kind']}:{s['source_ref']}"
        origins.setdefault(key, {"source_kind": s["source_kind"], "source_ref": s["source_ref"],
                                 "first_seen": now, "prompts": []})
        if s["prompt_text"] not in origins[key]["prompts"]:
            origins[key]["prompts"].append(s["prompt_text"])
    artifact = {
        "run_id": run_id,
        "answer_hashes": list(by_hash.keys()),
        "origins": list(origins.values()),
        "grader_setting": name, "weights": cfg["weights"], "keys": cfg["keys"],
        "created_at": now,
        "versions": [{"answer_hash": h, **by_hash[h],
                      "original_overall": sources[h]["original_overall"],
                      "prompt_text": sources[h]["prompt_text"]} for h in by_hash],
    }
    ts = now.replace(":", "-")
    save_json(artifact, os.path.join(PREFERENCE_REGRADE_DIR, f"regrade_{name}_{ts}.json"))


def apply_regrade(votes, regraded):
    out = []
    for v in votes:
        v = dict(v)
        for side in ("left", "right"):
            r = regraded.get(v[f"{side}_hash"])
            if r:
                v[f"{side}_grades"] = json.dumps(r["grade"])
                v[f"{side}_overall"] = r["overall"]
        out.append(v)
    return out


# ----------------------- 11.4 fitness report -----------------------
def fitness_report(votes, weights=None):
    acc, n = pairwise_accuracy(votes, weights)
    return {"n_pairs": n,
            "pairwise_acc": acc,
            "cohen_kappa": cohen_kappa(votes, weights),
            "spearman": spearman_scalar(votes, weights),
            "per_category": per_category_alignment(votes),
            "weights_used": weights}
