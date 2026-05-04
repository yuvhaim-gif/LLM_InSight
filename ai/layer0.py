import sys
import json
from typing import List, Tuple, Optional

from config import DEFAULT_LAYER0_MODEL
from ai.api_calls import call_model, is_error_response
from utils.common import traceable

@traceable(name="Layer 0: Micro Replies")
def layer0_micro_replies(prompt: str, top_k: int = 5, prev_prompt: Optional[str] = None, 
                         is_second_prompt: bool = False, best_best_context: Optional[str] = None, 
                         prompt_num: int = 1, layer0_model: Optional[str] = None) -> Tuple[List[str], str, dict]:
    if layer0_model is None:
        layer0_model = DEFAULT_LAYER0_MODEL
    
    messages_text = f"Task: {prompt}\nReturn up to {top_k} concise and different alternative ideas or directions for the answer/s, one per line."
    
    if is_second_prompt and prev_prompt:
        messages_text = f"this is previous prompt:\n{prev_prompt}\nthis is the prompt!:\n{prompt}\n{messages_text}"
    
    if is_second_prompt and best_best_context:
        messages_text = f"[Best answer from previous analysis for context]:\n{best_best_context}\n\n{messages_text}"
        print(f"\n================ PROMPT {prompt_num} - LAYER 0: USING BEST-BEST CONTEXT ================")
        context_preview = best_best_context[:200] + ('...' if len(best_best_context) > 200 else '')
        print(f"Context added: {context_preview}")
    
    messages = [
        {"role": "system", "content": "Layer0: Generate multiple, different, short ideas or directions for the answer/s for the user prompt. add no text before or after"},
        {"role": "user", "content": messages_text}
    ]
    
    print(f"\n⏳ PROMPT {prompt_num} - LAYER 0: Requesting micro replies from '{layer0_model}' (timeout: 240s)...")
    sys.stdout.flush()
    response = call_model(layer0_model, messages, timeout=240)
    
    reply_content = response.get("content", "") if isinstance(response, dict) else response
    token_info = response.get("token_info", {}) if isinstance(response, dict) else {}
    
    if is_error_response(reply_content):
        print(f"⚠️ LAYER 0 ERROR: {reply_content}")
        print(f"✓ Continuing with empty micro replies (Layer0 unavailable)")
        selected = []
    else:
        lines = [line.strip() for line in reply_content.split("\n") if line.strip()]
        selected = lines[:top_k]
    
    print(f"\n================ PROMPT {prompt_num} - LAYER 0: MICRO REPLIES ================")
    print(json.dumps(selected, ensure_ascii=False, indent=2))
    return selected, prompt, token_info

__all__ = ['layer0_micro_replies']
