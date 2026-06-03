from flask import Blueprint

pref_bp = Blueprint('pref', __name__)


def register_preference(app):
    from preference import routes  # noqa: F401  binds handlers to pref_bp
    from preference.store import init_pref_db
    init_pref_db()
    app.register_blueprint(pref_bp)
