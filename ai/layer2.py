import sys
from typing import List, Optional, Dict, Any

from config import DEFAULT_LAYER2_MODEL
from models import Layer2Response, Layer2Critique
from utils.common import try_parse_json, traceable
from utils.text_processing import clean_text_for_json
from utils.session import get_session_layer2_model, get_advanced_layer2_models
from ai.api_calls import call_model

@traceable(name="Layer 2: Prompt Improvement")
def layer2_improve_prompt(prompt: str, combined_prompts: List[str], layer1_reply: str,
                          layer3_feedback: Optional[Dict[str, Any]] = None,
                          best_best_reply: Optional[str] = "", last_iteration_reply: Optional[str] = "",
                          micro_replies: Optional[List[str]] = None, layer0_prompt: Optional[str] = None,
                          ignore_best: bool = False, max_micro: int = 5,
                          prev_prompt: Optional[str] = None, is_second_prompt: bool = False, prompt_num: int = 1,
                          iteration_count: int = 1, weights: Optional[Dict[str, float]] = None) -> Layer2Response:
    context_parts = []
    
    # 1. Handle previous prompt context
    if is_second_prompt and prev_prompt:
        context_parts.append(f"this is previous prompt:\n{prev_prompt}")
        context_parts.append(f"this is the prompt!:\n{prompt}")
    
    # 2. Inject Grader Feedback (The critical loop-back)
    if layer3_feedback:
        score = layer3_feedback.get('overall_score', layer3_feedback.get('overall', 'N/A'))
        feedback_text = layer3_feedback.get('feedback', 'No detailed feedback.')
        sub_scores = layer3_feedback.get('grade', layer3_feedback.get('scores', {}))
        graders_used = layer3_feedback.get('layer3_graders', {})
        
        context_parts.append("--- [CRITICAL: GRADER FEEDBACK FROM PREVIOUS ITERATION] ---")
        context_parts.append(f"Overall Quality Score: {score}/100")
        context_parts.append(f"Detailed Scores per grading key: {sub_scores}")
        if graders_used:
            context_parts.append(f"Grader models used per key: {graders_used}")
        context_parts.append(f"Judge's Critique: {feedback_text}")
        context_parts.append("---------------------------------------------------------")
    
    # 3. Handle additional context layers
    if best_best_reply and not ignore_best:
        context_parts.append(f"[Important - Best-Best answer]:\n{best_best_reply}")
    
    if last_iteration_reply and not ignore_best:
        context_parts.append(f"[Important - Last Iteration Best]:\n{last_iteration_reply}")
        
    if micro_replies:
        for idx, mr in enumerate(micro_replies[:max_micro], 1):
            context_parts.append(f"[Optional - Micro Reply {idx}]: {mr}")
            
    if layer0_prompt:
        context_parts.append(f"[Reference - Layer0 original prompt]:\n{layer0_prompt}")
        
    if combined_prompts:
        recent_prompts = combined_prompts[-2:]
        for idx, p in enumerate(recent_prompts, 1):
            context_parts.append(f"[Optional - Recent Prompt {idx}]: {p}")

    context_text = "\n".join(context_parts)
    
    # Format weights for the prompt if they exist
    weights_context = f"\n### CURRENT OPTIMIZATION PRIORITIES (WEIGHTS) ###\n{weights}\n" if weights else ""
    
    messages = [
        {
            "role": "system",
            "content": (
                "You are an EXPERT PROMPT ENGINEER. Your ONLY goal is to output an improved prompt in JSON format.\n"
                "DO NOT attempt to answer the user's prompt yourself. write a full and perfected prompt only. DO NOT engage in the roleplay.\n\n"
                "HIERARCHY OF TRUTH (STRICT):\n"
                "1) The CURRENT PROMPT is the primary source of truth and must be preserved in intent, scope, rules, limitations, and conditions.\n"
                "2) Grader feedback, weights, and additional context are secondary optimization signals.\n"
                "3) If any secondary signal appears to conflict with the CURRENT PROMPT, keep the CURRENT PROMPT's constraints and refine wording instead of changing requirements.\n\n"
                "STRATEGY:\n"
                "- Improve clarity, structure, and precision while keeping the original policy and constraints intact.\n"
                "- Use OPTIMIZATION PRIORITIES (WEIGHTS) to prioritize which weak areas to improve first.\n"
                "- If a high-weight metric is low, strengthen instructions that address that weakness without overcorrecting.\n"
                "- Use the RESULTING ANSWER only as diagnostic evidence of what to reinforce or avoid; do not copy its content.\n"
                "- Make the necessary changes to preserve behavior while improving quality.\n\n"
                "- use the most appropriate method to improve the prompt including Zero-Shot Prompting, Few-Shot Prompting, Chain-of-Thought (CoT), Self-Consistency, Least-to-Most Prompting, Tree of Thoughts (ToT), Directional Stimulus Prompting, Role Prompting, Generated Knowledge Prompting, Chain-of-Verification (CoVe) or/and Skeleton-of-Thought as needed.\n\n"
                "REQUIREMENTS:\n"
                "1. Return ONLY valid JSON.\n"
                "2. JSON structure:\n"
                "{\n"
                '  "improved_prompt": "<the fully revised prompt>",\n'
                '  "critique": {\n'
                '    "issues": ["list of weaknesses identified in the current prompt/result"],\n'
                '    "suggestions": ["how the revised prompt fixes these based on weights"],\n'
                '    "verdict": "<summary judgment>"\n'
                '  }\n'
                "}\n\n"
                "CRITICAL TEXT FORMATTING:\n"
                "- Write with proper spacing, normal sentences, and professional language.\n"
                "- NEVER write concatenated text like 'wordtextlovespace'.\n"
                "- ALWAYS write readable text like 'word text love space'.\n"
            )
        },
        {
            "role": "user",
            "content": (
                "### DATA FOR ANALYSIS ###\n"
                f"{weights_context}"
                f"Context and Grader Feedback:\n{context_text}\n\n"
                f"Current prompt to improve:\n{prompt}\n\n"
                f"RESULTING ANSWER (FOR REFERENCE ONLY - DO NOT REPLICATE):\n{layer1_reply}\n\n"
                "### INSTRUCTION ###\n"
                "Treat the 'CURRENT PROMPT' as authoritative and preserve all of its rules, limits, conditions, and intent. "
                "Use feedback, weights, and context to refine wording, structure, and specificity so low-scoring high-weight metrics improve, without removing or contradicting original constraints."
            ),
        },
    ]

    # Model selection logic
    advanced_layer2_models = get_advanced_layer2_models()
    iteration_key = str(iteration_count)
    if iteration_key in advanced_layer2_models and advanced_layer2_models[iteration_key]:
        layer2_model = advanced_layer2_models[iteration_key]
        source = "⚙️ ADVANCED (per-iteration)"
    else:
        layer2_model = get_session_layer2_model()
        source = "Main selector"
    
    if not layer2_model or not layer2_model.strip():
        print(f"⚠️ Layer2 model is empty! Using default: {DEFAULT_LAYER2_MODEL}")
        layer2_model = DEFAULT_LAYER2_MODEL
        source = "FALLBACK (empty model detected)"
    
    print(f"⏳ Calling Layer2 model '{layer2_model}' (timeout: 240s)...")
    print(f"   ⚙️ Source: {source}")
    sys.stdout.flush()
    
    response = call_model(layer2_model, messages, timeout=240)
    
    resp_content = response.get("content", "") if isinstance(response, dict) else response
    token_info = response.get("token_info", {}) if isinstance(response, dict) else {}
    
    obj = try_parse_json(resp_content)
    if not isinstance(obj, dict):
        improved_prompt = prompt
        critique = Layer2Critique(issues=["JSON parse failed"], suggestions=["Retry manually"], verdict="MAJOR_ISSUES")
    else:
        raw_improved_prompt = obj.get("improved_prompt", prompt)
        improved_prompt = clean_text_for_json(raw_improved_prompt) if raw_improved_prompt != prompt else prompt
        
        crit_obj = obj.get("critique", {})
        if isinstance(crit_obj, dict):
            raw_issues = crit_obj.get("issues") or []
            raw_suggestions = crit_obj.get("suggestions") or []
            raw_verdict = crit_obj.get("verdict", "MINOR_ISSUES")
            
            issues = [clean_text_for_json(str(issue)) for issue in raw_issues]
            suggestions = [clean_text_for_json(str(suggestion)) for suggestion in raw_suggestions]
            verdict = clean_text_for_json(str(raw_verdict))
            
            critique = Layer2Critique(issues=issues, suggestions=suggestions, verdict=verdict)
        else:
            critique = Layer2Critique(issues=["Invalid critique format"], suggestions=[], verdict="MINOR_ISSUES")

    print(f"\n================ PROMPT {prompt_num} - LAYER 2: IMPROVED PROMPT ================")
    print(improved_prompt)
    print(f"[Feedback: {critique.verdict}]\n")
    
    return Layer2Response(improved_prompt=improved_prompt, critique=critique, token_info=token_info)

__all__ = ['layer2_improve_prompt']