import pytest
from datetime import datetime


EXPECTED_TOP_LEVEL_KEYS = {
    "console_output",
    "prompt_history",
    "all_prompt_results",
    "iteration_history",
    "best_best_cache",
    "ledger_entries",
    "session_data",
    "timestamp",
    "version",
}

EXPECTED_SESSION_DATA_KEYS = {
    "current_weights",
    "layer1a_model",
    "layer1b_model",
    "layer0_model",
    "layer2_model",
    "layer3_graders",
    "advanced_layer1a_models",
    "advanced_layer1b_models",
    "advanced_layer2_models",
    "degradation_break_enabled",
    "change_prompt_between_layers1",
    "give_ideas_enabled",
    "layer1_last_best_context_enabled",
    "grade_vs_prompt_mode",
    "grader_setting_name",
    "min_grade",
    "max_iterations",
}


def _get_backup(auth_client):
    resp = auth_client.get("/get_backup_data")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    return data["backup_data"]


class TestBackupTopLevelKeys:
    def test_backup_top_level_keys(self, auth_client):
        backup = _get_backup(auth_client)
        assert set(backup.keys()) == EXPECTED_TOP_LEVEL_KEYS

    def test_backup_version(self, auth_client):
        backup = _get_backup(auth_client)
        assert backup["version"] == "2.0"

    def test_backup_timestamp_iso(self, auth_client):
        backup = _get_backup(auth_client)
        ts = backup["timestamp"]
        assert isinstance(ts, str)
        datetime.fromisoformat(ts)

    def test_session_data_keys(self, auth_client):
        backup = _get_backup(auth_client)
        assert set(backup["session_data"].keys()) == EXPECTED_SESSION_DATA_KEYS

    def test_session_data_types(self, auth_client):
        sd = _get_backup(auth_client)["session_data"]
        assert isinstance(sd["current_weights"], dict)
        for key in ("layer1a_model", "layer1b_model", "layer0_model", "layer2_model"):
            assert isinstance(sd[key], str)
        assert isinstance(sd["layer3_graders"], dict)
        for key in ("advanced_layer1a_models", "advanced_layer1b_models", "advanced_layer2_models"):
            assert isinstance(sd[key], dict)
        for key in (
            "degradation_break_enabled",
            "change_prompt_between_layers1",
            "give_ideas_enabled",
            "layer1_last_best_context_enabled",
        ):
            assert isinstance(sd[key], bool)
        assert sd["grade_vs_prompt_mode"] in ("current", "first")
        assert isinstance(sd["grader_setting_name"], str)
        assert isinstance(sd["min_grade"], int)
        assert isinstance(sd["max_iterations"], int)

    def test_session_data_defaults_fresh_session(self, auth_client):
        sd = _get_backup(auth_client)["session_data"]
        assert sd["layer1a_model"] == "gemma:7b-instruct-q4_K_M"
        assert sd["layer1b_model"] == "granite4:latest"
        assert sd["layer0_model"] == "gemma2:9b"
        assert sd["layer2_model"] == "open-mistral-nemo-2407"
        assert sd["grader_setting_name"] == "default"
        assert sd["min_grade"] == 100
        assert sd["max_iterations"] == 5
        assert sd["degradation_break_enabled"] is True
        assert sd["change_prompt_between_layers1"] is True
        assert sd["give_ideas_enabled"] is True
        assert sd["layer1_last_best_context_enabled"] is True
        assert sd["grade_vs_prompt_mode"] == "current"
        assert sd["advanced_layer1a_models"] == {}
        assert sd["advanced_layer1b_models"] == {}
        assert sd["advanced_layer2_models"] == {}

    def test_backup_prompt_history_is_list(self, auth_client):
        backup = _get_backup(auth_client)
        ph = backup["prompt_history"]
        assert isinstance(ph, list)
        for item in ph:
            assert isinstance(item, str)

    def test_backup_ledger_entries_is_list(self, auth_client):
        backup = _get_backup(auth_client)
        assert isinstance(backup["ledger_entries"], list)

    def test_backup_iteration_history_structure(self, auth_client):
        backup = _get_backup(auth_client)
        ih = backup["iteration_history"]
        assert isinstance(ih, dict)
        if ih:
            assert "prompts" in ih
            assert isinstance(ih["prompts"], dict)

    def test_backup_weights_sum_to_one(self, auth_client):
        sd = _get_backup(auth_client)["session_data"]
        weights = sd["current_weights"]
        assert isinstance(weights, dict)
        total = sum(weights.values())
        assert abs(total - 1.0) <= 0.01

    def test_backup_grader_setting_name_present(self, auth_client):
        sd = _get_backup(auth_client)["session_data"]
        assert "grader_setting_name" in sd
        assert isinstance(sd["grader_setting_name"], str)
        assert len(sd["grader_setting_name"]) > 0
