import os
import sqlite3
import threading
import json
import hashlib

from config import PREFERENCES_DB
from utils.common import utc_now_iso

_pref_lock = threading.Lock()

_DDL = """
CREATE TABLE IF NOT EXISTS preferences (
    pair_id        TEXT NOT NULL,
    annotator      TEXT NOT NULL,
    source_kind    TEXT NOT NULL,
    source_ref     TEXT NOT NULL,
    pair_mode      TEXT NOT NULL,
    prompt_number  INTEGER,
    prompt_text    TEXT NOT NULL,
    left_text      TEXT NOT NULL,  right_text   TEXT NOT NULL,
    left_hash      TEXT NOT NULL,  right_hash   TEXT NOT NULL,
    left_tag       TEXT,           right_tag    TEXT,
    left_model     TEXT,           right_model  TEXT,
    left_overall   REAL,           right_overall REAL,
    left_grades    TEXT,           right_grades  TEXT,
    left_human     REAL,           right_human   REAL,
    grader_setting TEXT,
    verdict        TEXT NOT NULL,
    gold_text      TEXT,
    role           TEXT NOT NULL DEFAULT 'auto',
    disagreement   REAL,
    created_at     TEXT NOT NULL,  updated_at TEXT NOT NULL,
    PRIMARY KEY (pair_id, annotator)
);

CREATE TABLE IF NOT EXISTS queue_cache (
    pair_id      TEXT NOT NULL,
    annotator    TEXT NOT NULL,
    payload      TEXT NOT NULL,
    disagreement REAL NOT NULL,
    annotated    INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (pair_id, annotator)
);
CREATE INDEX IF NOT EXISTS idx_queue_order ON queue_cache(annotator, annotated, disagreement);

CREATE TABLE IF NOT EXISTS blacklist (
    answer_hash  TEXT NOT NULL,
    annotator    TEXT NOT NULL,
    answer_text  TEXT NOT NULL,
    prompt_text  TEXT,
    reason       TEXT,
    created_at   TEXT NOT NULL,
    PRIMARY KEY (answer_hash, annotator)
);

CREATE TABLE IF NOT EXISTS calibration_runs (
    run_id         TEXT PRIMARY KEY,
    annotator      TEXT NOT NULL,
    grader_setting TEXT NOT NULL,
    weights_json   TEXT NOT NULL,
    tier           TEXT NOT NULL,
    n_pairs        INTEGER NOT NULL,
    pairwise_acc   REAL,
    cohen_kappa    REAL,
    spearman       REAL,
    per_category   TEXT,
    suggested_weights TEXT,
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grading_selection (
    annotator   TEXT NOT NULL,
    source_key  TEXT NOT NULL,
    version_id  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (annotator, source_key)
);
"""


def _conn():
    os.makedirs(os.path.dirname(PREFERENCES_DB), exist_ok=True)
    c = sqlite3.connect(PREFERENCES_DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init_pref_db():
    with _pref_lock:
        c = _conn()
        try:
            c.executescript(_DDL)
            c.commit()
        finally:
            c.close()


# ---- queue ----
def rebuild_queue(annotator, scored_pairs):
    with _pref_lock:
        c = _conn()
        now = utc_now_iso()
        try:
            voted = {r["pair_id"] for r in
                     c.execute("SELECT pair_id FROM preferences WHERE annotator=?", (annotator,))}
            c.execute("DELETE FROM queue_cache WHERE annotator=?", (annotator,))
            c.executemany(
                "INSERT INTO queue_cache(pair_id,annotator,payload,disagreement,annotated,updated_at)"
                " VALUES (?,?,?,?,?,?)",
                [(p["pair_id"], annotator, json.dumps(p, ensure_ascii=False),
                  p.get("disagreement", 0.0), 1 if p["pair_id"] in voted else 0, now)
                 for p in scored_pairs])
            c.commit()
        finally:
            c.close()


def next_pair(annotator):
    with _pref_lock:
        c = _conn()
        try:
            row = c.execute("SELECT payload FROM queue_cache WHERE annotator=? AND annotated=0"
                            " ORDER BY disagreement DESC, RANDOM() LIMIT 1", (annotator,)).fetchone()
            return json.loads(row["payload"]) if row else None
        finally:
            c.close()


def pair_from_queue(annotator, pair_id):
    with _pref_lock:
        c = _conn()
        try:
            row = c.execute("SELECT payload FROM queue_cache WHERE annotator=? AND pair_id=?",
                            (annotator, pair_id)).fetchone()
            return json.loads(row["payload"]) if row else None
        finally:
            c.close()


def requeue_pairs(annotator, pair_ids):
    if not pair_ids:
        return
    with _pref_lock:
        c = _conn()
        now = utc_now_iso()
        try:
            c.executemany("UPDATE queue_cache SET annotated=0, updated_at=? "
                          "WHERE annotator=? AND pair_id=?",
                          [(now, annotator, pid) for pid in pair_ids])
            c.commit()
        finally:
            c.close()


# ---- judgments ----
def upsert_vote(pair, verdict, annotator, left_human=None, right_human=None, role=None):
    with _pref_lock:
        c = _conn()
        now = utc_now_iso()
        try:
            c.execute("""INSERT INTO preferences
              (pair_id,annotator,source_kind,source_ref,pair_mode,prompt_number,prompt_text,
               left_text,right_text,left_hash,right_hash,left_tag,right_tag,left_model,right_model,
               left_overall,right_overall,left_grades,right_grades,left_human,right_human,
               grader_setting,verdict,role,disagreement,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(pair_id,annotator) DO UPDATE SET
               verdict=excluded.verdict,
               left_human=COALESCE(excluded.left_human, preferences.left_human),
               right_human=COALESCE(excluded.right_human, preferences.right_human),
               role=CASE WHEN excluded.role='auto' THEN preferences.role ELSE excluded.role END,
               updated_at=excluded.updated_at""",
              (pair["pair_id"], annotator, pair["source_kind"], pair["source_ref"], pair["pair_mode"],
               pair["prompt_number"], pair["prompt_text"],
               pair["left"]["text"], pair["right"]["text"], pair["left"]["hash"], pair["right"]["hash"],
               pair["left"]["tag"], pair["right"]["tag"], pair["left"]["model"], pair["right"]["model"],
               pair["left"]["overall"], pair["right"]["overall"],
               json.dumps(pair["left"]["grades"]), json.dumps(pair["right"]["grades"]),
               left_human, right_human, pair["grader_setting"], verdict, role or "auto",
               pair.get("disagreement"), now, now))
            c.execute("UPDATE queue_cache SET annotated=1, updated_at=? WHERE pair_id=? AND annotator=?",
                      (now, pair["pair_id"], annotator))
            c.commit()
        finally:
            c.close()


def set_gold(pair, gold_text, annotator):
    upsert_vote(pair, "both_bad", annotator)
    with _pref_lock:
        c = _conn()
        now = utc_now_iso()
        try:
            c.execute("UPDATE preferences SET gold_text=?, updated_at=? WHERE pair_id=? AND annotator=?",
                      (gold_text, now, pair["pair_id"], annotator))
            c.commit()
        finally:
            c.close()


def set_role(annotator, pair_id, role):
    with _pref_lock:
        c = _conn()
        now = utc_now_iso()
        try:
            c.execute("UPDATE preferences SET role=?, updated_at=? WHERE pair_id=? AND annotator=?",
                      (role, now, pair_id, annotator))
            c.commit()
        finally:
            c.close()


# ---- blacklist ----
def blacklist_add(annotator, answer_text, prompt_text=None, reason=""):
    h = hashlib.sha1(answer_text.strip().encode("utf-8")).hexdigest()
    with _pref_lock:
        c = _conn()
        try:
            c.execute("INSERT OR IGNORE INTO blacklist"
                      "(answer_hash,annotator,answer_text,prompt_text,reason,created_at)"
                      " VALUES (?,?,?,?,?,?)",
                      (h, annotator, answer_text, prompt_text, reason, utc_now_iso()))
            c.commit()
        finally:
            c.close()
    return h


def blacklist_hashes(annotator):
    with _pref_lock:
        c = _conn()
        try:
            return {r["answer_hash"] for r in
                    c.execute("SELECT answer_hash FROM blacklist WHERE annotator=?", (annotator,))}
        finally:
            c.close()


def blacklist_rows(annotator):
    with _pref_lock:
        c = _conn()
        try:
            return [dict(r) for r in
                    c.execute("SELECT * FROM blacklist WHERE annotator=?", (annotator,))]
        finally:
            c.close()


# ---- reads ----
def iter_votes(annotator):
    with _pref_lock:
        c = _conn()
        try:
            return [dict(r) for r in c.execute("SELECT * FROM preferences WHERE annotator=?", (annotator,))]
        finally:
            c.close()


def progress(annotator):
    with _pref_lock:
        c = _conn()
        try:
            t = c.execute("SELECT COUNT(*) n FROM queue_cache WHERE annotator=?", (annotator,)).fetchone()["n"]
            d = c.execute("SELECT COUNT(*) n FROM queue_cache WHERE annotator=? AND annotated=1", (annotator,)).fetchone()["n"]
            return {"annotated": d, "total": t}
        finally:
            c.close()


def save_calibration_run(row):
    with _pref_lock:
        c = _conn()
        try:
            c.execute("""INSERT INTO calibration_runs
              (run_id,annotator,grader_setting,weights_json,tier,n_pairs,pairwise_acc,
               cohen_kappa,spearman,per_category,suggested_weights,created_at)
              VALUES (:run_id,:annotator,:grader_setting,:weights_json,:tier,:n_pairs,:pairwise_acc,
               :cohen_kappa,:spearman,:per_category,:suggested_weights,:created_at)""", row)
            c.commit()
        finally:
            c.close()


def list_calibration_runs(annotator, limit=20):
    with _pref_lock:
        c = _conn()
        try:
            return [dict(r) for r in c.execute(
                "SELECT * FROM calibration_runs WHERE annotator=? ORDER BY created_at DESC LIMIT ?",
                (annotator, limit))]
        finally:
            c.close()


# ---- grading selection (per-chat active grading version) ----
def get_grading_selection(annotator, source_key):
    with _pref_lock:
        c = _conn()
        try:
            row = c.execute("SELECT version_id FROM grading_selection WHERE annotator=? AND source_key=?",
                            (annotator, source_key)).fetchone()
            return row["version_id"] if row else None
        finally:
            c.close()


def set_grading_selection(annotator, source_key, version_id):
    with _pref_lock:
        c = _conn()
        now = utc_now_iso()
        try:
            c.execute("""INSERT INTO grading_selection(annotator,source_key,version_id,updated_at)
              VALUES (?,?,?,?)
              ON CONFLICT(annotator,source_key) DO UPDATE SET
                version_id=excluded.version_id, updated_at=excluded.updated_at""",
                      (annotator, source_key, version_id, now))
            c.commit()
        finally:
            c.close()
