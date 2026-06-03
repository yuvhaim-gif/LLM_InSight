import pytest


def test_preference_endpoints_registered(app):
    eps = set(app.view_functions.keys())
    assert "pref.arena_page" in eps
    assert "pref.dataset_page" in eps
    assert "pref.scan" in eps
    assert "pref.cal_report" in eps
    assert "pref.ds_build" in eps


def test_existing_routes_still_resolve(app):
    eps = set(app.view_functions.keys())
    assert "api.login" in eps


def test_existing_login_route_works(client):
    r = client.get("/login")
    assert r.status_code == 200


def test_preferences_db_isolated_from_clear_sets():
    import main
    import inspect
    src = inspect.getsource(main)
    assert "preferences.db" not in src
    assert "PREFERENCES_DB" not in src
