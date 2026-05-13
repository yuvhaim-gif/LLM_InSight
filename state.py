import threading
import uuid
import db

_glm_model_cache = {}
_glm_load_lock = threading.Lock()
_glm_cancel_load = threading.Event()

_iteration_events = {}
_iteration_events_lock = threading.Lock()


def get_iteration_event(session_id=None):
    if session_id is None:
        session_id = _get_session_id()
    with _iteration_events_lock:
        if session_id not in _iteration_events:
            _iteration_events[session_id] = threading.Event()
        return _iteration_events[session_id]


def _get_session_id():
    try:
        from flask import session as flask_session
        sid = flask_session.get('_state_session_id')
        if sid:
            return sid
        sid = str(uuid.uuid4())
        flask_session['_state_session_id'] = sid
        flask_session.modified = True
        return sid
    except Exception:
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
