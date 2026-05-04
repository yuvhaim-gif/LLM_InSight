#!/usr/bin/env python3

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

from secrets_config import ADMIN_USER, ADMIN_PASS, FLASK_SECRET, LANGCHAIN_API_KEY, LANGCHAIN_PROJECT

PORT = int(os.environ.get("PORT", 5000))
SSL_CERT_PATH = os.environ.get("SSL_CERT_PATH", "")
SSL_KEY_PATH = os.environ.get("SSL_KEY_PATH", "")

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

LEDGER_FILE = os.path.join(BASE_DIR, "ledger.jsonl")
BESTBEST_CACHE = os.path.join(BASE_DIR, "best_best_layer1.json")
BACKUP_DIR = os.path.join(BASE_DIR, "backup")
ITERATION_HISTORY_FILE = os.path.join(BASE_DIR, "iteration_history.json")
CONSOLE_OUTPUT_FILE = os.path.join(BASE_DIR, "console_output.txt")
DOWNLOADS_DIR = os.path.join(os.path.expanduser("~"), "Downloads")

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