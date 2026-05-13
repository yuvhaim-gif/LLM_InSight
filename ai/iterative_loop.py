import sys
import gc
import logging
import os
from typing import List, Optional, Dict
from flask import session

# LangChain/LangSmith Integration
from utils.common import (
    utc_now_iso, compute_score, is_failed_iteration_entry, 
    is_layer1_error_or_timeout, create_failed_grade_entry,
    traceable
)

from config import (
    BESTBEST_CACHE, ITERATION_HISTORY_FILE, 
    LANGCHAIN_API_KEY, LANGCHAIN_PROJECT
)
from models import Layer2Response, Layer2Critique
from utils.file_io import load_json, save_json, save_iteration_history
from utils.text_processing import extract_answer_text
from utils.session import (
    get_session_layer0_model, get_session_layer1a_model, get_session_layer1b_model,
    get_advanced_layer1a_models, get_advanced_layer1b_models, get_advanced_layer2_models,
    get_session_weights, get_degradation_break_enabled, get_change_prompt_between_layers1,
    get_give_ideas_enabled, get_layer1_last_best_context_enabled, get_grade_vs_prompt_mode,
    is_advanced_mode_active
)
import state

from ai.layer0 import layer0_micro_replies
from ai.layer1 import layer1_generate_reply
from ai.layer2 import layer2_improve_prompt
from ai.layer3 import layer3_grade

# Environment variables for LangSmith now handled in config.py

def _aggregate_token_usage(iteration_history_data: List[dict], layer0_token_info: dict) -> dict:
    tools_usage = {}
    
    for iter_data in iteration_history_data:
        token_data = iter_data.get("token_data", {})
        for layer_name in ["layer1a", "layer1b"]:
            layer_tokens = token_data.get(layer_name, {})
            if layer_tokens and "tool" in layer_tokens:
                tool = layer_tokens.get("tool", "unknown")
                tools_usage[tool] = tools_usage.get(tool, {})
                tools_usage[tool]["input_tokens"] = tools_usage[tool].get("input_tokens", 0) + layer_tokens.get("input_tokens", 0)
                tools_usage[tool]["output_tokens"] = tools_usage[tool].get("output_tokens", 0) + layer_tokens.get("output_tokens", 0)
    
    for tool in tools_usage:
        tools_usage[tool]["total_tokens"] = tools_usage[tool].get("input_tokens", 0) + tools_usage[tool].get("output_tokens", 0)
    
    return tools_usage

@traceable(run_type="chain", name="Iterative Analysis Loop")
def iterative_loop(prompt: str, min_grade: float, max_iterations: int = 5, 
                    prompt_history: Optional[List[str]] = None):
    if prompt_history is None:
        prompt_history = []
    
    iteration_history_file = load_json(ITERATION_HISTORY_FILE) or {}
    num_prompts_in_file = len(iteration_history_file.get('prompts', {}))
    
    is_second_prompt = len(prompt_history) >= 1
    prev_prompt = prompt_history[-1] if is_second_prompt else None
    
    current_prompt_num = len(prompt_history) + 1
    print(f"[DEBUG ITERATIVE_LOOP] prompt_history={prompt_history}, len={len(prompt_history)}")
    print(f"[DEBUG ITERATIVE_LOOP] file has {num_prompts_in_file} prompts: {list(iteration_history_file.get('prompts', {}).keys())}")
    logging.info(f"[PROMPT_NUM] session_history={len(prompt_history)}, file_prompts={num_prompts_in_file}, current_prompt_num={current_prompt_num}")
    
    prompt_history.append(prompt)
    session['prompt_history'] = prompt_history
    session.modified = True
    
    adv_layer1a = get_advanced_layer1a_models()
    adv_layer1b = get_advanced_layer1b_models()
    adv_layer2 = get_advanced_layer2_models()
    default_layer1a = get_session_layer1a_model()
    default_layer1b = get_session_layer1b_model()
    layer0_model = get_session_layer0_model()
    session_weights = get_session_weights() # Capture weights once per loop
    layer1_last_best_context_enabled = get_layer1_last_best_context_enabled()
    grade_vs_prompt_mode = get_grade_vs_prompt_mode()
    try:
        from utils.grader_settings import get_grader_config
        from utils.session import get_grader_setting_name
        _gc = get_grader_config(get_grader_setting_name())
        active_keys = _gc.get('keys', None)
    except Exception:
        active_keys = None
    iteration_models_used = {}

    print(f"\n{'='*80}")
    print(f"🎯 STARTING ANALYSIS FOR PROMPT #{current_prompt_num}")
    print(f"{'='*80}")
    print(f"PROMPT: {prompt}")
    
    is_advance_active = is_advanced_mode_active()
    
    print(f"\n📋 MODE: {'⚙️ ADVANCE MODE ACTIVE' if is_advance_active else '🤖 DEFAULT MODE'}")
    print(f"\n📋 MODEL CONFIGURATION:")
    print(f"  Layer0 Model: {layer0_model}")
    print(f"  Layer1A Default: {default_layer1a}")
    print(f"  Layer1B Default: {default_layer1b}")
    
    if is_advance_active:
        print(f"\n📋 ADVANCED MODELS (per-iteration):")
        if adv_layer1a:
            layer1a_models_str = ", ".join([f"Iter{k}: {v}" for k, v in sorted(adv_layer1a.items())])
            print(f"  Layer1A: {layer1a_models_str}")
        if adv_layer1b:
            layer1b_models_str = ", ".join([f"Iter{k}: {v}" for k, v in sorted(adv_layer1b.items())])
            print(f"  Layer1B: {layer1b_models_str}")
        if adv_layer2:
            layer2_models_str = ", ".join([f"Iter{k}: {v}" for k, v in sorted(adv_layer2.items())])
            print(f"  Layer2: {layer2_models_str}")
    
    print(f"\n⚖️ Weights: {session_weights}")
    print(f"{'='*80}")

    best_best_entry: Optional[dict] = None
    last_iteration_best: Optional[dict] = None
    last_iteration_best_for_layer2: Optional[dict] = None
    layer1_context_accumulated = ""
    layer1_improved_context = ""
    
    iteration_scores = []
    all_entries = []

    best_best_context = None
    if is_second_prompt:
        cached_best_best = load_json(BESTBEST_CACHE)
        if cached_best_best:
            if isinstance(cached_best_best, dict) and 'best_best_entry' in cached_best_best and isinstance(cached_best_best['best_best_entry'], dict):
                best_best_context = extract_answer_text(cached_best_best['best_best_entry'])
            else:
                best_best_context = extract_answer_text(cached_best_best)
            print(f"\n================ PROMPT {current_prompt_num} - LOADED BEST-BEST CONTEXT FOR LAYER 0 ================")
            context_preview = best_best_context[:200] + ('...' if len(best_best_context) > 200 else '')
            print(f"Previous best answer loaded: {context_preview}")

    layer0_token_info = {}
    if get_give_ideas_enabled():
        # Tracing Layer 0
        micro_replies, layer0_prompt, layer0_token_info = layer0_micro_replies(
            prompt, 
            prev_prompt=prev_prompt, 
            is_second_prompt=is_second_prompt,
            best_best_context=best_best_context,
            prompt_num=current_prompt_num,
            layer0_model=layer0_model
        )
    else:
        print(f"\n================ PROMPT {current_prompt_num} - LAYER 0 SKIPPED (Give Ideas is OFF) ================")
        micro_replies = []
        layer0_prompt = ""
    ab_test_results = []

    iteration_history_data = []
    best_score_so_far = 0
    all_tools_token_usage = {}

    session_id = state._get_session_id()

    for iteration_count in range(1, max_iterations + 1):
        state.set_current_iteration_value(iteration_count, session_id)
        state.get_iteration_event(session_id).set()
        
        iteration_layer1a_model = adv_layer1a.get(str(iteration_count)) or default_layer1a
        iteration_layer1b_model = adv_layer1b.get(str(iteration_count)) or default_layer1b
        
        print(f"\n{'='*60}")
        print(f"🔄 PROMPT #{current_prompt_num} - ITERATION {iteration_count}")
        print(f"{'='*60}")
        print(f"📍 Models for this iteration:")
        print(f"   Layer1A (original): {iteration_layer1a_model}")
        print(f"   Layer1B (improved): {iteration_layer1b_model}")
        print(f"{'='*60}")
        
        layer1_context = layer1_context_accumulated if layer1_last_best_context_enabled else ""
        if layer1_last_best_context_enabled and iteration_count > 1 and last_iteration_best:
            layer1_context = f"[Last Iteration Best Answer]:\n{last_iteration_best['layer1_reply']}\n" + layer1_context

        logging.info(f"[ITERATION_START] PROMPT #{current_prompt_num}, ITERATION {iteration_count}")
        
        graded_orig = None
        orig = None
        
        print(f"⏳ [LAYER1A_START] Starting Layer1A call...")
        prev_layer1a_model = iteration_models_used.get(f"iter_{iteration_count-1}_layer1a")
        # Tracing Layer 1A
        orig = layer1_generate_reply(
            prompt, iteration_count, layer1_context, "original", current_prompt_num, prev_layer1a_model
        )
        iteration_models_used[f"iter_{iteration_count}_layer1a"] = orig.get("model_used")
        
        logging.info(f"[LAYER1A_DONE] Layer1A completed for iteration {iteration_count}")
        if is_layer1_error_or_timeout(orig):
            logging.error(f"[LAYER1A_ERROR] Layer1A failed/timeout, skipping Layer3 grading")
            print(f"⚠️ [LAYER3_SKIP] Layer1A failed/timeout - Layer3 will not run, assigning grade 1")
            graded_orig = create_failed_grade_entry(orig, "original", prompt_history, current_prompt_num, active_keys=active_keys)
            logging.info(f"[LAYER3_SKIPPED] Layer3 skipped for Layer1A due to Layer1 error/timeout")
        else:
            print(f"⏳ [LAYER3_GRADE_START] Starting Layer3 grading for Layer1A...")
            # Tracing Layer 3 Grade A
            graded_orig = layer3_grade(
                orig,
                "original",
                combined_prompts=prompt_history,
                prompt_num=current_prompt_num,
                score_weights=session_weights,
                prompt_reference_mode=grade_vs_prompt_mode
            )
            logging.info(f"[LAYER3_GRADE_DONE] Layer3 grading completed for Layer1A")
        if layer1_last_best_context_enabled:
            layer1_context_accumulated += f"\n[Iteration {iteration_count} Layer1 original reply]:\n{orig['layer1_reply']}\n"
        
        all_entries.append(graded_orig)

        ignore_best = iteration_count == 1
        change_prompt_setting = get_change_prompt_between_layers1()
        
        improved_prompt_to_use = prompt
        layer2_resp = None
        
        if change_prompt_setting:
            try:
                logging.info(f"[LAYER2_START] Starting Layer2 prompt improvement...")
                print(f"⏳ [LAYER2_START] Starting Layer2 prompt improvement...")
                
                # Tracing Layer 2
                layer2_resp = layer2_improve_prompt(
                    prompt,
                    combined_prompts=prompt_history,
                    layer1_reply=graded_orig["layer1_reply"],
                    layer3_feedback=graded_orig, # Passing full grading object
                    best_best_reply=best_best_entry['layer1_reply'] if best_best_entry else "",
                    last_iteration_reply=last_iteration_best_for_layer2['layer1_reply'] if last_iteration_best_for_layer2 else "",
                    micro_replies=micro_replies,
                    layer0_prompt=layer0_prompt,
                    ignore_best=ignore_best,
                    prev_prompt=prev_prompt,
                    is_second_prompt=is_second_prompt and iteration_count == 1,
                    prompt_num=current_prompt_num,
                    iteration_count=iteration_count,
                    weights=session_weights # Passing weights for priority alignment
                )
                improved_prompt_to_use = layer2_resp.improved_prompt
                if not improved_prompt_to_use or improved_prompt_to_use.strip() == prompt.strip():
                    logging.info(f"[LAYER2_NO_CHANGE] Layer2 did not return different prompt, using original")
                    print(f"ℹ️  Layer2 returned same/empty prompt, using original prompt")
                    improved_prompt_to_use = prompt
                logging.info(f"[LAYER2_DONE] Layer2 completed")
            except KeyboardInterrupt:
                raise
            except Exception as e:
                logging.error(f"[LAYER2_ERROR] Error in Layer2 for iteration {iteration_count}: {e}", exc_info=True)
                print(f"⚠️  [LAYER2_SKIP] Layer2 failed or timed out, using original prompt for Layer1B: {str(e)[:100]}")
                improved_prompt_to_use = prompt
                layer2_resp = Layer2Response(improved_prompt=prompt, critique=Layer2Critique(issues=["Layer2 failed or timed out"], suggestions=[], verdict="LAYER2_ERROR"))
        else:
            improved_prompt_to_use = prompt
            layer2_resp = Layer2Response(improved_prompt=prompt, critique=Layer2Critique(issues=[], suggestions=[], verdict="Change Prompt disabled - using original prompt"))
            logging.info(f"[LAYER2_SKIPPED] Layer2 skipped (Change Prompt disabled)")
        
        layer1_improved_ctx = layer1_improved_context if layer1_last_best_context_enabled else ""
        if layer1_last_best_context_enabled and iteration_count > 1 and last_iteration_best:
            layer1_improved_ctx = f"[Last Iteration Best Answer]:\n{last_iteration_best['layer1_reply']}\n" + layer1_improved_ctx
        
        logging.info(f"[LAYER1B_START] Starting Layer1B call...")
        print(f"⏳ [LAYER1B_START] Starting Layer1B call...")
        prev_layer1b_model = iteration_models_used.get(f"iter_{iteration_count-1}_layer1b")
        # Tracing Layer 1B
        improved = layer1_generate_reply(
            improved_prompt_to_use, iteration_count, context=layer1_improved_ctx, type_tag="improved", prompt_num=current_prompt_num, prev_model_used=prev_layer1b_model
        )
        iteration_models_used[f"iter_{iteration_count}_layer1b"] = improved.get("model_used")
        
        logging.info(f"[LAYER1B_DONE] Layer1B completed")
        if is_layer1_error_or_timeout(improved):
            logging.error(f"[LAYER1B_ERROR] Layer1B failed/timeout, skipping Layer3 grading")
            print(f"⚠️ [LAYER3_SKIP] Layer1B failed/timeout - Layer3 will not run, assigning grade 1")
            graded_improved = create_failed_grade_entry(improved, "improved", prompt_history, current_prompt_num, active_keys=active_keys)
            logging.info(f"[LAYER3_SKIPPED] Layer3 skipped for Layer1B due to Layer1 error/timeout")
        else:
            print(f"⏳ [LAYER3_GRADE_START] Starting Layer3 grading for Layer1B...")
            # Tracing Layer 3 Grade B
            graded_improved = layer3_grade(
                improved,
                "improved",
                combined_prompts=prompt_history,
                prompt_num=current_prompt_num,
                score_weights=session_weights,
                prompt_reference_mode=grade_vs_prompt_mode
            )
            logging.info(f"[LAYER3_GRADE_DONE] Layer3 grading completed for Layer1B")
        if layer1_last_best_context_enabled:
            layer1_improved_context += f"\n[Iteration {iteration_count} Layer1 improved reply]:\n{improved['layer1_reply']}\n"
        
        all_entries.append(graded_improved)
        
        if not change_prompt_setting:
            print(f"ℹ️ Layer1B: Using original prompt (Change Prompt is OFF)")

        try:
            orig_score = graded_orig.get("overall_score", 1) if graded_orig else 1
            improved_score = graded_improved.get("overall_score", 1) if graded_improved else 1
            
            print(f"\n================ PROMPT {current_prompt_num} - AB TEST RESULTS - ITERATION {iteration_count} ================")
            print(f"Original Score: {orig_score}")
            print(f"Improved Score: {improved_score}")
            sys.stdout.flush()
            
            ab_result = {
                "iteration": iteration_count,
                "original_score": orig_score,
                "improved_score": improved_score,
                "winner": "improved" if improved_score > orig_score else "original"
            }
            ab_test_results.append(ab_result)
            print(f"Winner: {ab_result['winner'].upper()}")
            print("=" * 60)
            sys.stdout.flush()
            logging.info(f"[ITERATION_COMPARISON] Iteration {iteration_count} - Original: {orig_score}, Improved: {improved_score}")
        except Exception as e:
            logging.error(f"[AB_TEST_ERROR] Error in AB test comparison: {e}")
            sys.stdout.flush()

        try:
            orig_score = graded_orig.get("overall_score", 1) if graded_orig else 1
            improved_score = graded_improved.get("overall_score", 1) if graded_improved else 1
            
            iteration_best = graded_improved if improved_score >= orig_score else graded_orig
            iteration_best_score = iteration_best.get("overall_score", 1) if iteration_best else 1
            iteration_scores.append(iteration_best_score)
            logging.info(f"[ITERATION_BEST] Best score for iteration {iteration_count}: {iteration_best_score}")
        except Exception as e:
            logging.error(f"[ITERATION_BEST_ERROR] Error calculating iteration best: {e}")
            iteration_best = graded_orig or graded_improved
            iteration_best_score = 1
            if iteration_best:
                iteration_best_score = iteration_best.get("overall_score", 1)
            iteration_scores.append(iteration_best_score)
        
        layer1a_model = orig.get("model_used", "Unknown") if orig else "Unknown"
        layer1b_model = improved.get("model_used", "Unknown") if improved else "Unknown"
        
        orig_score = graded_orig.get("overall_score", 1) if graded_orig else 1
        improved_score = graded_improved.get("overall_score", 1) if graded_improved else 1
        
        layer2_prompt = ""
        layer2_issues = []
        layer2_suggestions = []
        layer2_verdict = ""
        layer2_token_info = {}
        if layer2_resp:
            layer2_prompt = layer2_resp.improved_prompt
            layer2_issues = layer2_resp.critique.issues if layer2_resp.critique else []
            layer2_suggestions = layer2_resp.critique.suggestions if layer2_resp.critique else []
            layer2_verdict = layer2_resp.critique.verdict if layer2_resp.critique else ""
            layer2_token_info = layer2_resp.token_info if layer2_resp.token_info else {}
        
        layer1a_token_info = orig.get("token_info", {}) if orig else {}
        layer1b_token_info = improved.get("token_info", {}) if improved else {}
        layer3a_token_info = graded_orig.get("token_info", {}) if graded_orig else {}
        layer3b_token_info = graded_improved.get("token_info", {}) if graded_improved else {}
        
        iteration_token_data = {
            "layer0": layer0_token_info,
            "layer1a": layer1a_token_info,
            "layer1b": layer1b_token_info,
            "layer2": layer2_token_info,
            "layer3a": layer3a_token_info,
            "layer3b": layer3b_token_info
        }
        
        layer1a_total = layer1a_token_info.get("total_tokens", 0)
        layer1b_total = layer1b_token_info.get("total_tokens", 0)
        
        print(f"🔤 [ITERATION {iteration_count}] Layer1A tokens for THIS call: {layer1a_total} (input: {layer1a_token_info.get('input_tokens', 0)}, output: {layer1a_token_info.get('output_tokens', 0)})")
        print(f"🔤 [ITERATION {iteration_count}] Layer1B tokens for THIS call: {layer1b_total} (input: {layer1b_token_info.get('input_tokens', 0)}, output: {layer1b_token_info.get('output_tokens', 0)})")
        
        iteration_data = {
            "iteration": iteration_count,
            "layer1a_score": orig_score,
            "layer1b_score": improved_score,
            "layer1a_grades": graded_orig.get("grade", {}) if graded_orig else {},
            "layer1b_grades": graded_improved.get("grade", {}) if graded_improved else {},
            "layer1a_model_used": layer1a_model,
            "layer1b_model_used": layer1b_model,
            "layer1a_time": orig.get("runtime_in_sec", 0) if orig else 0,
            "layer1b_time": improved.get("runtime_in_sec", 0) if improved else 0,
            "layer1a_tokens": layer1a_total,
            "layer1b_tokens": layer1b_total,
            "winner": "improved" if improved_score >= orig_score else "original",
            "best_score": iteration_best_score,
            "is_best_best": False,
            "prompt_number": current_prompt_num,
            "layer2_improved_prompt": layer2_prompt,
            "layer2_critique": {
                "issues": layer2_issues,
                "suggestions": layer2_suggestions,
                "verdict": layer2_verdict
            },
            "layer3_feedback_original": graded_orig.get("feedback", "") if graded_orig else "",
            "layer3_feedback_improved": graded_improved.get("feedback", "") if graded_improved else "",
            "token_data": iteration_token_data
        }
        
        iteration_history_data.append(iteration_data)

        if iteration_count == 1 or iteration_best_score >= best_score_so_far:
            best_score_so_far = iteration_best_score
            best_best_entry = iteration_best.copy()

        if iteration_best:
            last_iteration_best_for_layer2 = iteration_best.copy()

        if not is_failed_iteration_entry(iteration_best):
            last_iteration_best = iteration_best.copy()
        else:
            logging.warning(f"[ITERATION_FAILED] Not updating last_iteration_best - iteration {iteration_count} had no successful answers")
            if iteration_count == 1:
                print(f"⚠️ Iteration 1 had no successful answers - last_iteration_best remains None")

        cache_data = {
            "best_best_entry": best_best_entry,
            "prompt_number": current_prompt_num,
            "timestamp": utc_now_iso()
        }
        save_json(cache_data, BESTBEST_CACHE)

        current_best_score = best_best_entry["overall_score"] if best_best_entry else 0
        
        if min_grade > 0 and iteration_best_score >= min_grade:
            print(f"\n✅ PROMPT #{current_prompt_num}: Minimal grade {min_grade} reached with score {iteration_best_score}. Stopping loop.")
            best_best_entry = iteration_best.copy()
            best_score_so_far = iteration_best_score
            
            cache_data = {
                "best_best_entry": best_best_entry,
                "prompt_number": current_prompt_num,
                "timestamp": utc_now_iso()
            }
            save_json(cache_data, BESTBEST_CACHE)
            break
            
        degradation_break_enabled = get_degradation_break_enabled()
        if degradation_break_enabled and iteration_count >= 2:
            previous_iteration_score = iteration_scores[-2]
            current_iteration_score = iteration_scores[-1]
            
            if current_iteration_score < previous_iteration_score:
                print(f"\n⚠️ PROMPT #{current_prompt_num}: ITERATION SCORE DECREASED: {previous_iteration_score} → {current_iteration_score}")
                print(f"🛑 STOPPING to prevent degradation. Best-Best remains from iteration with score {best_score_so_far}")
                break
        elif iteration_count >= 2:
            previous_iteration_score = iteration_scores[-2]
            current_iteration_score = iteration_scores[-1]
            if current_iteration_score < previous_iteration_score:
                print(f"\n⚠️ PROMPT #{current_prompt_num}: ℹ️ ITERATION SCORE DECREASED: {previous_iteration_score} → {current_iteration_score} (degradation break is DISABLED - continuing...)")
        
        print(f"[ITERATION_PROGRESS:{iteration_count}]")
        try:
            sys.stdout.flush()
            logging.info(f"[ITERATION_END] Iteration {iteration_count} completed successfully")
        except Exception as e:
            logging.error(f"[FLUSH_ERROR] Error flushing output: {e}")
        
        try:
            gc.collect()
            logging.debug(f"[MEMORY_CLEANUP] Garbage collection completed for iteration {iteration_count}")
        except Exception as e:
            logging.error(f"[GC_ERROR] Garbage collection failed: {e}")

    for iter_data in iteration_history_data:
        if iter_data["best_score"] == best_score_so_far:
            iter_data["is_best_best"] = True

    all_tools_token_usage = _aggregate_token_usage(iteration_history_data, layer0_token_info)
    
    for iter_data in iteration_history_data:
        iter_data["all_tools_token_usage"] = all_tools_token_usage

    save_iteration_history(current_prompt_num, iteration_history_data, all_tools_token_usage)

    tied_best_entries = [entry for entry in all_entries if entry.get("overall_score") == best_score_so_far]
    
    if len(tied_best_entries) > 1:
        text_to_entries = {}
        for entry in tied_best_entries:
            entry_text = extract_answer_text(entry)
            if entry_text and not entry_text.startswith("[No") and not entry_text.startswith("[Entry exists") and not entry_text.startswith("[From"):
                iteration = entry.get('iteration', 0)
                if entry_text not in text_to_entries or iteration > text_to_entries[entry_text]['iteration']:
                    text_to_entries[entry_text] = entry
        
        tied_best_entries = list(text_to_entries.values())

    cache_data = {
        "best_best_entry": best_best_entry,
        "tied_entries": tied_best_entries,
        "has_ties": len(tied_best_entries) > 1,
        "prompt_number": current_prompt_num,
        "timestamp": utc_now_iso()
    }
    save_json(cache_data, BESTBEST_CACHE)

    print(f"\n{'='*80}")
    print(f"📊 MODEL USAGE SUMMARY FOR PROMPT #{current_prompt_num}")
    print(f"{'='*80}")
    for iter_num in range(1, iteration_count + 1):
        layer1a_model = iteration_models_used.get(f"iter_{iter_num}_layer1a", "N/A")
        layer1b_model = iteration_models_used.get(f"iter_{iter_num}_layer1b")
        print(f"Iteration {iter_num}:")
        print(f"  Layer1A: {layer1a_model}")
        if layer1b_model:
            print(f"  Layer1B: {layer1b_model}")
        else:
            print(f"  Layer1B: [skipped - prompt unchanged]")
    print(f"{'='*80}\n")
    
    print(f"\n{'='*80}")
    print(f"🏁 FINAL SUMMARY FOR PROMPT #{current_prompt_num}")
    print(f"{'='*80}")
    print(f"Total iterations completed: {iteration_count}")
    print(f"Iteration scores: {iteration_scores}")
    print(f"AB Test Results: {ab_test_results}")
    
    if len(tied_best_entries) > 1:
        print(f"\n🏆 TIE DETECTED! {len(tied_best_entries)} entries with best score {best_score_so_far}:")
        for i, entry in enumerate(tied_best_entries, 1):
            entry_text = extract_answer_text(entry)
            entry_grade_dict = entry.get('grade', {})
            if entry_grade_dict:
                entry_score = compute_score(entry_grade_dict, weights=session_weights)
            else:
                entry_score = entry.get('overall_score', 'N/A')
            entry_iteration = entry.get('iteration', 'N/A')
            entry_type = entry.get('type', 'N/A')
            entry_model = entry.get('model_used', 'N/A')
            entry_feedback = entry.get('feedback', '')
            
            print(f"\n🏆 TIED BEST #{i} FOR PROMPT #{current_prompt_num}:")
            print(f"   Score: {entry_score}")
            print(f"   Grade Breakdown: {entry_grade_dict}")
            print(f"   From: Iteration {entry_iteration}, {entry_type}")
            print(f"   Model: {entry_model}")
            if entry_feedback:
                print(f"   Feedback: {entry_feedback}")
            print("=" * 60)
            print(f"FULL ANSWER:")
            print(entry_text)
            print("=" * 60)
        
        first_entry = max(tied_best_entries, key=lambda e: e.get('iteration', 0))
        first_text = extract_answer_text(first_entry)
        first_grade = first_entry.get('grade', {})
        if first_grade:
            first_score = compute_score(first_grade, weights=session_weights)
        else:
            first_score = first_entry.get('overall_score', 'N/A')
        first_iter = first_entry.get('iteration', 'N/A')
        first_type = first_entry.get('type', 'N/A')
        
        if first_text and not first_text.startswith("[No") and not first_text.startswith("[Entry exists") and not first_text.startswith("[From"):
            print(f"\n🏆 FINAL BEST-BEST ANSWER FOR PROMPT #{current_prompt_num} DISPLAY:")
            print(f"Score: {first_score} | From: Iteration {first_iter}, {first_type} | Model: {first_entry.get('model_used', 'N/A')}")
            print("=" * 60)
            print(f"FULL ANSWER:")
            print(first_text)
            print("=" * 60)
    else:
        if best_best_entry and isinstance(best_best_entry, dict):
            best_best_text = extract_answer_text(best_best_entry)
            grade_dict = best_best_entry.get('grade', {})
            if grade_dict:
                best_score = compute_score(grade_dict, weights=session_weights)
            else:
                best_score = best_best_entry.get('overall_score', 'N/A')
            best_iteration = best_best_entry.get('iteration', 'N/A')
            best_type = best_best_entry.get('type', 'N/A')
            best_model = best_best_entry.get('model_used', 'N/A')
            best_feedback = best_best_entry.get('feedback', '')
            
            is_problematic = not best_best_text or best_best_text.startswith("[No") or best_best_text.startswith("[Entry exists") or best_best_text.startswith("[From")
            
            if not is_problematic:
                print(f"\n🏆 BEST-BEST ANSWER FOUND FOR PROMPT #{current_prompt_num}:")
                print(f"   Score: {best_score}")
                print(f"   Grade Breakdown: {grade_dict}")
                print(f"   From: Iteration {best_iteration}, {best_type}")
                print(f"   Model: {best_model}")
                if best_feedback:
                    print(f"   Feedback: {best_feedback}")
                text_preview = best_best_text[:200] + ('...' if len(best_best_text) > 200 else '')
                print(f"   Preview: {text_preview}")
                
                print(f"\n🏆 FINAL BEST-BEST ANSWER FOR PROMPT #{current_prompt_num} DISPLAY:")
                print(f"Score: {best_score} | From: Iteration {best_iteration}, {best_type} | Model: {best_model}")
                print("=" * 60)
                print(f"FULL ANSWER:")
                print(best_best_text)
                print("=" * 60)
            
            if is_problematic:
                fallback_text = best_best_entry.get("layer1_reply", "")
                if fallback_text:
                    print(f"\n🔄 FALLBACK ANSWER (Raw layer1_reply) FOR PROMPT #{current_prompt_num}:")
                    print(f"Score: {best_score} | From: Iteration {best_iteration}, {best_type} | Model: {best_model}")
                    print("=" * 60)
                    print(f"FULL ANSWER:")
                    print(fallback_text)
                    print("=" * 60)
                else:
                    print(f"\n⚠️ WARNING: Best-best entry exists but no displayable content found for PROMPT #{current_prompt_num}")
                    print(f"Entry keys: {list(best_best_entry.keys())}")
        else:
            print(f"❌ CRITICAL: No best-best answer was generated for PROMPT #{current_prompt_num}")
            print("This should not happen in normal operation")
            if last_iteration_best:
                print(f"\n🆘 EMERGENCY FALLBACK - Using last iteration best for PROMPT #{current_prompt_num}:")
                fallback_text = extract_answer_text(last_iteration_best)
                print(f"Score: {last_iteration_best.get('overall_score', 'N/A')}")
                print(f"Answer: {fallback_text}")
    
    print(f"\n{'='*80}")
    print(f"✅ COMPLETED ANALYSIS FOR PROMPT #{current_prompt_num}")
    print(f"{'='*80}\n")
    
    return best_best_entry, prompt_history

__all__ = ['iterative_loop']