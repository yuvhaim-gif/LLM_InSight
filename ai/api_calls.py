import sys
import re
import logging
import threading
import gc
from datetime import datetime, timezone
from typing import List, Union, Dict

from config import (
    _GEMINI_MODELS, _MISTRAL_MODELS, _GLM_MODELS, _GLM_MODEL_MAP
)
from secrets_config import GOOGLE_API_KEY, MISTRAL_API_KEY
from utils.common import utc_now_iso
import state

try:
    from ollama import chat, ResponseError
except Exception:
    chat = None
    class ResponseError(Exception): pass

def _make_response(content: str, tool: str = "", input_tokens: int = 0, output_tokens: int = 0) -> Dict:
    return {
        "content": content,
        "token_info": {
            "tool": tool,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens
        }
    }

def call_model(model: str, messages: List[dict], timeout: int = 300) -> Dict:
    if model in _GEMINI_MODELS:
        print(f"   🔗 ROUTING TO: Google Gemini API")
        return call_google_gemini(messages, model=model, timeout=timeout)
    elif model in _MISTRAL_MODELS:
        print(f"   🔗 ROUTING TO: Mistral API")
        return call_mistral(model, messages, timeout=timeout)
    elif model in _GLM_MODELS:
        print(f"   🟡 ROUTING TO: GLM-4 (HuggingFace)")
        return call_glm(model, messages, timeout=timeout)
    else:
        print(f"   🔗 ROUTING TO: Ollama")
        return call_ollama(model, messages, timeout=timeout)

def is_error_response(response: Union[str, Dict]) -> bool:
    if isinstance(response, dict):
        response = response.get("content", "")
    error_prefixes = ("[OLLAMA_TIMEOUT]", "[OLLAMA_ERROR]", "[GOOGLE_TIMEOUT]", 
                      "[GOOGLE_ERROR]", "[MISTRAL_TIMEOUT]", "[MISTRAL_ERROR]",
                      "[GLM_TIMEOUT]", "[GLM_ERROR]")
    return any(str(response).startswith(prefix) for prefix in error_prefixes)

def call_ollama(model: str, messages: List[dict], timeout: int = 300) -> Dict:
    if chat is None: 
        logging.info(f"[OLLAMA_SKIP] Chat not available - skipping model '{model}'")
        return _make_response("[DUMMY ANSWER - Ollama not available]", tool="ollama")
    
    result = {"content": None, "error": None, "completed": False, "start_time": None, "input_tokens": 0, "output_tokens": 0}
    
    def ollama_thread():
        try:
            result["start_time"] = datetime.now(timezone.utc)
            logging.debug(f"[OLLAMA_START] Calling model '{model}'")
            resp = chat(model=model, messages=messages)
            if isinstance(resp, dict):
                result["content"] = resp.get("message", {}).get("content", "").strip()
                result["input_tokens"] = resp.get("prompt_eval_count", 0)
                result["output_tokens"] = resp.get("eval_count", 0)
            elif hasattr(resp, "message") and getattr(resp.message, "content", None):
                result["content"] = resp.message.content.strip()
                result["input_tokens"] = getattr(resp, "prompt_eval_count", 0)
                result["output_tokens"] = getattr(resp, "eval_count", 0)
            else:
                result["content"] = str(resp).strip()
            result["completed"] = True
            elapsed = (datetime.now(timezone.utc) - result["start_time"]).total_seconds()
            logging.info(f"[OLLAMA_SUCCESS] Model '{model}' completed in {elapsed:.1f}s (tokens: {result['input_tokens']} in, {result['output_tokens']} out)")
        except ResponseError as e:
            result["error"] = f"[OLLAMA_ERROR]: {e}"
            result["completed"] = True
            logging.error(f"[OLLAMA_RESPONSE_ERROR] Model '{model}': {e}")
        except Exception as e:
            result["error"] = f"[OLLAMA_ERROR]: {e}"
            result["completed"] = True
            logging.error(f"[OLLAMA_EXCEPTION] Model '{model}': {e}")
    
    thread = threading.Thread(target=ollama_thread, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    
    if result["error"]:
        logging.error(f"[OLLAMA_RESULT_ERROR] {result['error']}")
        return _make_response(result["error"], tool="ollama")
    
    if result["content"] is not None:
        state.increment_models_executed()
        return _make_response(result["content"], tool="ollama", input_tokens=result["input_tokens"], output_tokens=result["output_tokens"])
    
    if result["completed"]:
        logging.warning(f"[OLLAMA_COMPLETED_NO_CONTENT] Thread completed but no content: model '{model}'")
        return _make_response("[OLLAMA_ERROR]: No content returned from model", tool="ollama")
    
    if thread.is_alive():
        logging.error(f"[OLLAMA_TIMEOUT] Model '{model}' did not respond within {timeout}s - thread still running")
        try:
            print(f"⚠️ [TIMEOUT] Model '{model}' exceeded {timeout}s timeout.")
        except:
            pass
        return _make_response(f"[OLLAMA_TIMEOUT]: Model '{model}' did not respond within {timeout} seconds.", tool="ollama")
    
    logging.error(f"[OLLAMA_INCOMPLETE] Thread terminated abnormally for model '{model}'")
    return _make_response("[OLLAMA_ERROR]: Thread terminated without completing", tool="ollama")

def _post_with_retry(url: str, json_payload: dict, headers: dict, timeout: int, max_retries: int = 3, base_delay: float = 1.0, service_name: str = "API", constant_delay: bool = False) -> tuple:
    import time
    import requests
    
    for attempt in range(max_retries + 1):
        try:
            response = requests.post(url, json=json_payload, headers=headers, timeout=timeout)
            
            if response.status_code == 429:
                if attempt < max_retries:
                    wait_time = base_delay if constant_delay else base_delay * (2 ** attempt)
                    logging.warning(f"[{service_name}_RATE_LIMIT] Got 429, retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries + 1})")
                    time.sleep(wait_time)
                    continue
                else:
                    logging.error(f"[{service_name}_RATE_LIMIT_EXHAUSTED] Max retries exceeded after {max_retries + 1} attempts")
                    return response, None
            
            return response, None
        except requests.Timeout:
            if attempt < max_retries:
                wait_time = base_delay if constant_delay else base_delay * (2 ** attempt)
                logging.warning(f"[{service_name}_TIMEOUT_RETRY] Timeout on attempt {attempt + 1}, retrying in {wait_time:.1f}s")
                time.sleep(wait_time)
                continue
            else:
                logging.error(f"[{service_name}_TIMEOUT_EXHAUSTED] Request timed out after {max_retries + 1} attempts")
                return None, "timeout"
        except requests.RequestException as e:
            if attempt < max_retries:
                wait_time = base_delay if constant_delay else base_delay * (2 ** attempt)
                logging.warning(f"[{service_name}_RETRY] Request failed: {str(e)}, retrying in {wait_time:.1f}s (attempt {attempt + 1}/{max_retries + 1})")
                time.sleep(wait_time)
                continue
            else:
                logging.error(f"[{service_name}_REQUEST_EXHAUSTED] Request failed after {max_retries + 1} attempts: {str(e)}")
                return None, str(e)
    
    return None, "unknown_error"

def call_google_gemini(messages: List[dict], model: str = "gemini-2.5-flash", timeout: int = 300) -> Dict:
    try:
        import requests
    except ImportError:
        logging.error("[GEMINI_ERROR] requests library not installed")
        return _make_response("[GOOGLE_ERROR]: requests library not installed", tool="gemini")
    
    api_key = GOOGLE_API_KEY
    if not api_key:
        logging.error("[GEMINI_ERROR] GOOGLE_API_KEY not configured")
        return _make_response("[GOOGLE_ERROR]: API key not configured", tool="gemini")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    
    call_timestamp = utc_now_iso()
    call_id = f"GEMINI_{call_timestamp}_{id(messages)}"
    logging.info(f"[GEMINI_NEW_CALL] Initiating new Google API call: {call_id}")
    
    result = {"content": None, "error": None, "completed": False, "start_time": None, "call_id": call_id, "input_tokens": 0, "output_tokens": 0}
    
    def gemini_thread():
        try:
            result["start_time"] = datetime.now(timezone.utc)
            logging.debug("[GEMINI_START] Calling Google Gemini API")
            
            system_message = ""
            user_message = ""
            for msg in messages:
                if msg.get("role") == "system":
                    system_message = msg.get("content", "")
                elif msg.get("role") == "user":
                    user_message = msg.get("content", "")
            
            if not user_message:
                user_message = messages[-1].get("content", "") if messages else ""
            
            combined_text = ""
            if system_message:
                combined_text = f"{system_message}\n\n{user_message}"
            else:
                combined_text = user_message
            
            payload = {
                "contents": [
                    {
                        "parts": [
                            {
                                "text": combined_text
                            }
                        ]
                    }
                ]
            }
            
            headers = {
                "Content-Type": "application/json",
                "X-goog-api-key": api_key
            }
            
            response, error = _post_with_retry(url, payload, headers, timeout-5, max_retries=5, base_delay=3.0, service_name="GEMINI", constant_delay=True)
            
            if error == "timeout":
                result["error"] = "[GOOGLE_TIMEOUT]: Request timed out after retries"
                result["completed"] = True
                logging.error("[GEMINI_TIMEOUT] Google Gemini API request timed out")
                return
            elif error:
                result["error"] = f"[GOOGLE_ERROR]: {error}"
                result["completed"] = True
                logging.error(f"[GEMINI_REQUEST_ERROR] {error}")
                return
            
            if response is None:
                result["error"] = "[GOOGLE_ERROR]: No response received"
                result["completed"] = True
                logging.error("[GEMINI_NO_RESPONSE] No response received from Gemini API")
                return
            
            if response.status_code == 200:
                resp_json = response.json()
                if "candidates" in resp_json and len(resp_json["candidates"]) > 0:
                    content = resp_json["candidates"][0].get("content", {})
                    if "parts" in content and len(content["parts"]) > 0:
                        result["content"] = content["parts"][0].get("text", "").strip()
                        usage_metadata = resp_json.get("usageMetadata", {})
                        result["input_tokens"] = usage_metadata.get("promptTokenCount", 0)
                        result["output_tokens"] = usage_metadata.get("candidatesTokenCount", 0)
                        result["completed"] = True
                        elapsed = (datetime.now(timezone.utc) - result["start_time"]).total_seconds()
                        logging.info(f"[GEMINI_SUCCESS] Gemini API call completed in {elapsed:.1f}s (tokens: {result['input_tokens']} in, {result['output_tokens']} out)")
                        return
            
            result["error"] = f"[GOOGLE_ERROR]: Invalid response format (status {response.status_code})"
            result["completed"] = True
            logging.error(f"[GEMINI_RESPONSE_ERROR] Status {response.status_code}: {response.text[:200]}")
        except Exception as e:
            result["error"] = f"[GOOGLE_ERROR]: {str(e)}"
            result["completed"] = True
            logging.error(f"[GEMINI_EXCEPTION] {str(e)}")
    
    thread = threading.Thread(target=gemini_thread, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    
    if result["error"]:
        logging.error(f"[GEMINI_RESULT_ERROR] {result['error']}")
        return _make_response(result["error"], tool="gemini")
    
    if result["content"] is not None:
        state.increment_models_executed()
        return _make_response(result["content"], tool="gemini", input_tokens=result["input_tokens"], output_tokens=result["output_tokens"])
    
    if result["completed"]:
        logging.warning("[GEMINI_COMPLETED_NO_CONTENT] Thread completed but no content")
        return _make_response("[GOOGLE_ERROR]: No content returned from Gemini", tool="gemini")
    
    if thread.is_alive():
        logging.error(f"[GEMINI_TIMEOUT] Gemini API did not respond within {timeout}s")
        return _make_response(f"[GOOGLE_TIMEOUT]: Gemini API did not respond within {timeout} seconds", tool="gemini")
    
    logging.error("[GEMINI_INCOMPLETE] Thread terminated abnormally")
    return _make_response("[GOOGLE_ERROR]: Thread terminated without completing", tool="gemini")

def call_mistral(model: str, messages: List[dict], timeout: int = 300) -> Dict:
    try:
        import requests
    except ImportError:
        logging.error("[MISTRAL_ERROR] requests library not installed")
        return _make_response("[MISTRAL_ERROR]: requests library not installed", tool="mistral")
    
    api_key = MISTRAL_API_KEY
    if not api_key:
        logging.error("[MISTRAL_ERROR] MISTRAL_API_KEY not configured")
        return _make_response("[MISTRAL_ERROR]: API key not configured", tool="mistral")
    
    url = "https://api.mistral.ai/v1/chat/completions"
    
    call_timestamp = utc_now_iso()
    call_id = f"MISTRAL_{call_timestamp}_{id(messages)}"
    logging.info(f"[MISTRAL_NEW_CALL] Initiating new Mistral API call: {call_id}")
    
    result = {"content": None, "error": None, "completed": False, "start_time": None, "call_id": call_id, "input_tokens": 0, "output_tokens": 0}
    
    def mistral_thread():
        try:
            result["start_time"] = datetime.now(timezone.utc)
            logging.debug(f"[MISTRAL_START] Calling Mistral API with model '{model}'")
            
            payload = {
                "model": model,
                "messages": messages
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            }
            
            response, error = _post_with_retry(url, payload, headers, timeout-5, max_retries=3, base_delay=1.0, service_name="MISTRAL")
            
            if error == "timeout":
                result["error"] = "[MISTRAL_TIMEOUT]: Request timed out after retries"
                result["completed"] = True
                logging.error("[MISTRAL_TIMEOUT] Mistral API request timed out")
                return
            elif error:
                result["error"] = f"[MISTRAL_ERROR]: {error}"
                result["completed"] = True
                logging.error(f"[MISTRAL_REQUEST_ERROR] {error}")
                return
            
            if response is None:
                result["error"] = "[MISTRAL_ERROR]: No response received"
                result["completed"] = True
                logging.error("[MISTRAL_NO_RESPONSE] No response received from Mistral API")
                return
            
            if response.status_code == 200:
                resp_json = response.json()
                if "choices" in resp_json and len(resp_json["choices"]) > 0:
                    choice = resp_json["choices"][0]
                    if "message" in choice and "content" in choice["message"]:
                        result["content"] = choice["message"]["content"].strip()
                        usage = resp_json.get("usage", {})
                        result["input_tokens"] = usage.get("prompt_tokens", 0)
                        result["output_tokens"] = usage.get("completion_tokens", 0)
                        result["completed"] = True
                        elapsed = (datetime.now(timezone.utc) - result["start_time"]).total_seconds()
                        logging.info(f"[MISTRAL_SUCCESS] Mistral API call completed in {elapsed:.1f}s (tokens: {result['input_tokens']} in, {result['output_tokens']} out)")
                        return
            
            result["error"] = f"[MISTRAL_ERROR]: Invalid response format (status {response.status_code})"
            result["completed"] = True
            logging.error(f"[MISTRAL_RESPONSE_ERROR] Status {response.status_code}: {response.text[:200]}")
        except Exception as e:
            result["error"] = f"[MISTRAL_ERROR]: {str(e)}"
            result["completed"] = True
            logging.error(f"[MISTRAL_EXCEPTION] {str(e)}")
    
    thread = threading.Thread(target=mistral_thread, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    
    if result["error"]:
        logging.error(f"[MISTRAL_RESULT_ERROR] {result['error']}")
        return _make_response(result["error"], tool="mistral")
    
    if result["content"] is not None:
        state.increment_models_executed()
        return _make_response(result["content"], tool="mistral", input_tokens=result["input_tokens"], output_tokens=result["output_tokens"])
    
    if result["completed"]:
        logging.warning("[MISTRAL_COMPLETED_NO_CONTENT] Thread completed but no content")
        return _make_response("[MISTRAL_ERROR]: No content returned from Mistral", tool="mistral")
    
    if thread.is_alive():
        logging.error(f"[MISTRAL_TIMEOUT] Mistral API did not respond within {timeout}s")
        return _make_response(f"[MISTRAL_TIMEOUT]: Mistral API did not respond within {timeout} seconds", tool="mistral")
    
    logging.error("[MISTRAL_INCOMPLETE] Thread terminated abnormally")
    return _make_response("[MISTRAL_ERROR]: Thread terminated without completing", tool="mistral")

def _load_glm_model(model_name: str):
    hf_model_id = _GLM_MODEL_MAP.get(model_name)
    if not hf_model_id:
        logging.error(f"[GLM_ERROR] Unknown GLM model: {model_name}")
        return None, None

    if hf_model_id in state._glm_model_cache:
        return state._glm_model_cache[hf_model_id]

    if state._glm_cancel_load.is_set():
        return None, None
    
    with state._glm_load_lock:
        if state._glm_cancel_load.is_set():
            return None, None

        if hf_model_id in state._glm_model_cache:
            return state._glm_model_cache[hf_model_id]
        
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            import torch
        except ImportError:
            logging.error("[GLM_ERROR] transformers or torch not installed")
            return None, None
        
        logging.info(f"[GLM_LOADING] Loading GLM model '{hf_model_id}' (first use - this may take a few minutes)...")
        print(f"   ⏳ Loading GLM model '{hf_model_id}' from HuggingFace (first use)...")
        sys.stdout.flush()
        
        try:
            if state._glm_cancel_load.is_set():
                print("   ⛔ GLM load cancelled before tokenizer")
                return None, None

            tokenizer = AutoTokenizer.from_pretrained(hf_model_id, trust_remote_code=True)

            if state._glm_cancel_load.is_set():
                del tokenizer
                print("   ⛔ GLM load cancelled before model")
                return None, None

            if tokenizer.pad_token is None:
                tokenizer.pad_token = tokenizer.eos_token
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
            
            model = AutoModelForCausalLM.from_pretrained(
                hf_model_id,
                torch_dtype=dtype,
                low_cpu_mem_usage=True,
                trust_remote_code=True,
                device_map="auto" if torch.cuda.is_available() else None,
                use_safetensors=True,
                attn_implementation="flash_attention_2" if torch.cuda.is_available() else None
            )

            if state._glm_cancel_load.is_set():
                del model
                del tokenizer
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                print("   ⛔ GLM load cancelled after model download")
                return None, None
            
            if device == "cpu":
                model = model.to(device)
            
            model = model.eval()
            
            state._glm_model_cache[hf_model_id] = (model, tokenizer)
            logging.info(f"[GLM_LOADED] Model '{hf_model_id}' loaded successfully on {device}")
            print(f"   ✓ GLM model loaded on {device}")
            return model, tokenizer
        except Exception as e:
            logging.error(f"[GLM_LOAD_ERROR] Failed to load model '{hf_model_id}': {e}")
            print(f"   ❌ Failed to load GLM model: {e}")
            return None, None

def unload_glm_models():
    state._glm_cancel_load.set()
    with state._glm_load_lock:
        try:
            import torch
            import gc
            for hf_id, (model, tokenizer) in state._glm_model_cache.items():
                del model
                del tokenizer
                logging.info(f"[GLM_UNLOADED] Model '{hf_id}' unloaded")
            state._glm_model_cache.clear()
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("   ✓ GLM models unloaded")
        except Exception as e:
            state._glm_model_cache.clear()
            logging.error(f"[GLM_UNLOAD_ERROR] {e}")

def preload_glm_models():
    state._glm_cancel_load.clear()
    for model_name in _GLM_MODELS:
        if state._glm_cancel_load.is_set():
            print("   ⛔ GLM preload cancelled")
            return
        _load_glm_model(model_name)

def call_glm(model_name: str, messages: List[dict], timeout: int = 300) -> Dict:
    call_timestamp = utc_now_iso()
    call_id = f"GLM_{call_timestamp}_{id(messages)}"
    logging.info(f"[GLM_NEW_CALL] Initiating GLM call: {call_id}")
    
    result = {"content": None, "error": None, "completed": False, "start_time": None, "call_id": call_id, "input_tokens": 0, "output_tokens": 0}
    
    def glm_thread():
        try:
            result["start_time"] = datetime.now(timezone.utc)
            
            model, tokenizer = _load_glm_model(model_name)
            if model is None or tokenizer is None:
                result["error"] = "[GLM_ERROR]: Failed to load model"
                result["completed"] = True
                return
            
            try:
                import torch
            except ImportError:
                result["error"] = "[GLM_ERROR]: torch not installed"
                result["completed"] = True
                return
            
            inputs = tokenizer.apply_chat_template(
                messages,
                add_generation_prompt=True,
                tokenize=True,
                return_tensors="pt",
                return_dict=True
            )
            
            device = next(model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}
            
            input_len = inputs['input_ids'].shape[1]
            result["input_tokens"] = input_len
            gen_kwargs = {
                "input_ids": inputs['input_ids'],
                "attention_mask": inputs['attention_mask'],
                "max_new_tokens": 2048,
                "do_sample": True,
                "temperature": 0.8,
                "top_p": 0.9,
                "eos_token_id": [151329, 151336, 151338],
                "pad_token_id": tokenizer.pad_token_id if tokenizer.pad_token_id else 151329
            }
            
            with torch.no_grad():
                outputs = model.generate(**gen_kwargs)
                output_len = outputs.shape[1] - input_len
                result["output_tokens"] = max(0, output_len)
                outputs = outputs[:, input_len:]
            
            response = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
            del inputs, outputs, gen_kwargs
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            result["content"] = response
            result["completed"] = True
            elapsed = (datetime.now(timezone.utc) - result["start_time"]).total_seconds()
            logging.info(f"[GLM_SUCCESS] Model '{model_name}' completed in {elapsed:.1f}s (tokens: {result['input_tokens']} in, {result['output_tokens']} out)")
        except Exception as e:
            result["error"] = f"[GLM_ERROR]: {str(e)}"
            result["completed"] = True
            logging.error(f"[GLM_EXCEPTION] {str(e)}")
    
    thread = threading.Thread(target=glm_thread, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    
    if result["error"]:
        logging.error(f"[GLM_RESULT_ERROR] {result['error']}")
        return _make_response(result["error"], tool="glm")
    
    if result["content"] is not None:
        state.increment_models_executed()
        return _make_response(result["content"], tool="glm", input_tokens=result["input_tokens"], output_tokens=result["output_tokens"])
    
    if result["completed"]:
        logging.warning("[GLM_COMPLETED_NO_CONTENT] Thread completed but no content")
        return _make_response("[GLM_ERROR]: No content returned from GLM model", tool="glm")
    
    if thread.is_alive():
        logging.error(f"[GLM_TIMEOUT] GLM model did not respond within {timeout}s")
        return _make_response(f"[GLM_TIMEOUT]: GLM model did not respond within {timeout} seconds", tool="glm")
    
    logging.error("[GLM_INCOMPLETE] Thread terminated abnormally")
    return _make_response("[GLM_ERROR]: Thread terminated without completing", tool="glm")

__all__ = [
    'call_model',
    'call_ollama',
    'call_google_gemini',
    'call_mistral',
    'call_glm',
    'is_error_response',
    '_post_with_retry',
    'preload_glm_models',
    'unload_glm_models'
]
