#!/usr/bin/env python3

import logging
from typing import List, Tuple

def validate_input_string(value: str, field_name: str = "input", max_length: int = 10000, allow_empty: bool = False) -> Tuple[bool, str]:
    try:
        if not isinstance(value, str):
            return False, f"{field_name} must be a string"
        
        if not allow_empty and not value.strip():
            return False, f"{field_name} cannot be empty"
        
        if len(value) > max_length:
            return False, f"{field_name} exceeds maximum length of {max_length} characters"
        
        return True, value.strip()
    except Exception as e:
        logging.error(f"Error validating {field_name}: {e}")
        return False, str(e)

def validate_integer(value, field_name: str = "value", min_val: int = None, max_val: int = None) -> Tuple[bool, int]:
    try:
        if isinstance(value, str):
            value = int(value)
        elif not isinstance(value, int):
            return False, f"{field_name} must be an integer"
        
        if min_val is not None and value < min_val:
            return False, f"{field_name} must be at least {min_val}"
        
        if max_val is not None and value > max_val:
            return False, f"{field_name} must be at most {max_val}"
        
        return True, int(value)
    except Exception as e:
        logging.error(f"Error validating {field_name}: {e}")
        return False, None

def validate_float(value, field_name: str = "value", min_val: float = None, max_val: float = None) -> Tuple[bool, float]:
    try:
        if isinstance(value, str):
            value = float(value)
        elif not isinstance(value, (int, float)):
            return False, f"{field_name} must be a number"
        
        value = float(value)
        if min_val is not None and value < min_val:
            return False, f"{field_name} must be at least {min_val}"
        
        if max_val is not None and value > max_val:
            return False, f"{field_name} must be at most {max_val}"
        
        return True, value
    except Exception as e:
        logging.error(f"Error validating {field_name}: {e}")
        return False, None

def validate_model_name(model: str, valid_models: List[str]) -> Tuple[bool, str]:
    try:
        if not isinstance(model, str) or not model.strip():
            return False, "Model name is empty or invalid"
        
        model = model.strip()
        if model not in valid_models:
            return False, f"Model '{model}' not in approved list"
        
        return True, model
    except Exception as e:
        logging.error(f"Error validating model: {e}")
        return False, None
