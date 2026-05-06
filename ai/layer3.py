import sys
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from config import CATEGORY_WEIGHTS, LAYER3_GRADER_MODELS
from utils.common import try_parse_json, normalize_score, compute_score, traceable
from utils.file_io import append_to_ledger
from utils.text_processing import clean_text_for_json
from ai.api_calls import call_model, is_error_response

CATEGORY_RUBRICS = {
    "accuracy": (
        "Meaning: factual correctness and technical validity. "
        "High score: claims are correct, verifiable, and aligned with the prompt. "
        "Low score: hallucinations, contradictions, unsupported claims, or technical mistakes."
    ),
    "clarity": (
        "Meaning: readability and unambiguous expression. "
        "High score: clear wording, precise statements, easy to understand on first read. "
        "Low score: vague language, confusing phrasing, unexplained jargon."
    ),
    "conciseness": (
        "Meaning: information density with minimal waste while punishing severely for exeeding length constraints in prompt if there are any."
        "High score: no fluff, no repetition, length fits task constraints."
        "Low score: rambling, filler, redundancy, or avoidable verbosity or exeeding length constraints."
    ),
    "creativity": (
        "Meaning: originality and freshness of ideas. "
        "High score: non-obvious angle, novel synthesis, distinctive insight. "
        "Low score: generic template output, stale phrasing, obvious ideas only."
    ),
    "structure": (
        "Meaning: logical organization and flow. "
        "High score: coherent sequence, smooth transitions, strong opening-to-close progression. "
        "Low score: jumbled order, abrupt jumps, weak framing or closure."
    )
}


def _load_active_grader_config():
    try:
        from utils.session import get_grader_setting_name
        from utils.grader_settings import get_grader_config
        name = get_grader_setting_name()
        config = get_grader_config(name)
        return config
    except Exception:
        return None


def _build_grader_messages(category: str, prompt_text: str, answer_text: str, rubric_override: str = None) -> List[dict]:
    rubric = rubric_override if rubric_override else CATEGORY_RUBRICS.get(category, "Grade only this category.")
    return [
        {"role": "system", "content": (
            f"You are a very strict and harsh grader for ONLY one category: {category}.\n"
            f"Category rubric: {rubric}\n\n"
            "Return ONLY valid JSON with exactly these keys:\n"
            "- \"score\": integer 1-100\n"
            "- \"feedback\": string\n\n"
            "Scoring discipline:\n"
            "The score must be an integer between 1 and 100, with no decimals and no extra text.\n"
            "- 50 means pass for this specific category only (minimum acceptable bar).\n"
            "- 75 means a good answer for this specific category (solid quality with clear room to improve).\n"
            "- 95 means a near-perfect answer for this specific category (exceptional quality with one/two negligible flaw).\n"
            "- 100 is reserved to the impossible divine alone and must not be awarded.\n"
            "- Below 50 means failure for this specific category.\n\n"
            "Rules:\n"
            "1. Evaluate only this category and ignore all others.\n"
            "2. Score must be an integer between 1 and 100.\n"
            "3. The \"feedback\" value is a short grader note — one sentence, like a sticky note a teacher leaves in a margin. "
            "Keep it under 20 words. Do not explain your reasoning, do not list examples, do not quote the prompt or the answer. "
            "Just write your brief verdict on this category.\n"
            "4. No bullets, no markdown, no newline characters in the feedback value.\n"
            "5. Return only the JSON object with no extra text.\n\n"
            "Example of a correct response:\n"
            "{\"score\": 72, \"feedback\": \"Mostly accurate but one unsupported claim weakens the argument.\"}"
        )},
        {"role": "user", "content": (
            f"Category: {category}\n\n"
            f"Prompt:\n{prompt_text}\n\n"
            f"Answer:\n{answer_text}"
        )}
    ]


def _grade_single_category(category: str, model_name: str, prompt_text: str, answer_text: str, max_retries: int = 3, rubric_override: str = None) -> dict:
    if not model_name:
        logging.error(f"[LAYER3_{category.upper()}_CONFIG_ERROR] Missing model mapping")
        return {
            "category": category,
            "model": model_name,
            "score": 50,
            "feedback": f"{category.capitalize()}: grader model missing, defaulted to 50.",
            "raw_output": "[LAYER3_CATEGORY_MODEL_MISSING]",
            "token_info": {},
            "success": False
        }

    safe_max_retries = 3
    try:
        safe_max_retries = max(0, min(3, int(max_retries)))
    except Exception:
        safe_max_retries = 3

    messages = _build_grader_messages(category, prompt_text, answer_text, rubric_override=rubric_override)
    last_resp = ""
    token_info = {}

    for attempt in range(safe_max_retries + 1):
        try:
            attempt_label = f" (Retry {attempt})" if attempt > 0 else ""
            print(f"⏳ Calling Layer3 {category} grader '{model_name}' (timeout: 240s){attempt_label}...")
            sys.stdout.flush()
            response = call_model(model_name, messages, timeout=240)

            resp = response.get("content", "") if isinstance(response, dict) else response
            token_info = response.get("token_info", {}) if isinstance(response, dict) else {}
            last_resp = resp

            if is_error_response(resp):
                if attempt < safe_max_retries:
                    retries_left = safe_max_retries - attempt
                    logging.warning(f"[LAYER3_{category.upper()}_RETRY] Attempt {attempt + 1} failed, retrying (attempts left: {retries_left})...")
                    print(f"⚠️  Layer3 {category} grader attempt failed, retrying...")
                    continue
                break

            obj = try_parse_json(resp)
            if not isinstance(obj, dict):
                logging.warning(f"[LAYER3_{category.upper()}_JSON_PARSE_FAILED] Invalid JSON object response")
                if attempt < safe_max_retries:
                    print(f"⚠️  Layer3 {category} grader JSON parse failed, retrying...")
                    continue
                break

            score = obj.get("score")
            feedback = obj.get("feedback", "")

            if not isinstance(score, int) or isinstance(score, bool) or not (1 <= score <= 100):
                logging.warning(f"[LAYER3_{category.upper()}_INVALID_SCORE] Invalid score: {score}")
                if attempt < safe_max_retries:
                    print(f"⚠️  Layer3 {category} grader returned invalid score, retrying...")
                    continue
                break

            feedback_line = ""
            if feedback:
                feedback_line = clean_text_for_json(str(feedback).replace("\n", " ").replace("\r", " ")).strip()

            return {
                "category": category,
                "model": model_name,
                "score": normalize_score(score),
                "feedback": feedback_line,
                "raw_output": resp,
                "token_info": token_info,
                "success": True
            }

        except KeyboardInterrupt:
            raise
        except Exception as e:
            logging.warning(f"[LAYER3_{category.upper()}_EXCEPTION] Attempt {attempt + 1} exception: {e}")
            if attempt < safe_max_retries:
                print(f"⚠️  Layer3 {category} grader exception: {str(e)[:100]}, retrying...")
                continue
            break

    logging.error(f"[LAYER3_{category.upper()}_EXHAUSTED] Failed after retries, using default score")
    return {
        "category": category,
        "model": model_name,
        "score": 50,
        "feedback": f"{category.capitalize()}: grader failed, defaulted to 50.",
        "raw_output": last_resp if last_resp else "[LAYER3_CATEGORY_FAILED_AFTER_RETRIES]",
        "token_info": token_info,
        "success": False
    }


def _select_prompt_for_grading(combined_prompts: List[str], mode: str) -> str:
    if not isinstance(combined_prompts, list) or not combined_prompts:
        return ""

    if mode == "first":
        ordered = combined_prompts
    else:
        ordered = list(reversed(combined_prompts))

    for item in ordered:
        if isinstance(item, str):
            text = item.strip()
            if text:
                return text

    return ""


@traceable(name="Layer 3: Grading")
def layer3_grade(
    entry: dict,
    grade_tag: str,
    combined_prompts: List[str],
    prompt_num: int = 1,
    max_retries: int = 3,
    score_weights: dict = None,
    prompt_reference_mode: str = "current"
) -> dict:
    normalized_prompt_mode = str(prompt_reference_mode).strip().lower()
    if normalized_prompt_mode not in ("first", "current"):
        normalized_prompt_mode = "current"

    prompt_for_grading = _select_prompt_for_grading(combined_prompts, normalized_prompt_mode)

    full_prompt_text = f"[Prompt]: {prompt_for_grading}"
    answer_text = entry.get("layer1_reply", "")

    grader_config = _load_active_grader_config()
    if grader_config:
        categories = grader_config["keys"]
        active_rubrics = grader_config["rubrics"]
        active_grader_models = grader_config["grader_models"]
    else:
        categories = list(CATEGORY_WEIGHTS.keys())
        active_rubrics = CATEGORY_RUBRICS
        active_grader_models = dict(LAYER3_GRADER_MODELS)

    if any(category not in active_grader_models or not active_grader_models[category] for category in categories):
        missing = [category for category in categories if category not in active_grader_models or not active_grader_models[category]]
        logging.error(f"[LAYER3_CONFIG_ERROR] Missing grader model mapping for categories: {missing}")

    print(f"⏳ Calling Layer3 parallel graders ({len(categories)} categories: {categories})...")
    sys.stdout.flush()

    model_groups = {}
    for category in categories:
        model = active_grader_models.get(category, "")
        model_groups.setdefault(model, []).append(category)

    def _grade_model_group(group_categories):
        group_results = {}
        for cat in group_categories:
            group_results[cat] = _grade_single_category(
                cat,
                active_grader_models.get(cat, ""),
                full_prompt_text,
                answer_text,
                max_retries,
                active_rubrics.get(cat)
            )
        return group_results

    results = {}
    with ThreadPoolExecutor(max_workers=max(len(model_groups), 1)) as executor:
        group_futures = {
            model: executor.submit(_grade_model_group, group_cats)
            for model, group_cats in model_groups.items()
        }
        for model, future in group_futures.items():
            results.update(future.result())

    grade = {category: normalize_score(results[category].get("score", 50)) for category in categories}
    overall = compute_score(grade, weights=score_weights)

    feedback_lines = []
    for category in categories:
        category_feedback = results[category].get("feedback", "")
        if category_feedback:
            feedback_lines.append(f"- {category.capitalize()}: {category_feedback}")
    feedback = clean_text_for_json("\n".join(feedback_lines)) if feedback_lines else ""

    grader_models = {category: active_grader_models.get(category, "") for category in categories}
    raw_outputs = {category: results[category].get("raw_output", "") for category in categories}
    token_info = {category: results[category].get("token_info", {}) for category in categories}

    graded_entry = entry.copy()
    graded_entry.update({
        "grade": grade,
        "overall_score": overall,
        "grade_tag": grade_tag,
        "layer": "Layer3",
        "feedback": feedback,
        "raw_grader_output": json.dumps(raw_outputs, ensure_ascii=False),
        "raw_grader_outputs": raw_outputs,
        "layer3_graders": grader_models,
        "prompt_number": prompt_num,
        "token_info": token_info,
        "prompt_reference_mode": normalized_prompt_mode
    })
    append_to_ledger(graded_entry)

    print(f"\n================ PROMPT {prompt_num} - LAYER 3: GRADING ================")
    print(json.dumps({"scores": grade, "overall": overall, "feedback": feedback, "graders": grader_models}, ensure_ascii=False, indent=2))

    return graded_entry


__all__ = ['layer3_grade']
