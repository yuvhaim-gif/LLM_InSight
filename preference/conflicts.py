import os
import json
import hashlib

from config import PREFERENCE_REGRADE_DIR
from utils.file_io import load_json
from utils.common import compute_score
from preference import calibrate


def _chat_hashes(votes):
    hs = set()
    for v in votes:
        if v.get("left_hash"):
            hs.add(v["left_hash"])
        if v.get("right_hash"):
            hs.add(v["right_hash"])
    return hs


def content_key(votes):
    hs = _chat_hashes(votes)
    if not hs:
        return "empty"
    return hashlib.sha1(",".join(sorted(hs)).encode("utf-8")).hexdigest()[:16]


def _load_artifacts():
    out = []
    d = PREFERENCE_REGRADE_DIR
    if not os.path.isdir(d):
        return out
    for fn in os.listdir(d):
        if fn.startswith("regrade_") and fn.endswith(".json"):
            data = load_json(os.path.join(d, fn))
            if isinstance(data, dict):
                data["_file"] = fn
                out.append(data)
    return out


def _artifact_version_id(a):
    return a.get("run_id") or ("file:" + a.get("_file", ""))


def _artifact_hashes(a):
    hs = a.get("answer_hashes")
    if hs:
        return set(hs)
    return {ver.get("answer_hash") for ver in a.get("versions", []) if ver.get("answer_hash")}


def list_grading_versions(votes):
    chat_hashes = _chat_hashes(votes)
    grader = votes[0].get("grader_setting", "default") if votes else "default"
    versions = [{"version_id": "original", "label": "Original grading",
                 "created_at": None, "grader_setting": grader, "is_last": False}]
    runs = []
    for a in _load_artifacts():
        if chat_hashes and (_artifact_hashes(a) & chat_hashes):
            runs.append({"version_id": _artifact_version_id(a),
                         "label": "%s · %s" % (a.get("grader_setting", "?"), a.get("created_at", "")),
                         "created_at": a.get("created_at", ""),
                         "grader_setting": a.get("grader_setting", "default"),
                         "_file": a.get("_file"), "is_last": False})
    runs.sort(key=lambda r: r.get("created_at") or "")
    for i, r in enumerate(runs):
        r["label"] = "Run %d · %s" % (i + 1, r["label"])
    versions += runs
    if len(versions) > 1:
        versions[-1]["is_last"] = True
    return versions


def _by_hash_for_version(version_id, versions):
    for v in versions:
        if v.get("version_id") == version_id and v.get("_file"):
            a = load_json(os.path.join(PREFERENCE_REGRADE_DIR, v["_file"])) or {}
            return {ver["answer_hash"]: {"grade": ver.get("grade", {}), "overall": ver.get("overall")}
                    for ver in a.get("versions", [])
                    if ver.get("answer_hash") and ver.get("grade") is not None}
    return None


def resolve_active(version_arg, versions, persisted):
    ids = [v["version_id"] for v in versions]
    if version_arg and version_arg in ids:
        return version_arg
    if persisted and persisted in ids:
        return persisted
    if len(versions) > 1:
        return versions[-1]["version_id"]
    return "original"


def effective_votes(chat_votes, active_version, versions):
    if active_version == "original":
        return chat_votes
    by_hash = _by_hash_for_version(active_version, versions)
    if not by_hash:
        return chat_votes
    return calibrate.apply_regrade(chat_votes, by_hash)


def _parse_grades(raw):
    try:
        return json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        return {}


def _side_overall(v, side, weights):
    if weights:
        try:
            return compute_score(_parse_grades(v.get("%s_grades" % side)), weights)
        except (ValueError, TypeError):
            return v.get("%s_overall" % side)
    return v.get("%s_overall" % side)


def _status(pick, verdict):
    if pick == "tie":
        return "tie"
    return "agree" if pick == verdict else "contradict"


def _attr_diffs(lg, rg):
    out = []
    for k in sorted(set(lg) & set(rg)):
        l, r = lg.get(k), rg.get(k)
        if l is None or r is None:
            continue
        favors = "tie" if l == r else ("left" if l > r else "right")
        out.append({"key": k, "left": l, "right": r, "favors": favors})
    return out


_STATUS_ORDER = {"contradict": 0, "tie": 1, "agree": 2}


def conflicts_for_votes(votes, weights=None):
    rows = []
    for v in votes:
        if v.get("verdict") not in ("left", "right"):
            continue
        pick = calibrate._grader_pick(v, weights)
        lg = _parse_grades(v.get("left_grades"))
        rg = _parse_grades(v.get("right_grades"))
        lo = _side_overall(v, "left", weights)
        ro = _side_overall(v, "right", weights)
        margin = abs(lo - ro) if lo is not None and ro is not None else None
        status = _status(pick, v["verdict"])
        rows.append({
            "pair_id": v.get("pair_id"),
            "prompt_text": v.get("prompt_text", ""),
            "prompt_number": v.get("prompt_number"),
            "pair_mode": v.get("pair_mode"),
            "verdict": v["verdict"],
            "grader_pick": pick,
            "is_conflict": pick != v["verdict"],
            "status": status,
            "margin": margin,
            "attr_diffs": _attr_diffs(lg, rg),
            "left": {"text": v.get("left_text", ""), "grades": lg,
                     "overall": lo, "model": v.get("left_model"),
                     "tag": v.get("left_tag"), "hash": v.get("left_hash"),
                     "iteration": v.get("prompt_number")},
            "right": {"text": v.get("right_text", ""), "grades": rg,
                      "overall": ro, "model": v.get("right_model"),
                      "tag": v.get("right_tag"), "hash": v.get("right_hash"),
                      "iteration": v.get("prompt_number")},
            "gold_text": v.get("gold_text"),
            "role": v.get("role"),
        })
    rows.sort(key=lambda r: (_STATUS_ORDER[r["status"]], -(r["margin"] or 0)))
    acc, n = calibrate.pairwise_accuracy(votes, weights)
    summary = {"n_decisive": n,
               "n_agree": sum(1 for r in rows if r["status"] == "agree"),
               "n_tie": sum(1 for r in rows if r["status"] == "tie"),
               "n_contradict": sum(1 for r in rows if r["status"] == "contradict"),
               "n_conflicts": sum(1 for r in rows if r["is_conflict"]),
               "pairwise_acc": acc,
               "cohen_kappa": calibrate.cohen_kappa(votes, weights)}
    return rows, summary
