import os
import random
import json
import uuid

from flask import request, session, jsonify, redirect, url_for, render_template, send_file

from preference import pref_bp
from preference import (extract, active_learning, store, calibrate, dataset,
                        export as rm_export, conflicts as pref_conflicts)
from routes.api_routes import check_auth
from routes.review_routes import (get_chat_files_from_backup, parse_chat_backup_filename,
                                  analyze_chat_backup)
from utils.file_io import load_json, add_to_review_manifest, remove_from_review_manifest
from utils.session_keys import SK_USER, SK_GRADER_SETTING_NAME
from utils.session import get_grader_setting_name
from utils.grader_settings import get_grader_config, list_grader_settings
from utils.common import utc_now_iso
from config import LEDGER_FILE, DOWNLOADS_DIR


def _who():
    return session.get(SK_USER, "")


def _page_guard():
    return None if check_auth() else redirect(url_for('api.login'))


def _api_guard():
    return None if check_auth() else (jsonify({"error": "auth"}), 401)


def _allowed_backups():
    out = []
    for fn in get_chat_files_from_backup():
        _, ts = parse_chat_backup_filename(fn)
        out.append({"file": fn, "label": ts if ts != "Unknown time" else fn})
    return out


def _backup_meta(fn):
    data = load_json(os.path.join(DOWNLOADS_DIR, fn)) or {}
    sd = data.get("session_data", {}) or {}
    return {"file": fn, "grader_setting": sd.get("grader_setting_name", "default"),
            "weights": sd.get("current_weights"), "version": data.get("version", ""),
            "prompts": len(data.get("prompt_history", []) or []),
            "ledger_lines": len(data.get("ledger_entries", []) or [])}


def _first_prompt_from_data(data):
    for p in (data.get("prompt_history") or []):
        if isinstance(p, str) and p.strip():
            return p.strip()
    entries = data.get("ledger_entries") or []
    for e in entries:
        if isinstance(e, dict) and e.get("grade_tag") == "original" and e.get("prompt"):
            return str(e["prompt"]).strip()
    for e in entries:
        if isinstance(e, dict) and e.get("prompt"):
            return str(e["prompt"]).strip()
    return ""


def _backup_first_prompt(fn):
    return _first_prompt_from_data(load_json(os.path.join(DOWNLOADS_DIR, fn)) or {})


def _live_first_prompt():
    try:
        entries, _ = extract.load_ledger("live", "live_ledger")
    except Exception:
        return ""
    return extract._prompt_text(entries) or ""


PROMPT_PREVIEW_CHARS = 70


def _preview(text):
    t = (text or "").strip().replace("\n", " ")
    return t if len(t) <= PROMPT_PREVIEW_CHARS else (t[:PROMPT_PREVIEW_CHARS - 1].rstrip() + "…")


def _votes_for_source(votes, source):
    if source == "live":
        kind, ref = "live", "live_ledger"
    else:
        kind, ref = "backup", source
    return [v for v in votes if v.get("source_kind") == kind and v.get("source_ref") == ref]


def _selected_sources(args):
    raw = args.get("sources")
    items = raw.split(",") if raw else (args.getlist("source") if hasattr(args, "getlist") else [])
    items = [s.strip() for s in items if s and s.strip()]
    if not items:
        return [("live", "live_ledger")]
    allowed = {x["file"] for x in _allowed_backups()}
    out = []
    for s in items:
        if s == "live":
            out.append(("live", "live_ledger"))
        elif s in allowed:
            out.append(("backup", s))
    return out or [("live", "live_ledger")]


# ---------- pages ----------
@pref_bp.route('/arena')
def arena_page():
    return _page_guard() or render_template('studio.html', initial_tab='arena')


@pref_bp.route('/dataset')
def dataset_page():
    return _page_guard() or render_template('studio.html', initial_tab='dataset')


# ---------- file management: sources / metadata / analysis / manifest ----------
@pref_bp.route('/api/arena/sources')
def sources():
    g = _api_guard()
    if g:
        return g
    live_ok = os.path.exists(LEDGER_FILE) and os.path.getsize(LEDGER_FILE) > 0
    backups = []
    for b in _allowed_backups():
        prompts_data, first_prompt, gsn, _weights = analyze_chat_backup(b["file"])
        if not prompts_data:
            continue
        fp = first_prompt or _backup_first_prompt(b["file"])
        backups.append({"file": b["file"], "label": b["label"], "first_prompt": fp,
                        "prompt_preview": _preview(fp),
                        "grader_setting": gsn or "default"})
    live_fp = _live_first_prompt() if live_ok else ""
    return jsonify({"live": {"available": live_ok, "ephemeral": True,
                             "first_prompt": live_fp, "prompt_preview": _preview(live_fp)},
                    "backups": backups})


@pref_bp.route('/api/arena/source/meta')
def source_meta():
    g = _api_guard()
    if g:
        return g
    fn = request.args.get("file", "")
    if fn not in {x["file"] for x in _allowed_backups()}:
        return jsonify({"error": "invalid source_ref"}), 400
    return jsonify(_backup_meta(fn))


@pref_bp.route('/api/arena/source/analyze')
def source_analyze():
    g = _api_guard()
    if g:
        return g
    fn = request.args.get("file", "")
    if fn not in {x["file"] for x in _allowed_backups()}:
        return jsonify({"error": "invalid source_ref"}), 400
    prompts, first_prompt, grader_name, weights = analyze_chat_backup(fn)
    return jsonify({"file": fn, "grader_setting": grader_name, "weights": weights,
                    "first_prompt": first_prompt, "prompts": prompts})


@pref_bp.route('/api/arena/source/forget', methods=['POST'])
def source_forget():
    g = _api_guard()
    if g:
        return g
    fn = request.get_json(force=True).get("file", "")
    if not (fn.startswith("chat_backup_") and fn.endswith(".json")):
        return jsonify({"error": "invalid filename"}), 400
    remove_from_review_manifest(_who(), fn)
    return jsonify({"ok": True, "backups": _allowed_backups()})


@pref_bp.route('/api/arena/source/restore', methods=['POST'])
def source_restore():
    g = _api_guard()
    if g:
        return g
    fn = request.get_json(force=True).get("file", "")
    if not (fn.startswith("chat_backup_") and fn.endswith(".json")
            and os.path.exists(os.path.join(DOWNLOADS_DIR, fn))):
        return jsonify({"error": "invalid filename"}), 400
    add_to_review_manifest(_who(), fn)
    return jsonify({"ok": True, "backups": _allowed_backups()})


# ---------- conflicts report / grading-version selection / judgments overlay ----------
def _clean_versions(versions):
    return [{k: v for k, v in ver.items() if not k.startswith("_")} for ver in versions]


@pref_bp.route('/api/arena/source/conflicts')
def source_conflicts():
    g = _api_guard()
    if g:
        return g
    who = _who()
    source = request.args.get("source", "live")
    version_arg = request.args.get("version")
    chat_votes = _votes_for_source(store.iter_votes(who), source)
    versions = pref_conflicts.list_grading_versions(chat_votes)
    ckey = pref_conflicts.content_key(chat_votes)
    persisted = store.get_grading_selection(who, ckey)
    active = pref_conflicts.resolve_active(version_arg, versions, persisted)
    eff = pref_conflicts.effective_votes(chat_votes, active, versions)
    rows, summary = pref_conflicts.conflicts_for_votes(eff)
    return jsonify({"source": source, "source_key": ckey, "active_version": active,
                    "persisted_version": persisted, "versions": _clean_versions(versions),
                    "summary": summary, "conflicts": rows})


@pref_bp.route('/api/arena/source/grading_selection', methods=['POST'])
def source_grading_selection():
    g = _api_guard()
    if g:
        return g
    who = _who()
    b = request.get_json(force=True)
    source = b.get("source", "live")
    version_id = b.get("version_id", "original")
    chat_votes = _votes_for_source(store.iter_votes(who), source)
    versions = pref_conflicts.list_grading_versions(chat_votes)
    if version_id not in {v["version_id"] for v in versions}:
        return jsonify({"error": "invalid version"}), 400
    ckey = pref_conflicts.content_key(chat_votes)
    store.set_grading_selection(who, ckey, version_id)
    return jsonify({"ok": True, "active_version": version_id, "source_key": ckey})


@pref_bp.route('/api/arena/judgments')
def arena_judgments():
    g = _api_guard()
    if g:
        return g
    who = _who()
    groups = {}
    for v in store.iter_votes(who):
        groups.setdefault((v.get("source_kind"), v.get("source_ref")), []).append(v)
    items = {}
    for gv in groups.values():
        versions = pref_conflicts.list_grading_versions(gv)
        ckey = pref_conflicts.content_key(gv)
        persisted = store.get_grading_selection(who, ckey)
        active = pref_conflicts.resolve_active(None, versions, persisted)
        eff = pref_conflicts.effective_votes(gv, active, versions)
        rows, _ = pref_conflicts.conflicts_for_votes(eff)
        for r in rows:
            lh, rh = r["left"]["hash"] or "", r["right"]["hash"] or ""
            pair_key = "|".join(sorted([lh, rh]))
            user_pick_hash = lh if r["verdict"] == "left" else rh
            grader_pick_hash = (lh if r["grader_pick"] == "left"
                                else rh if r["grader_pick"] == "right" else None)
            items[pair_key] = {
                "prompt_text": r["prompt_text"], "prompt_number": r["prompt_number"],
                "left_hash": lh, "right_hash": rh,
                "user_pick_hash": user_pick_hash, "grader_pick_hash": grader_pick_hash,
                "is_conflict": r["is_conflict"], "active_version": active,
            }
    return jsonify({"items": list(items.values())})


# ---------- arena: scan / next / vote / refine ----------
@pref_bp.route('/api/arena/scan', methods=['POST'])
def scan():
    g = _api_guard()
    if g:
        return g
    b = request.get_json(force=True)
    kind = b.get("source_kind", "live")
    ref = "live_ledger" if kind == "live" else b.get("source_ref", "")
    if kind == "backup" and ref not in {x["file"] for x in _allowed_backups()}:
        return jsonify({"error": "invalid source_ref"}), 400
    pairs = extract.extract_pairs(kind, ref, b.get("pair_mode", "same_iter"), get_grader_setting_name())
    pairs = active_learning.score_all(pairs)
    store.rebuild_queue(_who(), pairs)
    return jsonify({"queued": len(pairs), **store.progress(_who())})


@pref_bp.route('/api/arena/next')
def nxt():
    g = _api_guard()
    if g:
        return g
    p = store.next_pair(_who())
    return jsonify(_view(p) if p else {"done": True})


@pref_bp.route('/api/arena/vote', methods=['POST'])
def vote():
    g = _api_guard()
    if g:
        return g
    b = request.get_json(force=True)
    p = store.pair_from_queue(_who(), b["pair_id"])
    if not p:
        return jsonify({"error": "unknown pair"}), 404
    swap = b.get("display_swap", False)
    store.upsert_vote(p, _unswap(b["verdict"], swap), _who(),
                      left_human=_unswap_scalar(b, swap, "left"),
                      right_human=_unswap_scalar(b, swap, "right"))
    nx = store.next_pair(_who())
    return jsonify({"ok": True, "next": _view(nx) if nx else {"done": True}})


@pref_bp.route('/api/arena/refine', methods=['POST'])
def refine():
    g = _api_guard()
    if g:
        return g
    b = request.get_json(force=True)
    p = store.pair_from_queue(_who(), b["pair_id"])
    if not p:
        return jsonify({"error": "unknown pair"}), 404
    store.set_gold(p, b.get("gold_text", "").strip(), _who())
    if b.get("blacklist_losers"):
        store.blacklist_add(_who(), p["left"]["text"], p["prompt_text"], "both_bad")
        store.blacklist_add(_who(), p["right"]["text"], p["prompt_text"], "both_bad")
    nx = store.next_pair(_who())
    return jsonify({"ok": True, "next": _view(nx) if nx else {"done": True}})


@pref_bp.route('/api/arena/role', methods=['POST'])
def role():
    g = _api_guard()
    if g:
        return g
    b = request.get_json(force=True)
    store.set_role(_who(), b["pair_id"], b["role"])
    return jsonify({"ok": True})


# ---------- calibration ----------
@pref_bp.route('/api/calibrate/report')
def cal_report():
    g = _api_guard()
    if g:
        return g
    name = get_grader_setting_name()
    cfg = get_grader_config(name)
    votes = store.iter_votes(_who())
    rep = calibrate.fitness_report(votes, cfg["weights"])
    return jsonify({"grader_setting": name, **rep, "settings": list_grader_settings()})


@pref_bp.route('/api/calibrate/refit', methods=['POST'])
def cal_refit():
    g = _api_guard()
    if g:
        return g
    name = get_grader_setting_name()
    cfg = get_grader_config(name)
    votes = store.iter_votes(_who())
    res = calibrate.refit_weights(votes, cfg["keys"])
    if res:
        store.save_calibration_run({"run_id": uuid.uuid4().hex, "annotator": _who(),
            "grader_setting": name, "weights_json": json.dumps(res["weights"]), "tier": "weights",
            "n_pairs": len([v for v in votes if v["verdict"] in ("left", "right")]),
            "pairwise_acc": res["pairwise_acc"], "cohen_kappa": res["cohen_kappa"],
            "spearman": None, "per_category": None,
            "suggested_weights": json.dumps(res["weights"]), "created_at": utc_now_iso()})
    return jsonify(res or {"error": "no decisive votes"})


@pref_bp.route('/api/calibrate/regrade', methods=['POST'])
def cal_regrade():
    g = _api_guard()
    if g:
        return g
    name = request.get_json(force=True).get("grader_setting") or get_grader_setting_name()
    session[SK_GRADER_SETTING_NAME] = name
    cfg = get_grader_config(name)
    votes = store.iter_votes(_who())
    if not [v for v in votes if v["verdict"] in ("left", "right")]:
        return jsonify({"error": "no decisive votes"})
    run_id = uuid.uuid4().hex
    regraded = calibrate.regrade_calibration_set(votes, name, run_id)
    rep = calibrate.fitness_report(calibrate.apply_regrade(votes, regraded), cfg["weights"])
    store.save_calibration_run({
        "run_id": run_id, "annotator": _who(),
        "grader_setting": name, "weights_json": json.dumps(cfg["weights"]),
        "tier": "full_regrade", "n_pairs": rep["n_pairs"],
        "pairwise_acc": rep["pairwise_acc"], "cohen_kappa": rep["cohen_kappa"],
        "spearman": rep["spearman"], "per_category": json.dumps(rep["per_category"]),
        "suggested_weights": None, "created_at": utc_now_iso()})
    return jsonify({"grader_setting": name, **rep})


@pref_bp.route('/api/calibrate/history')
def cal_history():
    return _api_guard() or jsonify(store.list_calibration_runs(_who()))


# ---------- dataset / export ----------
@pref_bp.route('/api/dataset/build')
def ds_build():
    g = _api_guard()
    if g:
        return g
    name = get_grader_setting_name()
    cfg = get_grader_config(name)
    return jsonify(dataset.build_pools(_who(), store, cfg, _selected_sources(request.args)))


@pref_bp.route('/api/dataset/examples')
def ds_examples():
    g = _api_guard()
    if g:
        return g
    name = get_grader_setting_name()
    cfg = get_grader_config(name)
    return jsonify(dataset.build_examples(_who(), store, cfg, _selected_sources(request.args)))


@pref_bp.route('/api/dataset/send_to_arena', methods=['POST'])
def ds_send_to_arena():
    g = _api_guard()
    if g:
        return g
    ids = set(request.get_json(force=True).get("pair_ids", []))
    store.requeue_pairs(_who(), ids)
    return jsonify({"requeued": len(ids), **store.progress(_who())})


@pref_bp.route('/api/dataset/export')
def ds_export():
    g = _api_guard()
    if g:
        return g
    return send_file(rm_export.write_export(_who(), request.args, _selected_sources(request.args)),
                     as_attachment=True)


@pref_bp.route('/api/dataset/export/preview')
def ds_preview():
    g = _api_guard()
    if g:
        return g
    return jsonify(rm_export.preview(_who(), request.args, _selected_sources(request.args),
                                     int(request.args.get("n", 10))))


# ---------- presentation helpers ----------
def _meta(s):
    return {"model": s["model"], "overall": s["overall"], "grades": s["grades"],
            "tag": s["tag"], "iteration": s["iteration"]}


def _view(pair):
    swap = bool(random.getrandbits(1))
    L, R = (pair["right"], pair["left"]) if swap else (pair["left"], pair["right"])
    return {"pair_id": pair["pair_id"], "prompt": pair["prompt_text"],
            "left_text": L["text"], "right_text": R["text"], "display_swap": swap, "blind": True,
            "reveal": {"left": _meta(L), "right": _meta(R), "disagreement": pair.get("disagreement")},
            "progress": store.progress(_who())}


def _unswap(verdict, swap):
    if not swap or verdict in ("tie", "both_bad"):
        return verdict
    return "right" if verdict == "left" else "left"


def _unswap_scalar(b, swap, canonical_side):
    disp = canonical_side if not swap else ("right" if canonical_side == "left" else "left")
    return b.get(f"{disp}_human")
