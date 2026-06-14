import pytest

from config import (
    DEFAULT_LAYER1A_MODEL, DEFAULT_LAYER1B_MODEL,
    DEFAULT_LAYER0_MODEL, DEFAULT_LAYER2_MODEL,
    AVAILABLE_LAYER2_MODELS,
)
from utils.session_keys import (
    SK_LAYER1A_MODEL, SK_DEGRADATION_BREAK_ENABLED, SK_GIVE_IDEAS_ENABLED,
)


_UPDATE_CASES = [
    ("/update_layer1a_model", "gemma:7b-instruct-q4_K_M", SK_LAYER1A_MODEL),
    ("/update_layer1b_model", "granite4:latest", None),
    ("/update_layer0_model", "gemma2:9b", None),
    ("/update_layer2_model", "open-mistral-nemo-2407", None),
]

_RESET_CASES = [
    ("/reset_layer1a_model", DEFAULT_LAYER1A_MODEL),
    ("/reset_layer1b_model", DEFAULT_LAYER1B_MODEL),
    ("/reset_layer0_model", DEFAULT_LAYER0_MODEL),
    ("/reset_layer2_model", DEFAULT_LAYER2_MODEL),
]

_TOGGLE_CASES = [
    "/set_degradation_break",
    "/set_change_prompt_between_layers1",
    "/set_give_ideas",
    "/set_layer1_last_best_context",
]


class TestModelRouteParity:
    @pytest.mark.parametrize("path,model,_sk", _UPDATE_CASES)
    def test_update_valid_model(self, auth_client, path, model, _sk):
        resp = auth_client.post(path, json={"model": model})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["model"] == model

    @pytest.mark.parametrize("path,model,_sk", _UPDATE_CASES)
    def test_update_invalid_model(self, auth_client, path, model, _sk):
        resp = auth_client.post(path, json={"model": "definitely-not-a-real-model"})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Invalid model"

    @pytest.mark.parametrize("path,default_model", _RESET_CASES)
    def test_reset_returns_default(self, auth_client, path, default_model):
        resp = auth_client.post(path)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["model"] == default_model

    def test_layer2_missing_model_uses_default(self, auth_client):
        resp = auth_client.post("/update_layer2_model", json={})
        if DEFAULT_LAYER2_MODEL in AVAILABLE_LAYER2_MODELS:
            assert resp.status_code == 200
            assert resp.get_json()["model"] == DEFAULT_LAYER2_MODEL
        else:
            assert resp.status_code == 400

    def test_layer1a_missing_model_rejected(self, auth_client):
        resp = auth_client.post("/update_layer1a_model", json={})
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "Invalid model"


class TestToggleRouteParity:
    @pytest.mark.parametrize("path", _TOGGLE_CASES)
    def test_toggle_false(self, auth_client, path):
        resp = auth_client.post(path, json={"enabled": False})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["enabled"] is False

    @pytest.mark.parametrize("path", _TOGGLE_CASES)
    def test_toggle_true(self, auth_client, path):
        resp = auth_client.post(path, json={"enabled": True})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["success"] is True
        assert data["enabled"] is True

    def test_toggle_default_when_missing(self, auth_client):
        resp = auth_client.post("/set_give_ideas", json={})
        assert resp.status_code == 200
        assert resp.get_json()["enabled"] is True


class TestSessionDefaultsParity:
    def test_login_applies_defaults(self, client):
        client.post("/login", data={"username": "testadmin", "password": "testpass"})
        with client.session_transaction() as sess:
            assert sess[SK_DEGRADATION_BREAK_ENABLED] is True
            assert sess[SK_GIVE_IDEAS_ENABLED] is True
            assert sess["min_grade"] == 100
            assert sess["max_iterations"] == 5
            assert sess["grader_setting_name"] == "default"
            assert sess["grade_vs_prompt_mode"] == "current"
            assert sess["prompt_history"] == []
            assert SK_LAYER1A_MODEL not in sess
