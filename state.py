import threading
import db

_glm_model_cache = {}
_glm_load_lock = threading.Lock()
_glm_cancel_load = threading.Event()

_iteration_events = {}
_iteration_events_lock = threading.Lock()

_fallback_session_id = None

_thread_local = threading.local()


def get_iteration_event(session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    with _iteration_events_lock:
        if session_id not in _iteration_events:
            _iteration_events[session_id] = threading.Event()
        return _iteration_events[session_id]


def set_cached_session_id(session_id):
    _thread_local.cached_session_id = session_id


def clear_cached_session_id():
    _thread_local.cached_session_id = None


def _get_session_id():
    cached = getattr(_thread_local, 'cached_session_id', None)
    if cached is not None:
        return cached
    try:
        from flask import session as flask_session
        user = flask_session.get('user')
        if user:
            return f"user_{user}"
    except Exception:
        pass
    if _fallback_session_id:
        return _fallback_session_id
    return 'default'


def get_current_iteration_value(session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    return db.get_state(session_id)["current_iteration_value"]


def set_current_iteration_value(value, session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    db.set_current_iteration(session_id, value)


def get_is_processing(session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    return db.get_state(session_id)["is_processing"]


def set_is_processing(value, session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    db.set_is_processing(session_id, value)


def get_models_executed(session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    return db.get_state(session_id)["models_executed"]


def set_models_executed(value, session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    db.set_models_executed(session_id, value)


def increment_models_executed(session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    return db.increment_models_executed(session_id)


def reset_session_state(session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    db.reset_state(session_id)
    with _iteration_events_lock:
        _iteration_events.pop(session_id, None)
