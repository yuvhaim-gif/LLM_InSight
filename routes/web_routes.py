import sys
import io
from flask import request, session, redirect, url_for, render_template
from routes import main_bp
from routes.api_routes import check_auth

from config import (
    AVAILABLE_LAYER1A_MODELS, AVAILABLE_LAYER1B_MODELS,
    AVAILABLE_LAYER0_MODELS, AVAILABLE_LAYER2_MODELS,
    CATEGORY_WEIGHTS, AVAILABLE_GRADER_MODELS
)
from utils.file_io import (
    save_console_output, load_console_output, get_iteration_history
)
from utils.session import (
    get_session_layer1a_model, get_session_layer1b_model, get_session_layer0_model,
    get_session_layer2_model, get_layer3_grader_models, get_session_weights,
    get_advanced_layer1a_models, get_advanced_layer1b_models, get_advanced_layer2_models,
    get_degradation_break_enabled, get_change_prompt_between_layers1, get_give_ideas_enabled,
    get_layer1_last_best_context_enabled, get_grade_vs_prompt_mode,
    get_grader_setting_name
)
from utils.grader_settings import list_grader_settings, get_grader_config
from utils.text_processing import extract_all_best_best_from_console, extract_prompts_from_console
from ai.iterative_loop import iterative_loop
import state

@main_bp.route('/', methods=['GET', 'POST'])
def index():
    if not check_auth():
        return redirect(url_for('api.login'))
    
    if 'prompt_history' not in session:
        session['prompt_history'] = []
    
    prompt_history = session.get('prompt_history', [])
    default_prompt = prompt_history[-1] if prompt_history else ''
    console_output = load_console_output()
    
    if request.method == 'GET':
        if 'iteration_history' in session and session.get('iteration_history'):
            iteration_history = session['iteration_history']
            print(f"[DEBUG] iteration_history from SESSION, prompts keys: {list(iteration_history.get('prompts', {}).keys()) if isinstance(iteration_history, dict) else 'not dict'}")
        else:
            iteration_history = get_iteration_history()
            print(f"[DEBUG] iteration_history from FILE, prompts keys: {list(iteration_history.get('prompts', {}).keys()) if isinstance(iteration_history, dict) else 'not dict'}")
    else:
        iteration_history = get_iteration_history()
        print(f"[DEBUG] iteration_history from FILE (POST), prompts keys: {list(iteration_history.get('prompts', {}).keys()) if isinstance(iteration_history, dict) else 'not dict'}")
    
    iterations = []
    if iteration_history and isinstance(iteration_history, dict):
        prompts_data = iteration_history.get('prompts', {})
        if prompts_data:
            last_prompt_key = max(prompts_data.keys(), key=lambda x: int(x.replace('prompt_', '')) if x.startswith('prompt_') else -1)
            last_prompt_data = prompts_data.get(last_prompt_key, {})
            iterations = last_prompt_data.get('iterations', [])
            print(f"[DEBUG] last_prompt_key={last_prompt_key}, iterations count={len(iterations)}")
    
    all_prompt_results = extract_all_best_best_from_console(console_output)
    
    if request.method == 'POST':
        prompt = request.form.get('prompt', '').strip()
        prompt_history_at_submit = session.get('prompt_history', [])
        print(f"[DEBUG POST] Submitting new prompt. Current prompt_history in session: {len(prompt_history_at_submit)} items: {prompt_history_at_submit}")
        min_grade_raw = request.form.get('min_grade', '100')
        max_iterations_raw = request.form.get('max_iterations', '5')
        
        try:
            min_grade = int(min_grade_raw)
            min_grade = max(0, min(100, min_grade))
        except ValueError:
            min_grade = 100
        
        try:
            max_iterations = int(max_iterations_raw)
            max_iterations = max(1, min(5, max_iterations))
        except ValueError:
            max_iterations = 5
        
        session['min_grade'] = min_grade
        session['max_iterations'] = max_iterations
        session.modified = True
        
        if prompt:
            state.is_processing = True
            state.models_executed = 0
            state.current_iteration_value = 1
            
            prompt_history = session.get('prompt_history', [])
            
            original_stdout = sys.stdout
            captured_output = io.StringIO()
            sys.stdout = captured_output
            
            try:
                best_entry, updated_history = iterative_loop(
                    prompt,
                    min_grade=min_grade,
                    max_iterations=max_iterations,
                    prompt_history=prompt_history.copy()
                )
                
                session['prompt_history'] = updated_history
                session.modified = True
                
                console_output = captured_output.getvalue()
                save_console_output(console_output)
                
                iteration_history = get_iteration_history()
                all_prompt_results = extract_all_best_best_from_console(console_output)
                
                if iteration_history and isinstance(iteration_history, dict):
                    prompts_data = iteration_history.get('prompts', {})
                    if prompts_data:
                        last_prompt_key = max(prompts_data.keys(), key=lambda x: int(x.replace('prompt_', '')) if x.startswith('prompt_') else -1)
                        last_prompt_data = prompts_data.get(last_prompt_key, {})
                        iterations = last_prompt_data.get('iterations', [])
                
            except Exception as e:
                console_output = captured_output.getvalue()
                console_output += f"\n\nERROR: {str(e)}"
                save_console_output(console_output)
            finally:
                sys.stdout = original_stdout
                state.is_processing = False
    
    iteration_history = get_iteration_history()
    
    current_layer1a_model = get_session_layer1a_model()
    current_layer1b_model = get_session_layer1b_model()
    current_layer0_model = get_session_layer0_model()
    current_layer2_model = get_session_layer2_model()
    layer3_graders = get_layer3_grader_models()

    grader_setting_name = get_grader_setting_name()
    grader_config = get_grader_config(grader_setting_name)
    available_grader_settings = list_grader_settings()

    current_weights = session.get('custom_weights')
    if not current_weights or not isinstance(current_weights, dict):
        current_weights = grader_config.get('weights', CATEGORY_WEIGHTS.copy())
    else:
        active_keys = set(grader_config.get('keys', list(CATEGORY_WEIGHTS.keys())))
        filtered = {k: v for k, v in current_weights.items() if k in active_keys}
        for k in active_keys:
            if k not in filtered:
                filtered[k] = grader_config['weights'].get(k, 0.1)
        current_weights = filtered

    original_prompts = extract_prompts_from_console(console_output)
    
    return render_template(
        'main.html',
        user=session.get('user', 'Guest'),
        min_grade=session.get('min_grade', 100),
        max_iterations=session.get('max_iterations', 5),
        prompt=default_prompt,
        all_prompt_results=all_prompt_results,
        original_prompts=original_prompts,
        console=console_output,
        iterations=iterations,
        current_layer1a_model=current_layer1a_model,
        available_layer1a_models=AVAILABLE_LAYER1A_MODELS,
        current_layer1b_model=current_layer1b_model,
        available_layer1b_models=AVAILABLE_LAYER1B_MODELS,
        current_layer0_model=current_layer0_model,
        available_layer0_models=AVAILABLE_LAYER0_MODELS,
        current_layer2_model=current_layer2_model,
        available_layer2_models=AVAILABLE_LAYER2_MODELS,
        layer3_graders=grader_config.get('grader_models', layer3_graders),
        iteration_history=iteration_history,
        current_weights=current_weights,
        is_using_custom_weights=session.get('custom_weights') is not None,
        category_weights=CATEGORY_WEIGHTS,
        advanced_layer1a_models=get_advanced_layer1a_models(),
        advanced_layer1b_models=get_advanced_layer1b_models(),
        advanced_layer2_models=get_advanced_layer2_models(),
        degradation_break_enabled=get_degradation_break_enabled(),
        change_prompt_between_layers1=get_change_prompt_between_layers1(),
        give_ideas_enabled=get_give_ideas_enabled(),
        layer1_last_best_context_enabled=get_layer1_last_best_context_enabled(),
        grade_vs_prompt_mode=get_grade_vs_prompt_mode(),
        prompt_count=len(session.get('prompt_history', [])),
        grader_setting_name=grader_setting_name,
        available_grader_settings=available_grader_settings
    )


@main_bp.route('/config_graders')
def config_graders():
    if not check_auth():
        return redirect(url_for('api.login'))
    
    grader_setting_name = get_grader_setting_name()
    grader_config = get_grader_config(grader_setting_name)
    available_settings = list_grader_settings()
    
    return render_template(
        'config_graders.html',
        user=session.get('user', 'Guest'),
        grader_setting_name=grader_setting_name,
        available_grader_settings=available_settings,
        available_grader_models=AVAILABLE_GRADER_MODELS,
        grader_config=grader_config
    )
