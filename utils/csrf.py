import hmac
import secrets

from flask import session, request, jsonify

_CSRF_SESSION_KEY = "_csrf_token"
_CSRF_HEADER = "X-CSRFToken"
_CSRF_FORM_FIELD = "csrf_token"
_SAFE_METHODS = ("GET", "HEAD", "OPTIONS", "TRACE")
_EXEMPT_ENDPOINTS = frozenset({"api.shutdown_notify"})


def generate_csrf_token():
    token = session.get(_CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_hex(32)
        session[_CSRF_SESSION_KEY] = token
    return token


def _request_token():
    token = request.headers.get(_CSRF_HEADER)
    if token:
        return token
    try:
        return request.form.get(_CSRF_FORM_FIELD)
    except Exception:
        return None


def init_csrf(app):
    @app.context_processor
    def _inject_csrf_token():
        return {"csrf_token": generate_csrf_token}

    @app.before_request
    def _csrf_protect():
        if not app.config.get("CSRF_ENABLED", True):
            return
        if request.method in _SAFE_METHODS:
            return
        if request.endpoint in _EXEMPT_ENDPOINTS:
            return
        expected = session.get(_CSRF_SESSION_KEY)
        sent = _request_token()
        if not expected or not sent or not hmac.compare_digest(str(expected), str(sent)):
            return jsonify({"error": "CSRF validation failed"}), 400
