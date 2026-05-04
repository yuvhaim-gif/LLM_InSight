import os
import json
import logging
from typing import Optional

from config import GRADERDATA_DIR, CATEGORY_WEIGHTS, LAYER3_GRADER_MODELS


def _ensure_graderdata_dir():
    os.makedirs(GRADERDATA_DIR, exist_ok=True)


def list_grader_settings():
    _ensure_graderdata_dir()
    names = []
    for f in os.listdir(GRADERDATA_DIR):
        if f.endswith(".jsonl"):
            names.append(os.path.splitext(f)[0])
    if "default" not in names:
        names.insert(0, "default")
    else:
        names.remove("default")
        names.insert(0, "default")
    return names


def load_grader_setting(name: str) -> Optional[list]:
    _ensure_graderdata_dir()
    filepath = os.path.join(GRADERDATA_DIR, f"{name}.jsonl")
    if not os.path.exists(filepath):
        return None
    entries = []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    except Exception as e:
        logging.error(f"Error loading grader setting '{name}': {e}")
        return None
    return entries


def save_grader_setting(name: str, entries: list) -> bool:
    _ensure_graderdata_dir()
    filepath = os.path.join(GRADERDATA_DIR, f"{name}.jsonl")
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return True
    except Exception as e:
        logging.error(f"Error saving grader setting '{name}': {e}")
        return False


def grader_setting_exists(name: str) -> bool:
    filepath = os.path.join(GRADERDATA_DIR, f"{name}.jsonl")
    return os.path.exists(filepath)


def get_grader_config(name: str) -> dict:
    entries = load_grader_setting(name)
    if not entries:
        return {
            "rubrics": {k: v for k, v in _default_rubrics().items()},
            "grader_models": dict(LAYER3_GRADER_MODELS),
            "weights": dict(CATEGORY_WEIGHTS),
            "keys": list(CATEGORY_WEIGHTS.keys()),
        }

    rubrics = {}
    grader_models = {}
    weights = {}
    keys = []
    for entry in entries:
        key = entry.get("key", "")
        if key:
            keys.append(key)
            rubrics[key] = entry.get("rubric", "")
            grader_models[key] = entry.get("grader", "")
            w = entry.get("weight")
            if w is not None:
                try:
                    weights[key] = float(w)
                except (ValueError, TypeError):
                    weights[key] = None

    num_keys = len(keys)
    if not weights or any(v is None for v in weights.values()):
        equal_weight = round(1.0 / num_keys, 4) if num_keys > 0 else 0
        weights = {k: equal_weight for k in keys}

    return {
        "rubrics": rubrics,
        "grader_models": grader_models,
        "weights": weights,
        "keys": keys,
    }


def _default_rubrics():
    from ai.layer3 import CATEGORY_RUBRICS
    return dict(CATEGORY_RUBRICS)
