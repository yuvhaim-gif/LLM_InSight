#!/usr/bin/env python3

import sys
import json
import logging
from flask import session

from config import (
    DEFAULT_LAYER1A_MODEL, DEFAULT_LAYER1B_MODEL, DEFAULT_LAYER0_MODEL,
    DEFAULT_LAYER2_MODEL, CATEGORY_WEIGHTS, LAYER3_GRADER_MODELS
)
from utils.session_keys import (
    SK_CUSTOM_WEIGHTS, SK_GRADER_SETTING_NAME, SK_LAYER1A_MODEL,
    SK_LAYER1B_MODEL, SK_LAYER0_MODEL, SK_LAYER2_MODEL, SK_LAYER3_GRADERS,
    SK_DEGRADATION_BREAK_ENABLED, SK_CHANGE_PROMPT_BETWEEN_LAYERS1,
    SK_GIVE_IDEAS_ENABLED, SK_LAYER1_LAST_BEST_CONTEXT_ENABLED,
    SK_GRADE_VS_PROMPT_MODE, SK_PREVIOUS_MODEL_SELECTION,
    SK_ADVANCED_LAYER1A_MODELS, SK_ADVANCED_LAYER1B_MODELS,
    SK_ADVANCED_LAYER2_MODELS
)

def _safe_log(*args):
    try:
        logging.debug(' '.join(str(a) for a in args))
    except Exception:
        pass

def get_large_session_data(key: str, default=None):
    return session.get(key, default)

def set_large_session_data(key: str, value):
    session[key] = value
    session.modified = True

def get_session_weights():
    weights = session.get(SK_CUSTOM_WEIGHTS)
    if weights and isinstance(weights, dict):
        _safe_log(f"[Weights] Using custom: {weights}")
        return weights
    from utils.grader_settings import get_grader_config
    gsn = session.get(SK_GRADER_SETTING_NAME, 'default')
    config = get_grader_config(gsn)
    weights = config.get('weights', CATEGORY_WEIGHTS.copy())
    _safe_log(f"[Weights] Using grader config '{gsn}': {weights}")
    return weights

def _get_session_model(session_key: str, default_model: str, layer_name: str):
    selected_model = session.get(session_key, default_model)
    _safe_log(f"[Model] Using {layer_name}: {selected_model}")
    return selected_model

def get_session_layer1a_model():
    return _get_session_model(SK_LAYER1A_MODEL, DEFAULT_LAYER1A_MODEL, 'Layer1A')

def get_session_layer1b_model():
    return _get_session_model(SK_LAYER1B_MODEL, DEFAULT_LAYER1B_MODEL, 'Layer1B')

def get_session_layer0_model():
    return _get_session_model(SK_LAYER0_MODEL, DEFAULT_LAYER0_MODEL, 'Layer0')

def get_session_layer2_model():
    return _get_session_model(SK_LAYER2_MODEL, DEFAULT_LAYER2_MODEL, 'Layer2')

def get_layer3_grader_models():
    from utils.grader_settings import get_grader_config, grader_setting_exists
    gsn = session.get(SK_GRADER_SETTING_NAME, 'default')
    if gsn != 'default' and not grader_setting_exists(gsn):
        session_graders = session.get(SK_LAYER3_GRADERS)
        if session_graders and isinstance(session_graders, dict):
            _safe_log(f"[Model] Using Layer3 graders from session (setting '{gsn}' not found on disk): {session_graders}")
            return session_graders
    config = get_grader_config(gsn)
    graders = config.get('grader_models', dict(LAYER3_GRADER_MODELS))
    _safe_log(f"[Model] Using Layer3 graders ('{gsn}'): {graders}")
    return graders

def _get_advanced_models(key: str):
    return get_large_session_data(key, {})

def get_advanced_layer1a_models():
    return _get_advanced_models(SK_ADVANCED_LAYER1A_MODELS)

def get_advanced_layer1b_models():
    return _get_advanced_models(SK_ADVANCED_LAYER1B_MODELS)

def get_advanced_layer2_models():
    return _get_advanced_models(SK_ADVANCED_LAYER2_MODELS)

def _get_session_bool(key: str, default: bool = True) -> bool:
    return bool(session.get(key, default))

def get_degradation_break_enabled():
    return _get_session_bool(SK_DEGRADATION_BREAK_ENABLED, True)

def get_change_prompt_between_layers1():
    return _get_session_bool(SK_CHANGE_PROMPT_BETWEEN_LAYERS1, True)

def get_give_ideas_enabled():
    return _get_session_bool(SK_GIVE_IDEAS_ENABLED, True)

def get_layer1_last_best_context_enabled():
    return _get_session_bool(SK_LAYER1_LAST_BEST_CONTEXT_ENABLED, True)


def get_grade_vs_prompt_mode():
    mode = str(session.get(SK_GRADE_VS_PROMPT_MODE, 'current')).strip().lower()
    return mode if mode in ('first', 'current') else 'current'

def get_grader_setting_name():
    return session.get(SK_GRADER_SETTING_NAME, 'default')


def set_grader_setting_name(name: str):
    session[SK_GRADER_SETTING_NAME] = name
    session.modified = True


def get_previous_model_selection():
    return session.get(SK_PREVIOUS_MODEL_SELECTION, None)

def set_previous_model_selection(selection_config: dict):
    session[SK_PREVIOUS_MODEL_SELECTION] = selection_config
    session.modified = True

def get_current_model_selection():
    return {
        'layer1a_model': get_session_layer1a_model(),
        'layer1b_model': get_session_layer1b_model(),
        'layer0_model': get_session_layer0_model(),
        'layer2_model': get_session_layer2_model(),
        'layer3_graders': get_layer3_grader_models(),
        'advanced_layer1a_models': get_advanced_layer1a_models(),
        'advanced_layer1b_models': get_advanced_layer1b_models(),
        'advanced_layer2_models': get_advanced_layer2_models(),
        'weights': get_session_weights(),
        'degradation_break': get_degradation_break_enabled(),
        'change_prompt': get_change_prompt_between_layers1(),
        'give_ideas': get_give_ideas_enabled(),
        'layer1_last_best_context': get_layer1_last_best_context_enabled(),
        'grade_vs_prompt_mode': get_grade_vs_prompt_mode(),
        'grader_setting_name': get_grader_setting_name()
    }

def has_selection_changed_since_last_prompt():
    prev_selection = get_previous_model_selection()
    current_selection = get_current_model_selection()
    
    if prev_selection is None:
        return True
    
    return json.dumps(prev_selection, sort_keys=True) != json.dumps(current_selection, sort_keys=True)

def is_advanced_mode_active():
    adv_a = get_advanced_layer1a_models()
    adv_b = get_advanced_layer1b_models()
    adv_layer2 = get_advanced_layer2_models()
    return len(adv_a) > 0 or len(adv_b) > 0 or len(adv_layer2) > 0
