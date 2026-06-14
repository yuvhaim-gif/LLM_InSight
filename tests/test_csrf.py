import pytest


@pytest.fixture
def csrf_app(app):
    app.config["CSRF_ENABLED"] = True
    yield app


@pytest.fixture
def csrf_client(csrf_app):
    with csrf_app.test_client() as c:
        yield c


def test_post_without_token_blocked(csrf_client):
    resp = csrf_client.post("/save_current_selection", content_type="application/json")
    assert resp.status_code == 400
    assert resp.get_json().get("error") == "CSRF validation failed"


def test_safe_get_not_blocked(csrf_client):
    resp = csrf_client.get("/is-processing")
    assert resp.status_code == 200


def test_shutdown_notify_exempt(csrf_client):
    resp = csrf_client.post("/shutdown-notify")
    assert resp.status_code == 200
    assert resp.get_json().get("status") == "ok"


def test_token_seeded_on_login_page(csrf_client):
    resp = csrf_client.get("/login")
    assert resp.status_code == 200
    assert b'name="csrf-token"' in resp.data
    assert b'name="csrf_token"' in resp.data
    with csrf_client.session_transaction() as sess:
        assert sess.get("_csrf_token")


def test_csrf_full_flow_header_and_form(csrf_client):
    csrf_client.get("/login")
    with csrf_client.session_transaction() as sess:
        token = sess["_csrf_token"]

    resp = csrf_client.post(
        "/login",
        data={"username": "testadmin", "password": "testpass", "csrf_token": token},
    )
    assert resp.status_code == 302

    resp2 = csrf_client.post(
        "/set_give_ideas",
        json={"enabled": True},
        headers={"X-CSRFToken": token},
    )
    assert resp2.status_code == 200
    assert resp2.get_json().get("success") is True


def test_post_with_wrong_token_blocked(csrf_client):
    csrf_client.get("/login")
    resp = csrf_client.post(
        "/login",
        data={"username": "testadmin", "password": "testpass", "csrf_token": "wrong"},
    )
    assert resp.status_code == 400


def test_login_post_without_token_blocked(csrf_client):
    csrf_client.get("/login")
    resp = csrf_client.post(
        "/login",
        data={"username": "testadmin", "password": "testpass"},
    )
    assert resp.status_code == 400


def test_csrf_disabled_allows_post_without_token(client):
    resp = client.post("/save_current_selection", content_type="application/json")
    assert resp.status_code == 401


def test_meta_and_hidden_field_rendered_on_index(auth_client):
    resp = auth_client.get("/")
    assert resp.status_code == 200
    assert b'name="csrf-token"' in resp.data
    assert b'name="csrf_token"' in resp.data
    assert b"js/shared/csrf.js" in resp.data
