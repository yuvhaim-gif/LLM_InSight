from typing import Optional

from utils.text_processing import extract_answer_text
from utils.common import compute_score, utc_now_iso
from utils.file_io import save_json
from config import BESTBEST_CACHE


def resolve_ties_and_save(all_entries, best_score_so_far, best_best_entry, current_prompt_num):
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

    return tied_best_entries, cache_data


def print_model_usage_summary(current_prompt_num, iteration_count, iteration_models_used):
    print(f"\n{'='*80}")
    print(f"\U0001f4ca MODEL USAGE SUMMARY FOR PROMPT #{current_prompt_num}")
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


def print_final_summary(current_prompt_num, iteration_count, iteration_scores, ab_test_results,
                        tied_best_entries, best_score_so_far, best_best_entry,
                        last_iteration_best, session_weights):
    print(f"\n{'='*80}")
    print(f"\U0001f3c1 FINAL SUMMARY FOR PROMPT #{current_prompt_num}")
    print(f"{'='*80}")
    print(f"Total iterations completed: {iteration_count}")
    print(f"Iteration scores: {iteration_scores}")
    print(f"AB Test Results: {ab_test_results}")
    
    if len(tied_best_entries) > 1:
        print(f"\n\U0001f3c6 TIE DETECTED! {len(tied_best_entries)} entries with best score {best_score_so_far}:")
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
            
            print(f"\n\U0001f3c6 TIED BEST #{i} FOR PROMPT #{current_prompt_num}:")
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
            print(f"\n\U0001f3c6 FINAL BEST-BEST ANSWER FOR PROMPT #{current_prompt_num} DISPLAY:")
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
                print(f"\n\U0001f3c6 BEST-BEST ANSWER FOUND FOR PROMPT #{current_prompt_num}:")
                print(f"   Score: {best_score}")
                print(f"   Grade Breakdown: {grade_dict}")
                print(f"   From: Iteration {best_iteration}, {best_type}")
                print(f"   Model: {best_model}")
                if best_feedback:
                    print(f"   Feedback: {best_feedback}")
                text_preview = best_best_text[:200] + ('...' if len(best_best_text) > 200 else '')
                print(f"   Preview: {text_preview}")
                
                print(f"\n\U0001f3c6 FINAL BEST-BEST ANSWER FOR PROMPT #{current_prompt_num} DISPLAY:")
                print(f"Score: {best_score} | From: Iteration {best_iteration}, {best_type} | Model: {best_model}")
                print("=" * 60)
                print(f"FULL ANSWER:")
                print(best_best_text)
                print("=" * 60)
            
            if is_problematic:
                fallback_text = best_best_entry.get("layer1_reply", "")
                if fallback_text:
                    print(f"\n\U0001f504 FALLBACK ANSWER (Raw layer1_reply) FOR PROMPT #{current_prompt_num}:")
                    print(f"Score: {best_score} | From: Iteration {best_iteration}, {best_type} | Model: {best_model}")
                    print("=" * 60)
                    print(f"FULL ANSWER:")
                    print(fallback_text)
                    print("=" * 60)
                else:
                    print(f"\n\u26a0\ufe0f WARNING: Best-best entry exists but no displayable content found for PROMPT #{current_prompt_num}")
                    print(f"Entry keys: {list(best_best_entry.keys())}")
        else:
            print(f"\u274c CRITICAL: No best-best answer was generated for PROMPT #{current_prompt_num}")
            print("This should not happen in normal operation")
            if last_iteration_best:
                print(f"\n\U0001f198 EMERGENCY FALLBACK - Using last iteration best for PROMPT #{current_prompt_num}:")
                fallback_text = extract_answer_text(last_iteration_best)
                print(f"Score: {last_iteration_best.get('overall_score', 'N/A')}")
                print(f"Answer: {fallback_text}")
    
    print(f"\n{'='*80}")
    print(f"\u2705 COMPLETED ANALYSIS FOR PROMPT #{current_prompt_num}")
    print(f"{'='*80}\n")
