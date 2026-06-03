#!/usr/bin/env python3

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from config.secrets import ADMIN_USER, ADMIN_PASS, FLASK_SECRET, LANGCHAIN_API_KEY, LANGCHAIN_PROJECT
from config.secrets import GOOGLE_API_KEY, MISTRAL_API_KEY

PORT = int(os.environ.get("PORT", 5000))
SSL_CERT_PATH = os.environ.get("SSL_CERT_PATH", "")
SSL_KEY_PATH = os.environ.get("SSL_KEY_PATH", "")

if LANGCHAIN_API_KEY:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = LANGCHAIN_API_KEY
    os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_API_KEY"] = LANGCHAIN_API_KEY
    os.environ["LANGSMITH_PROJECT"] = LANGCHAIN_PROJECT

DEFAULT_LAYER1A_MODEL = "gemma:7b-instruct-q4_K_M"
DEFAULT_LAYER1B_MODEL = "granite4:latest"
DEFAULT_LAYER0_MODEL = "gemma2:9b"
DEFAULT_LAYER2_MODEL = "open-mistral-nemo-2407"

LAYER3_GRADER_MODELS = {
    "accuracy": "phi3:mini",
    "clarity": "gemma2:2b",
    "conciseness": "qwen2.5:1.5b",
    "creativity": "llama3.2:3b",
    "structure": "qwen2.5:1.5b"
}

_GEMINI_MODELS = ("gemini-2.5-flash", "gemini-2.5-pro")
_MISTRAL_MODELS = ("mistral-small-2506", "voxtral-mini-2507", "open-mistral-nemo-2407")
_GLM_MODELS = ("glm-4-9b", "glm-4-9b-chat")
_GLM_MODEL_MAP = {
    "glm-4-9b": "THUDM/glm-4-9b-chat-hf",
    "glm-4-9b-chat": "THUDM/glm-4-9b-chat-hf"
}

GRADERDATA_DIR = os.path.join(BASE_DIR, "graderdata")

AVAILABLE_GRADER_MODELS = [
    "phi3:mini",
    "gemma2:2b",
    "qwen2.5:1.5b",
    "llama3.2:3b",
]

DATA_DIR = os.path.join(BASE_DIR, "data")
LEDGER_FILE = os.path.join(DATA_DIR, "ledger.jsonl")
BESTBEST_CACHE = os.path.join(DATA_DIR, "best_best_layer1.json")
BACKUP_DIR = os.path.join(BASE_DIR, "backup")
ITERATION_HISTORY_FILE = os.path.join(DATA_DIR, "iteration_history.json")
CONSOLE_OUTPUT_FILE = os.path.join(DATA_DIR, "console_output.txt")
DOWNLOADS_DIR = os.path.join(BASE_DIR, "backup")
REVIEW_MANIFEST_DIR = os.path.join(BASE_DIR, "backup")
STATE_DB_PATH = os.path.join(DATA_DIR, "runtime_state.db")

_CORE_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "mistral-small-2506",
    "voxtral-mini-2507",
    "open-mistral-nemo-2407",
    "mistral:7b-instruct",
    "codellama:7b",
    "gemma:7b-instruct-q4_K_M",
    "qwen2.5-coder:7b",
    "starcoder2:7b",
    "olmo2:7b",
    "llama2-uncensored:7b",
    "dolphin3:8b",
    "falcon3:7b",
    "granite3.3",
    "llama3.1",
    "solar",
    "gemma2:9b",
    "qwen3:14b",
    "deepseek-r1",
    "llama2:13b",
    "granite4:latest",
    "phi4:14b",
    "glm-4-9b",
    "glm-4-9b-chat",
    "deepseek-coder-v2",
    "gpt-oss:20b",
    "devstral:24b"
]

AVAILABLE_LAYER1A_MODELS = _CORE_MODELS
AVAILABLE_LAYER1B_MODELS = _CORE_MODELS

AVAILABLE_LAYER0_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "mistral-small-2506",
    "voxtral-mini-2507",
    "open-mistral-nemo-2407",
    "gemma:7b-instruct-q4_K_M",
    "llama2-uncensored:7b",
    "falcon3:7b",
    "solar",
    "gemma2:9b",
    "qwen3:14b",
    "deepseek-r1",
    "llama2:13b",
    "granite4:latest",
    "gpt-oss:20b"
]

AVAILABLE_LAYER2_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "mistral-small-2506",
    "voxtral-mini-2507",
    "open-mistral-nemo-2407",
    "gemma:7b-instruct-q4_K_M",
    "dolphin3:8b",
    "falcon3:7b",
    "granite3.3",
    "llama3.1",
    "solar",
    "gemma2:9b",
    "qwen3:14b",
    "deepseek-r1",
    "granite4:latest"
]

CATEGORY_WEIGHTS = {
    "accuracy": 0.25,
    "clarity": 0.25,
    "conciseness": 0.15,
    "creativity": 0.25,
    "structure": 0.10
}

PREFERENCES_DB        = os.path.join(DATA_DIR, "preferences.db")
PREFERENCE_EXPORT_DIR = os.path.join(DATA_DIR, "preferences_export")
PREFERENCE_REGRADE_DIR = os.path.join(DATA_DIR, "preferences_regrade")

ARENA_QUEUE_WEIGHTS = {"closeness": 0.4, "category": 0.3, "rank_conflict": 0.2, "borderline": 0.1}

ARENA_CROSS_MAX_PER_PROMPT = 6
ARENA_CROSS_MIN_GAP        = 5
ARENA_PASS_THRESHOLDS      = (50, 75, 95)

DATASET_AUTO_MIN_MARGIN    = 10
DATASET_AUTO_MIN_CONF      = 0.66
DATASET_MAX_PER_PROMPT     = 8
DATASET_TEST_SPLIT         = 0.10
DATASET_GROUNDTRUTH_MIN    = 50

DATASET_DEFAULT_FORMAT     = "preference"
DATASET_EXPORT_CONVERSATIONAL = False

JUDGE_PASS_GRADE = 75
JUDGE_FAIL_GRADE = 50
JUDGE_GEN_INSTRUCTION = (
    "You are a strict grader. Given the task and the answer, reply PASS if the answer fully and "
    "correctly satisfies the task, otherwise FAIL.\n\n[Task]: {prompt}\n[Answer]: {answer}\n[Verdict]:")
JUDGE_CLS_TEMPLATE = "[Task]: {prompt}\n[Answer]: {answer}"