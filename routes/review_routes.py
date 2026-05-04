import os
import re
import json
import logging
from datetime import datetime, timezone
from flask import session, redirect, url_for, jsonify, request, render_template

from config import (
    DOWNLOADS_DIR, CATEGORY_WEIGHTS, LEDGER_FILE, BESTBEST_CACHE,
    ITERATION_HISTORY_FILE, DEFAULT_LAYER1A_MODEL, DEFAULT_LAYER1B_MODEL,
    DEFAULT_LAYER0_MODEL, DEFAULT_LAYER2_MODEL, LAYER3_GRADER_MODELS,
    CONSOLE_OUTPUT_FILE
)
from utils.file_io import save_json, clear_file
from utils.text_processing import extract_prompts_from_console, extract_all_best_best_from_console
from utils.session import (
    set_large_session_data, get_current_model_selection, set_previous_model_selection
)
from routes import api_bp


def parse_chat_backup_filename(filename):
    try:
        name_without_ext = filename.replace('.json', '')
        iso_match = re.search(r'(\d{4})-(\d{2})-(\d{2})T', name_without_ext)
        if iso_match:
            date_str = f"{iso_match.group(1)}-{iso_match.group(2)}-{iso_match.group(3)}"
            return filename, date_str
        
        parts = name_without_ext.split('_')
        if len(parts) >= 4 and parts[0] == 'chat' and parts[1] == 'backup':
            timestamp_str = parts[-1]
            try:
                timestamp = int(timestamp_str)
                dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
                readable_time = dt.strftime('%Y-%m-%d %H:%M:%S UTC')
            except (ValueError, OSError):
                readable_time = "Unknown time"
            return filename, readable_time
    except Exception:
        pass
    return filename, "Unknown time"


def get_chat_files_from_backup():
    if not os.path.exists(DOWNLOADS_DIR):
        return []
    
    chat_files = []
    try:
        for filename in os.listdir(DOWNLOADS_DIR):
            if filename.startswith('chat_backup_') and filename.endswith('.json'):
                filepath = os.path.join(DOWNLOADS_DIR, filename)
                try:
                    mtime = os.path.getmtime(filepath)
                    chat_files.append((filename, mtime))
                except OSError:
                    pass
    except OSError:
        pass
    
    chat_files.sort(key=lambda x: x[1], reverse=True)
    return [f[0] for f in chat_files]


def analyze_chat_backup(filename):
    filepath = os.path.join(DOWNLOADS_DIR, filename)
    prompts_data = {}
    first_prompt_text = None
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        _, file_timestamp = parse_chat_backup_filename(filename)
        if file_timestamp < '2025-11-26':
            return {}, None, 'default', {}
        
        prompt_history = data.get('prompt_history', [])
        ledger_entries = data.get('ledger_entries', [])
        iteration_history = data.get('iteration_history', {})
        session_data = data.get('session_data', {})
        weights = session_data.get('current_weights', CATEGORY_WEIGHTS.copy())
        chat_grader_setting_name = session_data.get('grader_setting_name', 'default')
        
        if len(prompt_history) > 0:
            first_prompt_text = prompt_history[0] if isinstance(prompt_history[0], str) else None
        
        console_output = data.get('console_output', '')
        
        if first_prompt_text is None and console_output:
            extracted_prompts = extract_prompts_from_console(console_output)
            if extracted_prompts:
                first_prompt_text = extracted_prompts[0]
        
        found_any_data = False
        prompts_from_history = iteration_history.get('prompts', {}) if isinstance(iteration_history, dict) else {}
        best_best_cache = data.get('best_best_cache', {})
        
        for prompt_key, prompt_data in prompts_from_history.items():
            if not isinstance(prompt_data, dict):
                continue
            
            prompt_num = prompt_data.get('prompt_number', prompt_key.replace('prompt_', 'unknown'))
            prompt_str = str(prompt_num)
            
            prompt_text = None
            
            prompt_idx = int(prompt_str) if prompt_str.isdigit() else 0
            if not prompt_text and prompt_idx > 0 and 0 <= prompt_idx - 1 < len(prompt_history):
                retrieved = prompt_history[prompt_idx - 1]
                if retrieved and isinstance(retrieved, str) and retrieved.strip():
                    prompt_text = retrieved
            
            if not prompt_text:
                cache_entry = best_best_cache.get(str(prompt_num)) or best_best_cache.get(prompt_num)
                if cache_entry and isinstance(cache_entry, dict) and 'prompt' in cache_entry:
                    cached_prompt = str(cache_entry['prompt']).strip()
                    if cached_prompt:
                        prompt_text = cached_prompt[:500]
            
            if not prompt_text and ledger_entries:
                for entry in ledger_entries:
                    if isinstance(entry, dict) and str(entry.get('prompt_number', '')) == prompt_str and entry.get('prompt'):
                        prompt_text = str(entry['prompt']).strip()[:500]
                        break
            
            if not prompt_text and console_output:
                pattern = rf'🎯\s*STARTING\s+ANALYSIS\s+FOR\s+PROMPT\s*#\s*{re.escape(prompt_str)}[\s\S]*?PROMPT:\s*(.+?)(?:\n|$)'
                match = re.search(pattern, console_output)
                if match:
                    extracted = match.group(1).strip()[:500]
                    if extracted:
                        prompt_text = extracted
            
            if not prompt_text:
                prompt_text = 'Prompt not available'
            
            iterations = prompt_data.get('iterations', [])
            if not iterations:
                continue
            
            found_any_data = True
            iteration_stats = []
            best_best_iteration = None
            
            for idx, iteration in enumerate(iterations, 1):
                if not isinstance(iteration, dict):
                    continue
                
                best_score = iteration.get('best_score', 0)
                is_best_best = iteration.get('is_best_best', False)
                
                layer1a_score = float(iteration.get('layer1a_score', 0) or 0)
                layer1b_score = float(iteration.get('layer1b_score', 0) or 0)
                layer1a_model_used = iteration.get('layer1a_model_used', 'Unknown')
                layer1b_model_used = iteration.get('layer1b_model_used', 'Unknown')
                
                winner_raw = str(iteration.get('winner', '')).strip().lower()
                if winner_raw in ('original', 'improved'):
                    winner = winner_raw
                else:
                    winner = "improved" if layer1b_score >= layer1a_score else "original"
                best_grades = iteration.get('layer1a_grades', {}) if winner == "original" else iteration.get('layer1b_grades', {})
                model_used = layer1a_model_used if winner == "original" else layer1b_model_used
                
                scores = {}
                for gk, gv in best_grades.items():
                    scores[gk] = float(gv or 0)
                
                iter_stat = {
                    'iteration': iteration.get('iteration', idx),
                    'scores': scores,
                    'average': float(best_score) if best_score else 0,
                    'runtime': iteration.get('total_runtime', 0),
                    'model_used': model_used,
                    'layer1a_score': layer1a_score,
                    'layer1b_score': layer1b_score,
                    'layer1a_model_used': layer1a_model_used,
                    'layer1b_model_used': layer1b_model_used,
                    'is_best_best': is_best_best,
                    'winner': winner,
                    'layer1a_grades': iteration.get('layer1a_grades', {}),
                    'layer1b_grades': iteration.get('layer1b_grades', {}),
                    'layer1a_time': iteration.get('layer1a_time', 0),
                    'layer1b_time': iteration.get('layer1b_time', 0),
                    'layer1a_tokens': iteration.get('layer1a_tokens', 0),
                    'layer1b_tokens': iteration.get('layer1b_tokens', 0),
                    'token_data': iteration.get('token_data', {})
                }
                iteration_stats.append(iter_stat)
                
                if is_best_best:
                    best_best_iteration = iteration
            
            if iteration_stats:
                if best_best_iteration:
                    best_best_layer1a = best_best_iteration.get('layer1a_grades', {})
                    best_best_layer1b = best_best_iteration.get('layer1b_grades', {})
                    best_best_layer1a_score = float(best_best_iteration.get('layer1a_score', 0) or 0)
                    best_best_layer1b_score = float(best_best_iteration.get('layer1b_score', 0) or 0)
                    best_best_winner_raw = str(best_best_iteration.get('winner', '')).strip().lower()
                    if best_best_winner_raw in ('original', 'improved'):
                        best_best_winner = best_best_winner_raw
                    else:
                        best_best_winner = "improved" if best_best_layer1b_score >= best_best_layer1a_score else "original"
                    best_best_scores = best_best_layer1a if best_best_winner == "original" else best_best_layer1b
                    best_best_avg = best_best_iteration.get('best_score', 0)
                    best_best_model = best_best_iteration.get('layer1a_model_used', 'Unknown') if best_best_winner == "original" else best_best_iteration.get('layer1b_model_used', 'Unknown')
                else:
                    best_best_scores = {}
                    best_best_avg = 0
                    best_best_model = ''
                
                prompts_data[prompt_str] = {
                    'prompt_text': prompt_text,
                    'iteration_count': len(iterations),
                    'best_best_average': best_best_avg,
                    'best_best_scores': best_best_scores,
                    'best_best_model': best_best_model,
                    'total_runtime': sum(s['runtime'] for s in iteration_stats),
                    'iterations': iteration_stats
                }
        
        if not found_any_data:
            prompts_data['0'] = {
                'prompt_text': 'No data available',
                'iteration_count': 0,
                'best_best_average': 0,
                'best_best_scores': {},
                'total_runtime': 0,
                'iterations': []
            }
        
        re_enumerated = {}
        for idx, (key, data) in enumerate(prompts_data.items(), 1):
            re_enumerated[str(idx)] = data
        prompts_data = re_enumerated
        
    except Exception as e:
        logging.error(f"Error analyzing chat backup {filename}: {e}")
        return {}, None, 'default', {}
    
    return prompts_data, first_prompt_text, chat_grader_setting_name, weights


def restore_chat_data_to_session(chat_data):
    restored_items = []
    
    try:
        logging.info(f"Starting restore with paths: CONSOLE={CONSOLE_OUTPUT_FILE}, ITER={ITERATION_HISTORY_FILE}, BEST={BESTBEST_CACHE}, LEDGER={LEDGER_FILE}")
        console_output = chat_data.get('console_output', '')
        prompt_history = chat_data.get('prompt_history', [])
        all_prompt_results = chat_data.get('all_prompt_results', [])
        iteration_history = chat_data.get('iteration_history', {})
        best_best_cache = chat_data.get('best_best_cache', {})
        ledger_entries = chat_data.get('ledger_entries', [])
        session_data = chat_data.get('session_data', {})
        
        if console_output and isinstance(console_output, str) and console_output.strip():
            logging.info(f"Writing to {CONSOLE_OUTPUT_FILE}")
            with open(CONSOLE_OUTPUT_FILE, "w", encoding="utf-8") as f:
                f.write(console_output)
            restored_items.append("console_output")
            logging.info(f"Console output written successfully")
        
        restored_prompt_history = None
        if isinstance(prompt_history, list) and prompt_history:
            restored_prompt_history = prompt_history
        elif console_output:
            extracted_prompts = extract_prompts_from_console(console_output)
            if extracted_prompts:
                restored_prompt_history = extracted_prompts
        
        if not restored_prompt_history and iteration_history and isinstance(iteration_history, dict):
            prompts_dict = iteration_history.get('prompts', {})
            if prompts_dict:
                num_prompts = len(prompts_dict)
                restored_prompt_history = [''] * num_prompts
        
        if restored_prompt_history:
            session['prompt_history'] = restored_prompt_history
            session.modified = True
            restored_items.append(f"prompt_history ({len(restored_prompt_history)} prompts)")
            print(f"[DEBUG RESTORE] Set session['prompt_history'] to {len(restored_prompt_history)} items: {restored_prompt_history}")
        else:
            print(f"[DEBUG RESTORE] WARNING: prompt_history NOT SET! (prompt_history={prompt_history}, console_output={bool(console_output)}, iteration_history={bool(iteration_history)})")
        
        if all_prompt_results and isinstance(all_prompt_results, list):
            restored_items.append("all_prompt_results")
        
        print(f"[DEBUG RESTORE] iteration_history type={type(iteration_history)}, keys={list(iteration_history.keys()) if isinstance(iteration_history, dict) else 'N/A'}, prompts={iteration_history.get('prompts') if isinstance(iteration_history, dict) else 'N/A'}")
        if iteration_history and isinstance(iteration_history, dict) and iteration_history.get('prompts'):
            save_json(iteration_history, ITERATION_HISTORY_FILE)
            restored_items.append("iteration_history")
            print(f"[DEBUG RESTORE] Saved iteration_history to FILE with {len(iteration_history.get('prompts', {}))} prompts")
        
        if best_best_cache and isinstance(best_best_cache, dict):
            save_json(best_best_cache, BESTBEST_CACHE)
            restored_items.append("best_best_cache")
        
        if ledger_entries and isinstance(ledger_entries, list):
            existing_entries = []
            if os.path.exists(LEDGER_FILE):
                with open(LEDGER_FILE, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip():
                            try:
                                existing_entries.append(json.loads(line))
                            except json.JSONDecodeError:
                                continue
            
            for entry in ledger_entries:
                if "runtime_in_sec" not in entry:
                    entry["runtime_in_sec"] = entry.pop("elapsed_time", 0)
            
            all_entries = existing_entries + ledger_entries
            with open(LEDGER_FILE, "w", encoding="utf-8") as f:
                for entry in all_entries:
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            restored_items.append("ledger_entries")
        
        if session_data:
            session['layer1a_model'] = session_data.get('layer1a_model', DEFAULT_LAYER1A_MODEL)
            session['layer1b_model'] = session_data.get('layer1b_model', DEFAULT_LAYER1B_MODEL)
            session['layer0_model'] = session_data.get('layer0_model', DEFAULT_LAYER0_MODEL)
            session['layer2_model'] = session_data.get('layer2_model', DEFAULT_LAYER2_MODEL)
            session['layer3_graders'] = session_data.get('layer3_graders', dict(LAYER3_GRADER_MODELS))
            session['custom_weights'] = session_data.get('current_weights', {})
            set_large_session_data('advanced_layer1a_models', session_data.get('advanced_layer1a_models', {}))
            set_large_session_data('advanced_layer1b_models', session_data.get('advanced_layer1b_models', {}))
            set_large_session_data('advanced_layer2_models', session_data.get('advanced_layer2_models', {}))
            session['degradation_break_enabled'] = session_data.get('degradation_break_enabled', True)
            session['change_prompt_between_layers1'] = session_data.get('change_prompt_between_layers1', True)
            session['give_ideas_enabled'] = session_data.get('give_ideas_enabled', True)
            session['layer1_last_best_context_enabled'] = session_data.get('layer1_last_best_context_enabled', True)
            loaded_grade_vs_prompt_mode = str(session_data.get('grade_vs_prompt_mode', 'current')).strip().lower()
            session['grade_vs_prompt_mode'] = loaded_grade_vs_prompt_mode if loaded_grade_vs_prompt_mode in ('first', 'current') else 'current'
            session['min_grade'] = session_data.get('min_grade', 100)
            session['max_iterations'] = session_data.get('max_iterations', 5)
            loaded_grader_setting = session_data.get('grader_setting_name', 'default')
            from utils.grader_settings import grader_setting_exists
            if grader_setting_exists(loaded_grader_setting):
                session['grader_setting_name'] = loaded_grader_setting
            else:
                session['grader_setting_name'] = 'default'
        
        session.modified = True
        set_previous_model_selection(get_current_model_selection())
        
        return {'success': True, 'restored_items': restored_items}
    except Exception as e:
        logging.error(f"Error restoring chat data: {e}")
        return {'success': False, 'error': str(e)}


@api_bp.route('/review_chats')
def review_chats():
    if 'user' not in session:
        return redirect(url_for('api.login'))
    
    return render_template('review.html')


@api_bp.route('/get_chat_stats', methods=['GET'])
def get_chat_stats():
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    chat_files = get_chat_files_from_backup()
    chats_data = []
    
    for filename in chat_files:
        prompts_data, first_prompt_text, chat_gsn, chat_weights = analyze_chat_backup(filename)
        _, timestamp = parse_chat_backup_filename(filename)
        
        if not prompts_data:
            continue
        
        display_name = first_prompt_text if first_prompt_text else "Chat"
        
        chats_data.append({
            'filename': filename,
            'display_name': display_name,
            'timestamp': timestamp,
            'prompts_data': prompts_data,
            'grader_setting_name': chat_gsn or 'default',
            'saved_weights': chat_weights or {}
        })
    
    return jsonify({'success': True, 'chats': chats_data})


@api_bp.route('/load_chat_from_review', methods=['POST'])
def load_chat_from_review():
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        filename = data.get('filename', '')
        
        if not filename or not filename.startswith('chat_backup_') or not filename.endswith('.json'):
            return jsonify({'success': False, 'message': 'Invalid filename'})
        
        filepath = os.path.join(DOWNLOADS_DIR, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'success': False, 'message': 'File not found'})
        
        with open(filepath, 'r', encoding='utf-8') as f:
            chat_data = json.load(f)
        
        clear_file(LEDGER_FILE)
        clear_file(BESTBEST_CACHE)
        clear_file(ITERATION_HISTORY_FILE)
        clear_file(CONSOLE_OUTPUT_FILE)
        
        result = restore_chat_data_to_session(chat_data)
        
        if result['success']:
            prompt_history = session.get('prompt_history', [])
            last_prompt = prompt_history[-1] if prompt_history else ''
            prompt_count = len(prompt_history)
            print(f"[DEBUG LOAD_CHAT] Loaded chat - prompt_history length={prompt_count}, items={prompt_history}")
            iteration_hist = session.get('iteration_history', {})
            iter_prompts = iteration_hist.get('prompts', {}) if isinstance(iteration_hist, dict) else {}
            print(f"[DEBUG LOAD_CHAT] iteration_history has {len(iter_prompts)} prompts: {list(iter_prompts.keys())}")
            logging.info(f"[LOAD_CHAT] Loaded chat with {prompt_count} prompts from history")
            response = jsonify({
                'success': True, 
                'message': 'Chat loaded successfully',
                'last_prompt': last_prompt,
                'prompt_count': prompt_count,
                'layer1a_model': session.get('layer1a_model', DEFAULT_LAYER1A_MODEL),
                'layer1b_model': session.get('layer1b_model', DEFAULT_LAYER1B_MODEL),
                'layer0_model': session.get('layer0_model', DEFAULT_LAYER0_MODEL),
                'layer2_model': session.get('layer2_model', DEFAULT_LAYER2_MODEL),
                'layer3_graders': session.get('layer3_graders', dict(LAYER3_GRADER_MODELS)),
                'layer1_last_best_context_enabled': session.get('layer1_last_best_context_enabled', True),
                'grade_vs_prompt_mode': session.get('grade_vs_prompt_mode', 'current'),
                'grader_setting_name': session.get('grader_setting_name', 'default')
            })
            session.modified = True
            return response
        else:
            return jsonify({'success': False, 'message': result.get('error', 'Failed to load chat')})
    
    except Exception as e:
        logging.error(f"Error loading chat from review: {e}")
        return jsonify({'success': False, 'message': str(e)})


@api_bp.route('/delete_chat_file', methods=['POST'])
def delete_chat_file():
    if 'user' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        filename = data.get('filename', '')
        
        if not filename or not filename.startswith('chat_backup_') or not filename.endswith('.json'):
            return jsonify({'success': False, 'message': 'Invalid filename'})
        
        filepath = os.path.join(DOWNLOADS_DIR, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'success': False, 'message': 'File not found'})
        
        os.remove(filepath)
        return jsonify({'success': True, 'message': 'Chat deleted successfully'})
    
    except Exception as e:
        logging.error(f"Error deleting chat file: {e}")
        return jsonify({'success': False, 'message': 'Error deleting chat'})


@api_bp.route('/upload_chat_json', methods=['POST'])
def upload_chat_json():
    if not session.get('logged_in', False):
        return jsonify({'success': False, 'error': 'Not authenticated'})
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Invalid JSON data'})
        
        chat_data = data.get('chat_data', {})
        if not chat_data:
            return jsonify({'success': False, 'error': 'No chat data provided'})
        
        result = restore_chat_data_to_session(chat_data)
        
        if result['success']:
            restored_items = result['restored_items']
            success_message = f'Chat restored successfully! Restored {len(restored_items)} data items'
            return jsonify({'success': True, 'message': success_message, 'restored_items': restored_items})
        else:
            return jsonify({'success': False, 'error': result.get('error', 'Failed to restore chat')})
    
    except Exception as e:
        logging.error(f"Error uploading chat JSON: {e}", exc_info=True)
        return jsonify({'success': False, 'error': f'Upload failed: {str(e)[:100]}'})
