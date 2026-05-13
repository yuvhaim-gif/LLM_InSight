import os
import logging
import json
import threading
from flask import request, session, jsonify, redirect, url_for, render_template_string
from routes import api_bp

from config import (
    ADMIN_USER, ADMIN_PASS,
    DEFAULT_LAYER1A_MODEL, DEFAULT_LAYER1B_MODEL, DEFAULT_LAYER0_MODEL,
    DEFAULT_LAYER2_MODEL,
    AVAILABLE_LAYER1A_MODELS, AVAILABLE_LAYER1B_MODELS,
    AVAILABLE_LAYER0_MODELS, AVAILABLE_LAYER2_MODELS,
    CATEGORY_WEIGHTS, LEDGER_FILE, BESTBEST_CACHE, ITERATION_HISTORY_FILE,
    CONSOLE_OUTPUT_FILE, AVAILABLE_GRADER_MODELS
)
from utils.file_io import backup_file, backup_chat_json, clear_file, load_json, load_console_output
from utils.session import (
    get_session_layer1a_model, get_session_layer1b_model, get_session_layer0_model,
    get_session_layer2_model, get_layer3_grader_models, get_session_weights,
    get_advanced_layer1a_models, get_advanced_layer1b_models, get_advanced_layer2_models,
    get_large_session_data, set_large_session_data,
    get_degradation_break_enabled, get_change_prompt_between_layers1, get_give_ideas_enabled,
    get_layer1_last_best_context_enabled, get_grade_vs_prompt_mode,
    get_grader_setting_name, set_grader_setting_name
)
from utils.grader_settings import (
    list_grader_settings, load_grader_setting, save_grader_setting,
    grader_setting_exists, get_grader_config
)
from utils.text_processing import extract_prompts_from_console
from utils.common import utc_now_iso

import state

_LOGIN_TEMPLATE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'templates', 'login.html')
if os.path.exists(_LOGIN_TEMPLATE_PATH):
    with open(_LOGIN_TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        LOGIN_TEMPLATE = f.read()
else:
    LOGIN_TEMPLATE = '<html><body><form method="POST"><input name="username"><input name="password" type="password"><button>Login</button></form></body></html>'

def check_auth():
    return session.get('logged_in', False)

@api_bp.route('/iteration', methods=['GET'])
def get_iteration():
    return jsonify({'iteration': state.get_current_iteration_value()})

@api_bp.route('/iteration-wait', methods=['GET'])
def wait_for_iteration():
    return jsonify({'iteration': state.get_current_iteration_value()})

@api_bp.route('/is-processing', methods=['GET'])
def check_processing():
    return jsonify({'processing': state.get_is_processing(), 'models_executed': state.get_models_executed()})

@api_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        u = request.form.get('username', '')
        p = request.form.get('password', '')
        if u == ADMIN_USER and p == ADMIN_PASS:
            backup_chat_json("login")
            backup_file(CONSOLE_OUTPUT_FILE, "login")
            backup_file(LEDGER_FILE, "login")
            backup_file(BESTBEST_CACHE, "login")
            backup_file(ITERATION_HISTORY_FILE, "login")
            clear_file(CONSOLE_OUTPUT_FILE)
            clear_file(LEDGER_FILE)
            clear_file(BESTBEST_CACHE)
            session['logged_in'] = True
            session['user'] = u
            session['prompt_history'] = []
            session['degradation_break_enabled'] = True
            session['change_prompt_between_layers1'] = True
            session['give_ideas_enabled'] = True
            session['layer1_last_best_context_enabled'] = True
            session['grade_vs_prompt_mode'] = 'current'
            session['grader_setting_name'] = 'default'
            session['min_grade'] = 100
            session['max_iterations'] = 5
            session.pop('layer1a_model', None)
            session.pop('layer1b_model', None)
            session.pop('layer0_model', None)
            session.pop('layer2_model', None)
            session.pop('custom_weights', None)
            set_large_session_data('advanced_layer1a_models', {})
            set_large_session_data('advanced_layer1b_models', {})
            set_large_session_data('advanced_layer2_models', {})
            state.reset_session_state()
            return redirect(url_for('main.index'))
        return render_template_string(LOGIN_TEMPLATE + '<div class="error-message">Invalid credentials</div>')
    return render_template_string(LOGIN_TEMPLATE)

@api_bp.route('/logout')
def logout():
    print("LOGOUT: Saving session state...")
    backup_file(LEDGER_FILE, "logout")
    backup_file(BESTBEST_CACHE, "logout")
    backup_file(ITERATION_HISTORY_FILE, "logout")
    backup_file(CONSOLE_OUTPUT_FILE, "logout")
    backup_chat_json("logout")
    clear_file(LEDGER_FILE)
    clear_file(BESTBEST_CACHE)
    clear_file(ITERATION_HISTORY_FILE)
    clear_file(CONSOLE_OUTPUT_FILE)
    state.reset_session_state()
    session.clear()
    return redirect(url_for('api.login'))

@api_bp.route('/shutdown-notify', methods=['POST'])
def shutdown_notify():
    return jsonify({'status': 'ok'})

@api_bp.route('/clear_chat', methods=['POST'])
def clear_chat():
    if not check_auth():
        return redirect(url_for('api.login'))
    
    print("[CLEAR_CHAT] Starting cleanup and backup...")
    backup_file(BESTBEST_CACHE, "clear_chat")
    backup_file(LEDGER_FILE, "clear_chat")
    backup_file(ITERATION_HISTORY_FILE, "clear_chat")
    backup_file(CONSOLE_OUTPUT_FILE, "clear_chat")
    backup_chat_json("clear_chat")
    
    clear_file(BESTBEST_CACHE)
    clear_file(LEDGER_FILE)
    clear_file(ITERATION_HISTORY_FILE)
    clear_file(CONSOLE_OUTPUT_FILE)
    
    state.reset_session_state()
    session.clear()
    session['logged_in'] = True
    session['user'] = ADMIN_USER
    session['prompt_history'] = []
    session['all_prompt_results'] = []
    session['degradation_break_enabled'] = True
    session['change_prompt_between_layers1'] = True
    session['give_ideas_enabled'] = True
    session['layer1_last_best_context_enabled'] = True
    session['grade_vs_prompt_mode'] = 'current'
    session['grader_setting_name'] = 'default'
    session['min_grade'] = 100
    session['max_iterations'] = 5
    set_large_session_data('advanced_layer1a_models', {})
    set_large_session_data('advanced_layer1b_models', {})
    set_large_session_data('advanced_layer2_models', {})
    
    import gc
    gc.collect()
    
    print("[CLEAR_CHAT] Chat cleared successfully!")
    
    clear_html = '''
    <html>
    <head><title>Clearing chat...</title></head>
    <body>
    <script>
        localStorage.removeItem('selectedGradeWeights');
        window.location.href = '/';
    </script>
    </body>
    </html>
    '''
    return clear_html

@api_bp.route('/update_layer1a_model', methods=['POST'])
def update_layer1a_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        model = data.get('model', '')
        if model not in AVAILABLE_LAYER1A_MODELS:
            return jsonify({'error': f'Invalid model'}), 400
        session['layer1a_model'] = model
        session.modified = True
        return jsonify({'success': True, 'model': model})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/reset_layer1a_model', methods=['POST'])
def reset_layer1a_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    session.pop('layer1a_model', None)
    return jsonify({'success': True, 'model': DEFAULT_LAYER1A_MODEL})

@api_bp.route('/update_layer1b_model', methods=['POST'])
def update_layer1b_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        model = data.get('model', '')
        if model not in AVAILABLE_LAYER1B_MODELS:
            return jsonify({'error': f'Invalid model'}), 400
        session['layer1b_model'] = model
        session.modified = True
        return jsonify({'success': True, 'model': model})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/reset_layer1b_model', methods=['POST'])
def reset_layer1b_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    session.pop('layer1b_model', None)
    return jsonify({'success': True, 'model': DEFAULT_LAYER1B_MODEL})

@api_bp.route('/update_layer0_model', methods=['POST'])
def update_layer0_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        model = data.get('model', '')
        if model not in AVAILABLE_LAYER0_MODELS:
            return jsonify({'error': f'Invalid model'}), 400
        session['layer0_model'] = model
        session.modified = True
        return jsonify({'success': True, 'model': model})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/reset_layer0_model', methods=['POST'])
def reset_layer0_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    session.pop('layer0_model', None)
    return jsonify({'success': True, 'model': DEFAULT_LAYER0_MODEL})

@api_bp.route('/update_layer2_model', methods=['POST'])
def update_layer2_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        model = data.get('model', DEFAULT_LAYER2_MODEL)
        if model not in AVAILABLE_LAYER2_MODELS:
            return jsonify({'error': f'Invalid model'}), 400
        session['layer2_model'] = model
        session.modified = True
        return jsonify({'success': True, 'model': model})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/reset_layer2_model', methods=['POST'])
def reset_layer2_model():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    session.pop('layer2_model', None)
    return jsonify({'success': True, 'model': DEFAULT_LAYER2_MODEL})

@api_bp.route('/update_weights', methods=['POST'])
def update_weights():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        weights = data.get('weights', {})
        if not weights or not isinstance(weights, dict):
            return jsonify({'error': 'No weights provided'}), 400
        active_config = get_grader_config(get_grader_setting_name())
        expected_keys = set(active_config.get('keys', list(CATEGORY_WEIGHTS.keys())))
        provided_keys = set(weights.keys())
        if expected_keys != provided_keys:
            return jsonify({'error': 'Missing or extra categories'}), 400
        for category, weight in weights.items():
            if not isinstance(weight, (int, float)) or weight < 0 or weight > 1:
                return jsonify({'error': f'Invalid weight for {category}'}), 400
        total = sum(weights.values())
        if total > 0:
            normalized_weights = {k: v/total for k, v in weights.items()}
        else:
            normalized_weights = active_config.get('weights', CATEGORY_WEIGHTS.copy())
        session['custom_weights'] = normalized_weights
        session.modified = True
        return jsonify({'success': True, 'weights': normalized_weights})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/reset_weights', methods=['POST'])
def reset_weights():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    session.pop('custom_weights', None)
    active_config = get_grader_config(get_grader_setting_name())
    return jsonify({'success': True, 'weights': active_config.get('weights', CATEGORY_WEIGHTS)})

@api_bp.route('/get_current_models', methods=['GET'])
def get_current_models():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    return jsonify({
        'success': True,
        'layer1a_model': get_session_layer1a_model(),
        'layer1b_model': get_session_layer1b_model(),
        'layer0_model': get_session_layer0_model(),
        'layer2_model': get_session_layer2_model(),
        'layer3_graders': get_layer3_grader_models()
    })

@api_bp.route('/get_advanced_models', methods=['GET'])
def get_advanced_models():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    layer1a_models = get_advanced_layer1a_models()
    layer1b_models = get_advanced_layer1b_models()
    layer2_models = get_advanced_layer2_models()
    return jsonify({
        'success': True,
        'layer1a': layer1a_models,
        'layer1b': layer1b_models,
        'layer2': layer2_models,
        'layer1a_models': layer1a_models,
        'layer1b_models': layer1b_models,
        'layer2_models': layer2_models
    })

@api_bp.route('/save_advanced_models', methods=['POST'])
def save_advanced_models():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json() or {}
        layer1a_models = data.get('layer1a_models', data.get('layer1a', {}))
        layer1b_models = data.get('layer1b_models', data.get('layer1b', {}))
        layer2_models = data.get('layer2_models', data.get('layer2', {}))
        set_large_session_data('advanced_layer1a_models', layer1a_models)
        set_large_session_data('advanced_layer1b_models', layer1b_models)
        set_large_session_data('advanced_layer2_models', layer2_models)
        session.modified = True
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/clear_advanced_models', methods=['POST'])
def clear_advanced_models():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    set_large_session_data('advanced_layer1a_models', {})
    set_large_session_data('advanced_layer1b_models', {})
    set_large_session_data('advanced_layer2_models', {})
    session.modified = True
    return jsonify({'success': True})

@api_bp.route('/set_degradation_break', methods=['POST'])
def set_degradation_break():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        enabled = data.get('enabled', True)
        session['degradation_break_enabled'] = bool(enabled)
        session.modified = True
        return jsonify({'success': True, 'enabled': session['degradation_break_enabled']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/set_change_prompt_between_layers1', methods=['POST'])
def set_change_prompt_between_layers1():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        enabled = data.get('enabled', True)
        session['change_prompt_between_layers1'] = bool(enabled)
        session.modified = True
        return jsonify({'success': True, 'enabled': session['change_prompt_between_layers1']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/set_give_ideas', methods=['POST'])
def set_give_ideas():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        enabled = data.get('enabled', True)
        session['give_ideas_enabled'] = bool(enabled)
        session.modified = True
        return jsonify({'success': True, 'enabled': session['give_ideas_enabled']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/set_layer1_last_best_context', methods=['POST'])
def set_layer1_last_best_context():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        enabled = data.get('enabled', True)
        session['layer1_last_best_context_enabled'] = bool(enabled)
        session.modified = True
        return jsonify({'success': True, 'enabled': session['layer1_last_best_context_enabled']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/set_grade_vs_prompt_mode', methods=['POST'])
def set_grade_vs_prompt_mode():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json() or {}
        mode = str(data.get('mode', 'current')).strip().lower()
        if mode not in ('first', 'current'):
            return jsonify({'error': 'Invalid mode'}), 400
        session['grade_vs_prompt_mode'] = mode
        session.modified = True
        return jsonify({'success': True, 'mode': mode})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/save_current_selection', methods=['POST'])
def save_current_selection():
    if not check_auth():
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    session.modified = True
    return jsonify({'success': True})

@api_bp.route('/get_backup_data', methods=['GET'])
def get_backup_data():
    if not check_auth():
        return jsonify({'success': False, 'error': 'Not authenticated'}), 401
    
    try:
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
                logging.error(f"Error reading ledger: {e}")
        
        prompt_hist = session.get('prompt_history', [])
        console_output = load_console_output()
        
        if not prompt_hist and console_output:
            extracted_prompts = extract_prompts_from_console(console_output)
            if extracted_prompts:
                prompt_hist = extracted_prompts
                logging.info(f"[BACKUP] Extracted {len(prompt_hist)} prompts from console output (fallback)")
        
        backup_data = {
            'console_output': console_output,
            'prompt_history': prompt_hist,
            'all_prompt_results': session.get('all_prompt_results', []),
            'iteration_history': load_json(ITERATION_HISTORY_FILE) or {},
            'best_best_cache': load_json(BESTBEST_CACHE) or {},
            'ledger_entries': ledger_entries,
            'session_data': {
                'current_weights': get_session_weights(),
                'layer1a_model': get_session_layer1a_model(),
                'layer1b_model': get_session_layer1b_model(),
                'layer0_model': get_session_layer0_model(),
                'layer2_model': get_session_layer2_model(),
                'layer3_graders': get_layer3_grader_models(),
                'advanced_layer1a_models': get_advanced_layer1a_models(),
                'advanced_layer1b_models': get_advanced_layer1b_models(),
                'advanced_layer2_models': get_advanced_layer2_models(),
                'degradation_break_enabled': get_degradation_break_enabled(),
                'change_prompt_between_layers1': get_change_prompt_between_layers1(),
                'give_ideas_enabled': get_give_ideas_enabled(),
                'layer1_last_best_context_enabled': get_layer1_last_best_context_enabled(),
                'grade_vs_prompt_mode': get_grade_vs_prompt_mode(),
                'grader_setting_name': get_grader_setting_name(),
                'min_grade': session.get('min_grade', 100),
                'max_iterations': session.get('max_iterations', 5)
            },
            'timestamp': utc_now_iso(),
            'version': '2.0'
        }
        
        return jsonify({
            'success': True,
            'backup_data': backup_data
        })
    except Exception as e:
        logging.error(f"Error getting backup data: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/grader_settings', methods=['GET'])
def get_grader_settings_list():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    names = list_grader_settings()
    current = get_grader_setting_name()
    return jsonify({'success': True, 'settings': names, 'current': current})


@api_bp.route('/grader_setting/<name>', methods=['GET'])
def get_grader_setting(name):
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    entries = load_grader_setting(name)
    if entries is None:
        return jsonify({'success': False, 'error': 'Setting not found'}), 404
    return jsonify({'success': True, 'name': name, 'entries': entries})


@api_bp.route('/save_grader_setting', methods=['POST'])
def save_grader_setting_route():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        name = data.get('name', '').strip().lower()
        entries = data.get('entries', [])

        if not name:
            return jsonify({'success': False, 'error': 'Name is required'}), 400
        if name == 'default':
            return jsonify({'success': False, 'error': 'Cannot modify the default grader setting'}), 400
        if not entries or not isinstance(entries, list):
            return jsonify({'success': False, 'error': 'Entries are required'}), 400
        if len(entries) > 8:
            return jsonify({'success': False, 'error': 'Maximum 8 grading keys allowed'}), 400

        for entry in entries:
            if not entry.get('key') or not entry.get('rubric') or not entry.get('grader'):
                return jsonify({'success': False, 'error': 'Each entry must have key, rubric, and grader'}), 400
            if entry['grader'] not in AVAILABLE_GRADER_MODELS:
                return jsonify({'success': False, 'error': f'Invalid grader model: {entry["grader"]}'}), 400

        already_exists = grader_setting_exists(name)
        ok = save_grader_setting(name, entries)
        if ok:
            return jsonify({'success': True, 'overwritten': already_exists})
        return jsonify({'success': False, 'error': 'Failed to save'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/set_grader_setting', methods=['POST'])
def set_grader_setting_route():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        data = request.get_json()
        name = data.get('name', 'default').strip().lower()
        if not grader_setting_exists(name):
            name = 'default'
        set_grader_setting_name(name)
        session.pop('custom_weights', None)
        session.modified = True
        config = get_grader_config(name)
        return jsonify({'success': True, 'name': name, 'config': config})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/get_grader_config', methods=['GET'])
def get_active_grader_config_route():
    if not check_auth():
        return jsonify({'error': 'Not authenticated'}), 401
    name = get_grader_setting_name()
    config = get_grader_config(name)
    return jsonify({'success': True, 'name': name, 'config': config})
