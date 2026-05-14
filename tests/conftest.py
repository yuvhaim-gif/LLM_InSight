import os
import sys

os.environ["APP_USER"] = "testadmin"
os.environ["APP_PASS"] = "testpass"
os.environ["FLASK_SECRET"] = "test-secret-key"
os.environ.setdefault("LANGCHAIN_API_KEY", "test-key")
os.environ.setdefault("LANGCHAIN_PROJECT", "test-project")
os.environ.setdefault("MISTRAL_API_KEY", "")
os.environ.setdefault("GOOGLE_API_KEY", "")

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

import pytest
from main import app as _flask_app
import config
import db as db_mod


_FILE_PATH_ATTRS = ["LEDGER_FILE", "BESTBEST_CACHE", "ITERATION_HISTORY_FILE", "CONSOLE_OUTPUT_FILE"]
_FILE_PATH_MODULES = ["config", "utils.file_io", "routes.api_routes", "routes.review_routes"]


def _patch_file_paths(monkeypatch, tmp_path):
    ledger = str(tmp_path / "ledger.jsonl")
    bestbest = str(tmp_path / "best_best_layer1.json")
    iteration_hist = str(tmp_path / "iteration_history.json")
    console = str(tmp_path / "console_output.txt")
    downloads = str(tmp_path / "downloads")
    backup = str(tmp_path / "backup")
    db_path = str(tmp_path / "test.db")

    os.makedirs(downloads, exist_ok=True)
    os.makedirs(backup, exist_ok=True)

    path_map = {
        "LEDGER_FILE": ledger,
        "BESTBEST_CACHE": bestbest,
        "ITERATION_HISTORY_FILE": iteration_hist,
        "CONSOLE_OUTPUT_FILE": console,
    }

    for mod in _FILE_PATH_MODULES:
        for attr, val in path_map.items():
            try:
                monkeypatch.setattr(f"{mod}.{attr}", val)
            except AttributeError:
                pass

    for mod in ["config", "utils.file_io"]:
        try:
            monkeypatch.setattr(f"{mod}.BACKUP_DIR", backup)
        except AttributeError:
            pass

    monkeypatch.setattr("config.DOWNLOADS_DIR", downloads)
    try:
        monkeypatch.setattr("routes.review_routes.DOWNLOADS_DIR", downloads)
    except AttributeError:
        pass

    monkeypatch.setattr("config.STATE_DB_PATH", db_path)
    monkeypatch.setattr("db.STATE_DB_PATH", db_path)

    return {
        "ledger": ledger,
        "bestbest": bestbest,
        "iteration_history": iteration_hist,
        "console": console,
        "downloads": downloads,
        "backup": backup,
        "db_path": db_path,
    }


@pytest.fixture
def app(tmp_path, monkeypatch):
    if db_mod._connection:
        try:
            db_mod._connection.close()
        except Exception:
            pass
    db_mod._connection = None

    _patch_file_paths(monkeypatch, tmp_path)

    _flask_app.config["TESTING"] = True
    _flask_app.config["SECRET_KEY"] = "test-secret"

    db_mod.init_db()

    yield _flask_app

    if db_mod._connection:
        try:
            db_mod._connection.close()
        except Exception:
            pass
    db_mod._connection = None


@pytest.fixture
def client(app):
    with app.test_client() as c:
        yield c


@pytest.fixture
def auth_client(app):
    with app.test_client() as c:
        c.post("/login", data={"username": "testadmin", "password": "testpass"}, follow_redirects=True)
        yield c


@pytest.fixture
def temp_workdir(app):
    return {
        "ledger": config.LEDGER_FILE,
        "bestbest": config.BESTBEST_CACHE,
        "iteration_history": config.ITERATION_HISTORY_FILE,
        "console": config.CONSOLE_OUTPUT_FILE,
        "downloads": config.DOWNLOADS_DIR,
    }


@pytest.fixture
def sample_v2_backup():
    return {
        "console_output": "Test console output\n",
        "prompt_history": ["prompt 1", "prompt 2"],
        "all_prompt_results": [],
        "iteration_history": {
            "prompts": {
                "prompt_1": {
                    "prompt_number": 1,
                    "iterations": [
                        {
                            "iteration": 1,
                            "best_score": 85,
                            "is_best_best": True,
                            "winner": "original",
                            "layer1a_score": 85,
                            "layer1b_score": 80,
                            "layer1a_model_used": "gemma:7b-instruct-q4_K_M",
                            "layer1b_model_used": "granite4:latest",
                            "layer1a_grades": {"accuracy": 90, "clarity": 80},
                            "layer1b_grades": {"accuracy": 80, "clarity": 80},
                            "total_runtime": 10,
                        }
                    ],
                }
            }
        },
        "best_best_cache": {"1": {"prompt": "prompt 1", "score": 85}},
        "ledger_entries": [
            {
                "prompt_number": 1,
                "iteration": 1,
                "runtime_in_sec": 10,
                "timestamp": "2026-01-01T00:00:00+00:00",
            }
        ],
        "session_data": {
            "current_weights": {
                "accuracy": 0.25,
                "clarity": 0.25,
                "conciseness": 0.15,
                "creativity": 0.25,
                "structure": 0.10,
            },
            "layer1a_model": "gemma:7b-instruct-q4_K_M",
            "layer1b_model": "granite4:latest",
            "layer0_model": "gemma2:9b",
            "layer2_model": "open-mistral-nemo-2407",
            "layer3_graders": {
                "accuracy": "phi3:mini",
                "clarity": "gemma2:2b",
                "conciseness": "qwen2.5:1.5b",
                "creativity": "llama3.2:3b",
                "structure": "qwen2.5:1.5b",
            },
            "advanced_layer1a_models": {},
            "advanced_layer1b_models": {},
            "advanced_layer2_models": {},
            "degradation_break_enabled": True,
            "change_prompt_between_layers1": True,
            "give_ideas_enabled": True,
            "layer1_last_best_context_enabled": True,
            "grade_vs_prompt_mode": "current",
            "grader_setting_name": "default",
            "min_grade": 100,
            "max_iterations": 5,
        },
        "timestamp": "2026-01-01T00:00:00+00:00",
        "version": "2.0",
    }
