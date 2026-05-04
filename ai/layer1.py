import sys
from datetime import datetime, timezone
from typing import Optional

from config import DEFAULT_LAYER1A_MODEL, DEFAULT_LAYER1B_MODEL
from utils.common import utc_now_iso, traceable
from utils.file_io import append_to_ledger
from utils.session import (
    get_session_layer1a_model, get_session_layer1b_model,
    get_advanced_layer1a_models, get_advanced_layer1b_models
)
from ai.api_calls import call_model

@traceable(name="Layer 1: Generate Reply")
def layer1_generate_reply(prompt: str, iteration: int, context: str = "", type_tag: str = "original", 
                          prompt_num: int = 1, prev_model_used: Optional[str] = None) -> dict:
    user_text = f"{context}\n\nYou must answer the prompt:\n{prompt}\n\nRespond fully satisfying all constraints."
    
    advanced_layer1a_models = get_advanced_layer1a_models()
    advanced_layer1b_models = get_advanced_layer1b_models()
    
    if type_tag == "original":
        iteration_key = str(iteration)
        if iteration_key in advanced_layer1a_models:
            model_to_use = advanced_layer1a_models[iteration_key]
            source = "⚙️ ADVANCED (per-iteration)"
            print(f"⏹️  Iteration {iteration} - Layer1A ORIGINAL:")
            print(f"   ⚙️ Source: ADVANCED (per-iteration configuration)")
            print(f"   🤖 Model: {model_to_use}")
        else:
            model_to_use = get_session_layer1a_model()
            source = "🤖 DEFAULT (main selector)"
            print(f"⏹️  Iteration {iteration} - Layer1A ORIGINAL:")
            print(f"   🤖 Source: DEFAULT (main selector)")
            print(f"   🤖 Model: {model_to_use}")
        
        if prev_model_used and prev_model_used != model_to_use:
            print(f"   ⚠️ MODEL CHANGED: {prev_model_used} → {model_to_use}")
        elif prev_model_used:
            print(f"   ✓ Model unchanged from previous iteration")
    else:
        iteration_key = str(iteration)
        if iteration_key in advanced_layer1b_models:
            model_to_use = advanced_layer1b_models[iteration_key]
            source = "⚙️ ADVANCED (per-iteration)"
            print(f"⏹️  Iteration {iteration} - Layer1B IMPROVED:")
            print(f"   ⚙️ Source: ADVANCED (per-iteration configuration)")
            print(f"   🤖 Model: {model_to_use}")
        else:
            model_to_use = get_session_layer1b_model()
            source = "🤖 DEFAULT (main selector)"
            print(f"⏹️  Iteration {iteration} - Layer1B IMPROVED:")
            print(f"   🤖 Source: DEFAULT (main selector)")
            print(f"   🤖 Model: {model_to_use}")
        
        if prev_model_used and prev_model_used != model_to_use:
            print(f"   ⚠️ MODEL CHANGED: {prev_model_used} → {model_to_use}")
        elif prev_model_used:
            print(f"   ✓ Model unchanged from previous iteration")
    
    messages = [
        {"role": "system", "content": "Logical reasoning assistant. Produce structured and complete answers."},
        {"role": "user", "content": user_text}
    ]
    print(f"⏳ Calling Layer1 {type_tag.upper()} model '{model_to_use}' (timeout: 240s)...")
    sys.stdout.flush()
    start_time = datetime.now(timezone.utc)
    response = call_model(model_to_use, messages, timeout=240)
    elapsed_time = (datetime.now(timezone.utc) - start_time).total_seconds()
    
    reply_content = response.get("content", "") if isinstance(response, dict) else response
    token_info = response.get("token_info", {}) if isinstance(response, dict) else {}
    print(f"🔤 [LAYER1_{type_tag.upper()}] Response type: {type(response).__name__}, has token_info: {'token_info' in response if isinstance(response, dict) else False}")
    if token_info:
        print(f"   → Tokens: input={token_info.get('input_tokens', 0)}, output={token_info.get('output_tokens', 0)}, total={token_info.get('total_tokens', 0)}")
    
    entry = {
        "timestamp": utc_now_iso(),
        "layer": "Layer1",
        "iteration": iteration,
        "type": type_tag,
        "prompt": prompt,
        "prompt_number": prompt_num,
        "layer1_reply": reply_content,
        "model_used": model_to_use,
        "model_source": source,
        "runtime_in_sec": elapsed_time,
        "token_info": token_info
    }
    append_to_ledger(entry)
    print(f"\n================ PROMPT {prompt_num} - LAYER 1 ({type_tag.upper()}) REPLY - ITERATION {iteration} ================")
    print(f"✓ Model: {model_to_use} | Source: {source}")
    print(f"{reply_content}\n")
    return entry

__all__ = ['layer1_generate_reply']
