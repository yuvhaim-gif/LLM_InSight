import pytest
from unittest.mock import MagicMock

from ai.api_calls import (
    call_model, is_error_response, _make_response,
)
from config import (
    _GEMINI_MODELS, _MISTRAL_MODELS, _GLM_MODELS, _GLM_MODEL_MAP,
    DEFAULT_LAYER1A_MODEL, DEFAULT_LAYER1B_MODEL,
    DEFAULT_LAYER0_MODEL, DEFAULT_LAYER2_MODEL,
    AVAILABLE_GRADER_MODELS,
)

_SENTINEL = {"content": "__SENTINEL__", "token_info": {"tool": "test", "input_tokens": 0, "output_tokens": 0, "total_tokens": 0}}


@pytest.mark.parametrize("model", list(_GEMINI_MODELS), ids=list(_GEMINI_MODELS))
def test_gemini_models_route_to_gemini(monkeypatch, model):
    mock = MagicMock(return_value=_SENTINEL)
    monkeypatch.setattr("ai.api_calls.call_google_gemini", mock)
    result = call_model(model, [{"role": "user", "content": "hi"}])
    assert result is _SENTINEL
    mock.assert_called_once()


@pytest.mark.parametrize("model", list(_MISTRAL_MODELS), ids=list(_MISTRAL_MODELS))
def test_mistral_models_route_to_mistral(monkeypatch, model):
    mock = MagicMock(return_value=_SENTINEL)
    monkeypatch.setattr("ai.api_calls.call_mistral", mock)
    result = call_model(model, [{"role": "user", "content": "hi"}])
    assert result is _SENTINEL
    mock.assert_called_once()


@pytest.mark.parametrize("model", list(_GLM_MODELS), ids=list(_GLM_MODELS))
def test_glm_models_route_to_glm(monkeypatch, model):
    mock = MagicMock(return_value=_SENTINEL)
    monkeypatch.setattr("ai.api_calls.call_glm", mock)
    result = call_model(model, [{"role": "user", "content": "hi"}])
    assert result is _SENTINEL
    mock.assert_called_once()


def test_unknown_model_routes_to_ollama(monkeypatch):
    mock = MagicMock(return_value=_SENTINEL)
    monkeypatch.setattr("ai.api_calls.call_ollama", mock)
    result = call_model("some-random-model", [{"role": "user", "content": "hi"}])
    assert result is _SENTINEL
    mock.assert_called_once()


class TestDefaultModelRouting:
    def test_default_models_route_correctly(self):
        assert DEFAULT_LAYER1A_MODEL not in _GEMINI_MODELS
        assert DEFAULT_LAYER1A_MODEL not in _MISTRAL_MODELS
        assert DEFAULT_LAYER1A_MODEL not in _GLM_MODELS

        assert DEFAULT_LAYER1B_MODEL not in _GEMINI_MODELS
        assert DEFAULT_LAYER1B_MODEL not in _MISTRAL_MODELS
        assert DEFAULT_LAYER1B_MODEL not in _GLM_MODELS

        assert DEFAULT_LAYER0_MODEL not in _GEMINI_MODELS
        assert DEFAULT_LAYER0_MODEL not in _MISTRAL_MODELS
        assert DEFAULT_LAYER0_MODEL not in _GLM_MODELS

        assert DEFAULT_LAYER2_MODEL in _MISTRAL_MODELS


class TestResponseFormat:
    def test_response_format_keys(self):
        resp = _make_response("text", "tool", 10, 20)
        assert set(resp.keys()) == {"content", "token_info"}
        assert set(resp["token_info"].keys()) == {"tool", "input_tokens", "output_tokens", "total_tokens"}

    def test_response_total_tokens_sum(self):
        resp = _make_response("x", "t", 10, 20)
        assert resp["token_info"]["total_tokens"] == 30


_ERROR_PREFIXES = [
    "[OLLAMA_TIMEOUT]",
    "[OLLAMA_ERROR]",
    "[GOOGLE_TIMEOUT]",
    "[GOOGLE_ERROR]",
    "[MISTRAL_TIMEOUT]",
    "[MISTRAL_ERROR]",
    "[GLM_TIMEOUT]",
    "[GLM_ERROR]",
]


@pytest.mark.parametrize("prefix", _ERROR_PREFIXES, ids=_ERROR_PREFIXES)
def test_error_prefixes_detected(prefix):
    assert is_error_response(f"{prefix}: something went wrong") is True


def test_non_error_not_detected():
    assert is_error_response("normal text") is False
    assert is_error_response({"content": "ok"}) is False


def test_error_detection_with_dict():
    assert is_error_response({"content": "[OLLAMA_ERROR]: something"}) is True


def test_routing_priority_no_overlap():
    g = set(_GEMINI_MODELS)
    m = set(_MISTRAL_MODELS)
    l = set(_GLM_MODELS)
    assert g & m == set()
    assert g & l == set()
    assert m & l == set()


def test_all_layer3_grader_models_route_to_ollama():
    for model in AVAILABLE_GRADER_MODELS:
        assert model not in _GEMINI_MODELS
        assert model not in _MISTRAL_MODELS
        assert model not in _GLM_MODELS


def test_glm_model_map_covers_glm_models():
    for model in _GLM_MODELS:
        assert model in _GLM_MODEL_MAP
