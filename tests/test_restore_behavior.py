import os
import json
import copy
import pytest

from flask import session as flask_session
from routes.review_routes import restore_chat_data_to_session
import config


def _restore_in_context(app, backup):
    with app.test_request_context():
        flask_session["logged_in"] = True
        flask_session["user"] = "testadmin"
        result = restore_chat_data_to_session(backup)
        sess_copy = dict(flask_session)
    return result, sess_copy


class TestRestoreFullPayload:
    def test_restore_full_v2_payload(self, app, sample_v2_backup):
        result, sess = _restore_in_context(app, sample_v2_backup)
        assert result["success"] is True
        assert len(result["restored_items"]) > 0
        for key in (
            "layer1a_model", "layer1b_model", "layer0_model", "layer2_model",
            "grader_setting_name", "degradation_break_enabled",
            "change_prompt_between_layers1", "give_ideas_enabled",
            "layer1_last_best_context_enabled", "grade_vs_prompt_mode",
            "min_grade", "max_iterations", "prompt_history", "custom_weights",
        ):
            assert key in sess

    def test_restore_session_models(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["session_data"]["layer1a_model"] = "llama3.1"
        backup["session_data"]["layer1b_model"] = "falcon3:7b"
        backup["session_data"]["layer0_model"] = "solar"
        backup["session_data"]["layer2_model"] = "gemma2:9b"
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert sess["layer1a_model"] == "llama3.1"
        assert sess["layer1b_model"] == "falcon3:7b"
        assert sess["layer0_model"] == "solar"
        assert sess["layer2_model"] == "gemma2:9b"

    def test_restore_advanced_maps(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["session_data"]["advanced_layer1a_models"] = {"1": "modelA"}
        backup["session_data"]["advanced_layer1b_models"] = {"1": "modelB"}
        backup["session_data"]["advanced_layer2_models"] = {"1": "modelC"}
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert sess["advanced_layer1a_models"] == {"1": "modelA"}
        assert sess["advanced_layer1b_models"] == {"1": "modelB"}
        assert sess["advanced_layer2_models"] == {"1": "modelC"}

    def test_restore_toggles(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["session_data"]["degradation_break_enabled"] = False
        backup["session_data"]["change_prompt_between_layers1"] = False
        backup["session_data"]["give_ideas_enabled"] = False
        backup["session_data"]["layer1_last_best_context_enabled"] = False
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert sess["degradation_break_enabled"] is False
        assert sess["change_prompt_between_layers1"] is False
        assert sess["give_ideas_enabled"] is False
        assert sess["layer1_last_best_context_enabled"] is False

    def test_restore_grade_vs_prompt_mode_validation(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["session_data"]["grade_vs_prompt_mode"] = "invalid"
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert sess["grade_vs_prompt_mode"] == "current"

    def test_restore_grader_setting_nonexistent_fallback(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["session_data"]["grader_setting_name"] = "nonexistent_xyz"
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert sess["grader_setting_name"] == "default"

    def test_restore_prompt_history_from_explicit(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["prompt_history"] = ["prompt A", "prompt B"]
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert sess["prompt_history"] == ["prompt A", "prompt B"]

    def test_restore_prompt_history_fallback_from_console(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["prompt_history"] = []
        backup["console_output"] = (
            "\n\n\U0001f3af STARTING ANALYSIS FOR PROMPT #1\n"
            "PROMPT: hello world\n\n"
            "some output here\n"
        )
        backup["iteration_history"] = {}
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert isinstance(sess.get("prompt_history"), list)
        assert len(sess["prompt_history"]) > 0

    def test_restore_prompt_history_fallback_from_iteration_history(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["prompt_history"] = []
        backup["console_output"] = ""
        backup["iteration_history"] = {
            "prompts": {
                "prompt_1": {"prompt_number": 1, "iterations": [{"iteration": 1}]},
                "prompt_2": {"prompt_number": 2, "iterations": [{"iteration": 1}]},
            }
        }
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert isinstance(sess.get("prompt_history"), list)
        assert len(sess["prompt_history"]) == 2

    def test_restore_empty_payload(self, app):
        result, sess = _restore_in_context(app, {})
        assert result["success"] is True

    def test_restore_ledger_runtime_key_migration(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["ledger_entries"] = [
            {"prompt_number": 1, "iteration": 1, "elapsed_time": 15}
        ]
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        with open(config.LEDGER_FILE, "r", encoding="utf-8") as f:
            for line in f:
                entry = json.loads(line.strip())
                if entry.get("prompt_number") == 1:
                    assert "runtime_in_sec" in entry
                    assert "elapsed_time" not in entry
                    assert entry["runtime_in_sec"] == 15

    def test_restore_writes_files_to_temp(self, app, sample_v2_backup, temp_workdir):
        _restore_in_context(app, sample_v2_backup)
        assert os.path.exists(temp_workdir["console"])
        with open(temp_workdir["console"], "r", encoding="utf-8") as f:
            assert len(f.read().strip()) > 0
        assert os.path.exists(temp_workdir["iteration_history"])
        assert os.path.exists(temp_workdir["bestbest"])
        assert os.path.exists(temp_workdir["ledger"])

    def test_restore_weights_preserved(self, app, sample_v2_backup):
        backup = copy.deepcopy(sample_v2_backup)
        backup["session_data"]["current_weights"] = {"accuracy": 0.5, "clarity": 0.5}
        result, sess = _restore_in_context(app, backup)
        assert result["success"] is True
        assert sess["custom_weights"] == {"accuracy": 0.5, "clarity": 0.5}

    def test_upload_endpoint_calls_restore(self, auth_client, sample_v2_backup):
        resp = auth_client.post(
            "/upload_chat_json",
            json={"chat_data": sample_v2_backup},
            content_type="application/json",
        )
        data = resp.get_json()
        assert data["success"] is True
        assert "restored_items" in data

    def test_load_from_review_clears_files_first(self, app, auth_client, sample_v2_backup, temp_workdir):
        for path in (temp_workdir["console"], temp_workdir["ledger"],
                     temp_workdir["bestbest"], temp_workdir["iteration_history"]):
            with open(path, "w", encoding="utf-8") as f:
                f.write("OLD_DUMMY_CONTENT")

        backup_filename = "chat_backup_test_review_20260101120000.json"
        filepath = os.path.join(temp_workdir["downloads"], backup_filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(sample_v2_backup, f)

        resp = auth_client.post(
            "/load_chat_from_review",
            json={"filename": backup_filename},
            content_type="application/json",
        )
        data = resp.get_json()
        assert data["success"] is True

        with open(temp_workdir["console"], "r", encoding="utf-8") as f:
            content = f.read()
            assert "OLD_DUMMY_CONTENT" not in content
