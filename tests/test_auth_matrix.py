import pytest


class TestAuthPublic:
    def test_login_get_public(self, client):
        resp = client.get("/login")
        assert resp.status_code == 200

    def test_login_post_valid(self, client):
        resp = client.post("/login", data={"username": "testadmin", "password": "testpass"})
        assert resp.status_code == 302
        assert "/login" not in (resp.headers.get("Location") or "")

    def test_login_post_invalid(self, client):
        resp = client.post("/login", data={"username": "wrong", "password": "wrong"})
        assert resp.status_code == 200

    def test_progress_endpoints_public(self, client):
        for path in ("/is-processing", "/iteration", "/iteration-wait"):
            resp = client.get(path)
            assert resp.status_code == 200
            assert resp.get_json() is not None

    def test_shutdown_notify_public(self, client):
        resp = client.post("/shutdown-notify")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "ok"

    def test_logout_clears_session(self, auth_client):
        resp = auth_client.get("/logout")
        assert resp.status_code == 302
        resp2 = auth_client.get("/")
        assert resp2.status_code == 302
        loc = resp2.headers.get("Location", "")
        assert "login" in loc


class TestAuthRedirectEndpoints:
    def test_index_requires_auth_unauth(self, client):
        resp = client.get("/")
        assert resp.status_code == 302
        assert "login" in resp.headers.get("Location", "")

    def test_index_requires_auth_auth(self, auth_client):
        resp = auth_client.get("/")
        assert resp.status_code == 200

    def test_submit_requires_auth(self, client):
        resp = client.post("/")
        assert resp.status_code == 302
        assert "login" in resp.headers.get("Location", "")

    def test_clear_chat_requires_auth(self, client):
        resp = client.post("/clear_chat")
        assert resp.status_code == 302
        assert "login" in resp.headers.get("Location", "")

    def test_config_graders_requires_auth_unauth(self, client):
        resp = client.get("/config_graders")
        assert resp.status_code == 302
        assert "login" in resp.headers.get("Location", "")

    def test_config_graders_requires_auth_auth(self, auth_client):
        resp = auth_client.get("/config_graders")
        assert resp.status_code == 200

    def test_review_chats_requires_user(self, client):
        resp = client.get("/review_chats")
        assert resp.status_code == 302
        assert "login" in resp.headers.get("Location", "")


_MODEL_WEIGHT_TOGGLE_ENDPOINTS = [
    ("POST", "/update_layer1a_model", {"model": "gemma:7b-instruct-q4_K_M"}),
    ("POST", "/reset_layer1a_model", None),
    ("POST", "/update_layer1b_model", {"model": "granite4:latest"}),
    ("POST", "/reset_layer1b_model", None),
    ("POST", "/update_layer0_model", {"model": "gemma2:9b"}),
    ("POST", "/reset_layer0_model", None),
    ("POST", "/update_layer2_model", {"model": "open-mistral-nemo-2407"}),
    ("POST", "/reset_layer2_model", None),
    ("POST", "/update_weights", {"weights": {"accuracy": 0.2, "clarity": 0.2, "conciseness": 0.2, "creativity": 0.2, "structure": 0.2}}),
    ("POST", "/reset_weights", None),
]

_TOGGLE_ENDPOINTS = [
    ("POST", "/set_degradation_break", {"enabled": True}),
    ("POST", "/set_change_prompt_between_layers1", {"enabled": True}),
    ("POST", "/set_give_ideas", {"enabled": True}),
    ("POST", "/set_layer1_last_best_context", {"enabled": True}),
    ("POST", "/set_grade_vs_prompt_mode", {"mode": "current"}),
]

_ADVANCED_ENDPOINTS = [
    ("GET", "/get_advanced_models", None),
    ("POST", "/save_advanced_models", {"layer1a_models": {}, "layer1b_models": {}, "layer2_models": {}}),
    ("POST", "/clear_advanced_models", None),
]

_GRADER_ENDPOINTS = [
    ("GET", "/grader_settings", None),
    ("GET", "/grader_setting/default", None),
    ("POST", "/save_grader_setting", {"name": "test", "entries": []}),
    ("POST", "/set_grader_setting", {"name": "default"}),
    ("GET", "/get_grader_config", None),
]


def _make_request(client, method, path, payload):
    if method == "GET":
        return client.get(path)
    if payload is not None:
        return client.post(path, json=payload, content_type="application/json")
    return client.post(path, content_type="application/json")


@pytest.mark.parametrize(
    "method,path,payload",
    _MODEL_WEIGHT_TOGGLE_ENDPOINTS,
    ids=[ep[1] for ep in _MODEL_WEIGHT_TOGGLE_ENDPOINTS],
)
class TestModelWeightToggleAuth:
    def test_requires_auth(self, client, method, path, payload):
        resp = _make_request(client, method, path, payload)
        assert resp.status_code == 401


@pytest.mark.parametrize(
    "method,path,payload",
    _TOGGLE_ENDPOINTS,
    ids=[ep[1] for ep in _TOGGLE_ENDPOINTS],
)
class TestToggleAuth:
    def test_requires_auth(self, client, method, path, payload):
        resp = _make_request(client, method, path, payload)
        assert resp.status_code == 401


@pytest.mark.parametrize(
    "method,path,payload",
    _ADVANCED_ENDPOINTS,
    ids=[ep[1] for ep in _ADVANCED_ENDPOINTS],
)
class TestAdvancedApiAuth:
    def test_requires_auth(self, client, method, path, payload):
        resp = _make_request(client, method, path, payload)
        assert resp.status_code == 401


@pytest.mark.parametrize(
    "method,path,payload",
    _GRADER_ENDPOINTS,
    ids=[ep[1] for ep in _GRADER_ENDPOINTS],
)
class TestGraderApiAuth:
    def test_requires_auth(self, client, method, path, payload):
        resp = _make_request(client, method, path, payload)
        assert resp.status_code == 401


class TestOtherAuthEndpoints:
    def test_get_backup_data_requires_auth_unauth(self, client):
        resp = client.get("/get_backup_data")
        assert resp.status_code == 401

    def test_get_backup_data_requires_auth_auth(self, auth_client):
        resp = auth_client.get("/get_backup_data")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "backup_data" in data

    def test_get_current_models_requires_auth_unauth(self, client):
        resp = client.get("/get_current_models")
        assert resp.status_code == 401

    def test_get_current_models_requires_auth_auth(self, auth_client):
        resp = auth_client.get("/get_current_models")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "layer1a_model" in data

    def test_save_current_selection_requires_auth(self, client):
        resp = client.post("/save_current_selection", content_type="application/json")
        assert resp.status_code == 401

    def test_load_chat_requires_user(self, client):
        resp = client.post("/load_chat_from_review", json={"filename": "x"}, content_type="application/json")
        assert resp.status_code == 401

    def test_delete_chat_requires_user(self, client):
        resp = client.post("/delete_chat_file", json={"filename": "x"}, content_type="application/json")
        assert resp.status_code == 401

    def test_upload_chat_requires_auth(self, client):
        resp = client.post("/upload_chat_json", json={"chat_data": {}}, content_type="application/json")
        data = resp.get_json()
        assert data.get("success") is False
