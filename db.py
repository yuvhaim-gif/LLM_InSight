import sqlite3
import threading
from config import STATE_DB_PATH
from utils.common import utc_now_iso

_db_lock = threading.Lock()
_connection = None
_known_sessions: set = set()


def _get_conn():
    global _connection
    if _connection is None:
        _connection = sqlite3.connect(STATE_DB_PATH, check_same_thread=False)
        _connection.row_factory = sqlite3.Row
    return _connection


def init_db():
    with _db_lock:
        conn = _get_conn()
        conn.execute(
            """CREATE TABLE IF NOT EXISTS session_state (
                session_id TEXT PRIMARY KEY,
                current_iteration_value INTEGER NOT NULL DEFAULT 1,
                is_processing INTEGER NOT NULL DEFAULT 0,
                models_executed INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )"""
        )
        conn.commit()


def _ensure_row(conn, session_id):
    if session_id in _known_sessions:
        return
    row = conn.execute(
        "SELECT 1 FROM session_state WHERE session_id = ?", (session_id,)
    ).fetchone()
    if row is None:
        conn.execute(
            "INSERT INTO session_state (session_id, current_iteration_value, is_processing, models_executed, updated_at) VALUES (?, 1, 0, 0, ?)",
            (session_id, utc_now_iso()),
        )
        conn.commit()
    _known_sessions.add(session_id)


def get_state(session_id):
    with _db_lock:
        conn = _get_conn()
        _ensure_row(conn, session_id)
        row = conn.execute(
            "SELECT current_iteration_value, is_processing, models_executed FROM session_state WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        return {
            "current_iteration_value": row["current_iteration_value"],
            "is_processing": bool(row["is_processing"]),
            "models_executed": row["models_executed"],
        }


def set_current_iteration(session_id, value):
    with _db_lock:
        conn = _get_conn()
        _ensure_row(conn, session_id)
        conn.execute(
            "UPDATE session_state SET current_iteration_value = ?, updated_at = ? WHERE session_id = ?",
            (value, utc_now_iso(), session_id),
        )
        conn.commit()


def set_is_processing(session_id, value):
    with _db_lock:
        conn = _get_conn()
        _ensure_row(conn, session_id)
        conn.execute(
            "UPDATE session_state SET is_processing = ?, updated_at = ? WHERE session_id = ?",
            (1 if value else 0, utc_now_iso(), session_id),
        )
        conn.commit()


def set_models_executed(session_id, value):
    with _db_lock:
        conn = _get_conn()
        _ensure_row(conn, session_id)
        conn.execute(
            "UPDATE session_state SET models_executed = ?, updated_at = ? WHERE session_id = ?",
            (value, utc_now_iso(), session_id),
        )
        conn.commit()


def increment_models_executed(session_id):
    with _db_lock:
        conn = _get_conn()
        _ensure_row(conn, session_id)
        conn.execute(
            "UPDATE session_state SET models_executed = models_executed + 1, updated_at = ? WHERE session_id = ?",
            (utc_now_iso(), session_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT models_executed FROM session_state WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        return row["models_executed"]


def reset_state(session_id):
    with _db_lock:
        conn = _get_conn()
        _ensure_row(conn, session_id)
        conn.execute(
            "UPDATE session_state SET current_iteration_value = 1, is_processing = 0, models_executed = 0, updated_at = ? WHERE session_id = ?",
            (utc_now_iso(), session_id),
        )
        conn.commit()


def cleanup_old_sessions(max_age_hours=24):
    from datetime import datetime, timezone, timedelta

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()
    with _db_lock:
        conn = _get_conn()
        conn.execute(
            "DELETE FROM session_state WHERE updated_at < ?", (cutoff,)
        )
        conn.commit()
        _known_sessions.clear()
