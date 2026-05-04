#!/usr/bin/env python3

import os
import json
import logging
import shutil
from datetime import datetime
from typing import Optional
from flask import session

from config import (
    LEDGER_FILE, BESTBEST_CACHE, BACKUP_DIR, ITERATION_HISTORY_FILE,
    CONSOLE_OUTPUT_FILE, CATEGORY_WEIGHTS
)
from utils.common import utc_now_iso
from utils.session import (
    get_session_weights, get_session_layer1a_model, get_session_layer1b_model,
    get_session_layer0_model, get_session_layer2_model, get_layer3_grader_models,
    get_advanced_layer1a_models, get_advanced_layer1b_models, get_advanced_layer2_models,
    get_degradation_break_enabled, get_change_prompt_between_layers1, get_give_ideas_enabled,
    get_layer1_last_best_context_enabled, get_grade_vs_prompt_mode,
    get_grader_setting_name
)

def append_to_ledger(entry: dict):
    entry.setdefault("timestamp", utc_now_iso())
    try:
        with open(LEDGER_FILE, "a", encoding="utf-8", buffering=1) as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            f.flush()
    except Exception as e:
        logging.error(f"Failed to append to ledger: {e}")

def save_json(entry: dict, path: str):
    try:
        if not entry:
            if os.path.exists(path):
                os.remove(path)
            return

        if not isinstance(entry, dict):
            logging.warning(f"save_json: entry is not a dict, type={type(entry)}, skipping")
            return
        
        dir_path = os.path.dirname(path)
        if dir_path and not os.path.exists(dir_path):
            try:
                os.makedirs(dir_path, exist_ok=True)
            except OSError as e:
                if e.errno != 17:
                    raise
        
        temp_path = path + ".tmp"
        try:
            with open(temp_path, "w", encoding="utf-8", buffering=1) as f:
                json.dump(entry, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, path)
            logging.debug(f"Saved JSON to {path} ({len(str(entry))} bytes)")
        except Exception:
            try:
                os.remove(temp_path)
            except Exception as cleanup_err:
                logging.warning(f"Failed to remove temp file {temp_path}: {cleanup_err}")
            raise
    except Exception as e:
        logging.error(f"Failed to save JSON to {path}: {e}")

def load_json(path: str) -> Optional[dict]:
    try:
        if not os.path.exists(path):
            logging.debug(f"JSON file does not exist: {path}")
            return None
        
        file_size = os.path.getsize(path)
        if file_size == 0:
            logging.debug(f"JSON file is empty: {path}")
            return None
        
        if file_size > 10 * 1024 * 1024:
            logging.error(f"JSON file too large ({file_size} bytes): {path}")
            return None
        
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                logging.debug(f"JSON file has no content: {path}")
                return None
            
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                logging.warning(f"JSON file does not contain a dict: {path}, type={type(parsed)}")
                return None
            
            logging.debug(f"Loaded JSON from {path} ({len(content)} bytes)")
            return parsed
    except json.JSONDecodeError as e:
        logging.error(f"Failed to parse JSON from {path} (JSONDecodeError): {e}")
        return None
    except Exception as e:
        logging.error(f"Failed to load JSON from {path}: {e}", exc_info=True)
    return None

def backup_file(src: str, prefix: str):
    if os.path.exists(src):
        file_size = os.path.getsize(src)
        if file_size > 0:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            script_name = os.path.splitext(os.path.basename(__file__ if '__file__' in globals() else 'backup'))[0]
            dst = os.path.join(BACKUP_DIR, f"{prefix}_{script_name}_{timestamp}_{os.path.basename(src)}")
            try: 
                shutil.copy2(src, dst)
                logging.info(f"Backed up {src} to {dst}")
            except Exception as e: 
                logging.error(f"Backup failed for {src}: {e}")
        else:
            logging.info(f"Skipped backup for {src} (empty file)")

def clear_file(path: str):
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write("")
        logging.info(f"Cleared file {path} - ready for fresh start")
    except Exception as e:
        logging.error(f"Failed to clear file {path}: {e}")

def backup_chat_json(prefix: str):
    try:
        if not os.path.exists(CONSOLE_OUTPUT_FILE):
            return
        
        with open(CONSOLE_OUTPUT_FILE, "r", encoding="utf-8") as f:
            console_output = f.read()
        
        if not console_output.strip():
            logging.info(f"Skipped chat JSON backup for '{prefix}' (console output empty)")
            return
        
        os.makedirs(BACKUP_DIR, exist_ok=True)
        
        ledger_entries = []
        if os.path.exists(LEDGER_FILE):
            try:
                with open(LEDGER_FILE, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip():
                            try:
                                ledger_entries.append(json.loads(line))
                            except json.JSONDecodeError:
                                continue
            except Exception as e:
                logging.debug(f"Error reading ledger for backup: {e}")
        
        chat_data = {
            "console_output": console_output,
            "prompt_history": session.get('prompt_history', []) if 'prompt_history' in session else [],
            "all_prompt_results": session.get('all_prompt_results', []) if 'all_prompt_results' in session else [],
            "iteration_history": load_json(ITERATION_HISTORY_FILE) or {},
            "best_best_cache": load_json(BESTBEST_CACHE) or {},
            "ledger_entries": ledger_entries,
            "session_data": {
                "current_weights": get_session_weights(),
                "layer1a_model": get_session_layer1a_model(),
                "layer1b_model": get_session_layer1b_model(),
                "layer0_model": get_session_layer0_model(),
                "layer2_model": get_session_layer2_model(),
                "layer3_graders": get_layer3_grader_models(),
                "advanced_layer1a_models": get_advanced_layer1a_models(),
                "advanced_layer1b_models": get_advanced_layer1b_models(),
                "advanced_layer2_models": get_advanced_layer2_models(),
                "degradation_break_enabled": get_degradation_break_enabled(),
                "change_prompt_between_layers1": get_change_prompt_between_layers1(),
                "give_ideas_enabled": get_give_ideas_enabled(),
                "layer1_last_best_context_enabled": get_layer1_last_best_context_enabled(),
                "grade_vs_prompt_mode": get_grade_vs_prompt_mode(),
                "grader_setting_name": get_grader_setting_name(),
                "min_grade": session.get('min_grade', 100),
                "max_iterations": session.get('max_iterations', 5)
            },
            "timestamp": utc_now_iso(),
            "version": "2.0"
        }
        
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        script_name = os.path.splitext(os.path.basename(__file__))[0]
        backup_filename = os.path.join(BACKUP_DIR, f"chat_backup_{prefix}_{script_name}_{timestamp}.json")
        
        with open(backup_filename, "w", encoding="utf-8") as f:
            json.dump(chat_data, f, ensure_ascii=False, indent=2)
        
        logging.info(f"✅ Chat JSON backed up to {backup_filename}")
        print(f"✅ Chat JSON backed up to {backup_filename}")
    except Exception as e:
        logging.error(f"Failed to backup chat JSON for '{prefix}': {e}")

def rotate_ledger():
    if os.path.exists(LEDGER_FILE):
        backup_file(LEDGER_FILE, "ledger")
        clear_file(LEDGER_FILE)

def save_console_output(text: str):
    try:
        with open(CONSOLE_OUTPUT_FILE, "a", encoding="utf-8", buffering=1) as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
    except Exception as e:
        logging.error(f"Failed to save console output: {e}")

def load_console_output() -> str:
    try:
        if os.path.exists(CONSOLE_OUTPUT_FILE):
            with open(CONSOLE_OUTPUT_FILE, "r", encoding="utf-8") as f:
                content = f.read()
                if content:
                    return content
    except Exception as e:
        logging.error(f"Failed to load console output: {e}")
    return ""

def save_iteration_history(prompt_num: int, iteration_data_list: list, tools_token_usage: dict = None):
    try:
        print(f"[DEBUG] save_iteration_history called: prompt_num={prompt_num}, iterations={len(iteration_data_list)}, path={ITERATION_HISTORY_FILE}")
        history = load_json(ITERATION_HISTORY_FILE) or {"prompts": {}}
        
        if "prompts" not in history:
            history["prompts"] = {}
            
        prompt_key = f"prompt_{prompt_num}"
        if prompt_key not in history["prompts"]:
            history["prompts"][prompt_key] = {"iterations": [], "prompt_number": prompt_num}
            
        history["prompts"][prompt_key]["iterations"] = iteration_data_list
        if tools_token_usage:
            history["prompts"][prompt_key]["tools_token_usage"] = tools_token_usage
        save_json(history, ITERATION_HISTORY_FILE)
        print(f"✅ Saved {len(iteration_data_list)} iterations for Prompt #{prompt_num} to {ITERATION_HISTORY_FILE}")
        
    except Exception as e:
        logging.error(f"Failed to save iteration history: {e}")

def get_iteration_history() -> dict:
    return load_json(ITERATION_HISTORY_FILE) or {"prompts": {}}
