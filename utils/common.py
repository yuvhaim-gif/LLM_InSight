#!/usr/bin/env python3

import os
import sys
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional, List

_RE_CODE_FENCE = re.compile(r'^\s*```\s*(?:json)?\s*|\s*```\s*$', re.IGNORECASE)
_RE_JSON_OBJECTS = re.compile(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}')

ERROR_PREFIXES = (
    "[OLLAMA_TIMEOUT]", "[OLLAMA_ERROR]", "[GOOGLE_TIMEOUT]",
    "[GOOGLE_ERROR]", "[MISTRAL_TIMEOUT]", "[MISTRAL_ERROR]",
    "[GLM_TIMEOUT]", "[GLM_ERROR]"
)

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def safe_print(*args, **kwargs):
    try:
        print(*args, **kwargs)
        sys.stdout.flush()
    except Exception as e:
        logging.error(f"[PRINT_ERROR] Failed to print: {e}")

def try_parse_json(text: str) -> Optional[dict]:
    if not text: return None
    cleaned = _RE_CODE_FENCE.sub('', text).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        first_brace = cleaned.find('{')
        if first_brace != -1:
            possible_json = cleaned[first_brace:]
            try:
                return json.loads(possible_json)
            except json.JSONDecodeError:
                pass
        matches = _RE_JSON_OBJECTS.findall(cleaned)
        for match in reversed(matches):
            try:
                parsed = json.loads(match)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                continue
    return None

def normalize_score(value) -> int:
    try:
        val = float(value)
        val = max(1, min(100, round(val)))
        return int(val)
    except (ValueError, TypeError):
        return 1

def compute_score(grade: dict, weights: Optional[dict] = None) -> int:
    from config import CATEGORY_WEIGHTS

    if isinstance(weights, dict) and weights:
        active_weights = {}
        for key in weights:
            try:
                parsed = float(weights[key])
                active_weights[key] = parsed if parsed >= 0 else 0
            except (ValueError, TypeError):
                active_weights[key] = 0
        if not active_weights or sum(active_weights.values()) <= 0:
            active_weights = CATEGORY_WEIGHTS.copy()
    else:
        active_weights = CATEGORY_WEIGHTS.copy()

    total_weight = sum(active_weights.values())
    if total_weight <= 0:
        active_weights = CATEGORY_WEIGHTS.copy()
        total_weight = sum(active_weights.values())

    weighted_sum = sum(grade.get(k, 50) * active_weights.get(k, 0) for k in active_weights)
    return round(weighted_sum / total_weight) if total_weight else 50

def is_failed_iteration_entry(entry: Optional[dict]) -> bool:
    if not entry:
        return True
    score = entry.get("overall_score", 0)
    if score == 1:
        return True
    reply = entry.get("layer1_reply", "")
    if not reply:
        return True
    if str(reply).startswith(ERROR_PREFIXES):
        return True
    return False

def is_layer1_error_or_timeout(layer1_entry: dict) -> bool:
    if not layer1_entry:
        return True
    reply = layer1_entry.get("layer1_reply", "")
    if not reply:
        return True
    return str(reply).startswith(ERROR_PREFIXES)

def create_failed_grade_entry(layer1_entry: dict, grade_tag: str, combined_prompts: List[str], prompt_num: int, active_keys: list = None) -> dict:
    from config import CATEGORY_WEIGHTS
    if active_keys:
        default_grade = {k: 1 for k in active_keys}
    else:
        default_grade = {k: 1 for k in CATEGORY_WEIGHTS}
    overall = compute_score(default_grade)
    
    graded_entry = layer1_entry.copy()
    graded_entry.update({
        "grade": default_grade,
        "overall_score": overall,
        "grade_tag": grade_tag,
        "layer": "Layer3",
        "feedback": "[Layer1 error/timeout - Layer3 skipped, using default grade 1]",
        "raw_grader_output": "[LAYER3_SKIPPED_DUE_TO_LAYER1_ERROR]",
        "prompt_number": prompt_num
    })
    return graded_entry

def get_traceable():
    try:
        from langsmith import traceable
        return traceable
    except ImportError:
        def dummy_traceable(*args, **kwargs):
            if len(args) == 1 and callable(args[0]):
                return args[0]
            return lambda f: f
        return dummy_traceable

traceable = get_traceable()
