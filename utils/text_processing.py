#!/usr/bin/env python3

import re
import logging
from typing import Tuple, Optional, List
from utils.common import try_parse_json

_RE_OPEN_TAG = re.compile(r'<[a-z\-]+>')
_RE_CLOSE_TAG = re.compile(r'</[a-z\-]+>')
_RE_HR = re.compile(r'^\s*---+\s*$', re.MULTILINE)
_RE_NEWLINES = re.compile(r'\n+')
_RE_SPACES = re.compile(r'  +')
_RE_WHITESPACE = re.compile(r'\s+')
_RE_ITERATION = re.compile(r'ITERATION\s+(\d+)')
_RE_PROMPT_START = re.compile(r'🎯\s*STARTING\s+ANALYSIS\s+FOR\s+PROMPT\s*#\s*(\d+)[\s\S]*?PROMPT:\s*(.+?)(?:\n|$)')
_RE_FINAL_BESTBEST = re.compile(r'🏆 FINAL BEST-BEST ANSWER FOR PROMPT #(\d+)')

_CLEAN_REPLACEMENTS = (
    ('\\n', '\n'), ('\\r', '\r'), ('\\t', '\t'),
    ('\\"', '"'), ('\\/', '/'),
    ('<br>', '\n'), ('<br/>', '\n'), ('<br />', '\n'),
    ('\\(', '('), ('\\)', ')'), ('\\|', '|'),
)

def clean_answer_text(text: str) -> str:
    if not isinstance(text, str):
        return text
    
    for old, new in _CLEAN_REPLACEMENTS:
        text = text.replace(old, new)
    text = _RE_OPEN_TAG.sub('', text)
    text = _RE_CLOSE_TAG.sub('', text)
    text = _RE_HR.sub('', text)
    
    return text.strip()

def extract_answer_text(best_best_entry: Optional[dict]) -> str:
    if not best_best_entry or not isinstance(best_best_entry, dict):
        return "[No best answer found - entry is null or invalid]"
    
    layer1_reply = best_best_entry.get("layer1_reply")
    if isinstance(layer1_reply, str) and layer1_reply.strip():
        parsed = try_parse_json(layer1_reply)
        if isinstance(parsed, dict):
            for key in ("answer", "layer1_reply", "reply", "content", "text", "response"):
                if key in parsed and isinstance(parsed[key], str) and parsed[key].strip():
                    return clean_answer_text(parsed[key].strip())
        return clean_answer_text(layer1_reply.strip())
    
    for key in ("answer", "reply", "content", "text", "response", "output"):
        val = best_best_entry.get(key)
        if isinstance(val, str) and val.strip():
            return clean_answer_text(val.strip())
    
    for key in ("feedback", "raw_grader_output", "raw_output"):
        val = best_best_entry.get(key)
        if isinstance(val, str) and val.strip():
            return clean_answer_text(f"[From {key}]: {val.strip()}")
    
    score = best_best_entry.get("overall_score", "N/A")
    iteration = best_best_entry.get("iteration", "N/A")
    entry_type = best_best_entry.get("type", "N/A")
    return f"[Entry exists but no displayable text found - Score: {score}, Iteration: {iteration}, Type: {entry_type}]"

def extract_best_best_from_console(console_output: str, prompt_num: int) -> Tuple[Optional[str], Optional[str], Optional[str], list, Optional[int], Optional[str]]:
    if not console_output or not isinstance(console_output, str):
        return None, None, None, [], None, None
    
    try:
        prompt_str = str(prompt_num)
        
        pattern = (r"🏆\s*FINAL\s+BEST-BEST\s+ANSWER\s+FOR\s+PROMPT\s*#\s*" + prompt_str + r"[\s\S]*?"
                   r"Score\s*:\s*(\d+)[\s\S]*?"
                   r"Iteration\s+(\d+)\s*[,\s]+\s*(\w+)[\s\S]*?"
                   r"Model\s*:\s*([^\n]+)[\s\S]*?"
                   r"FULL\s+ANSWER\s*:\s*\n?"
                   r"([\s\S]*?)"
                   r"\n\s*=+")
        matches = list(re.finditer(pattern, console_output, re.DOTALL))
        
        if not matches:
            return None, None, None, [], None, None
        
        m = matches[-1]
        score = m.group(1)
        iteration = m.group(2)
        layer_type = m.group(3)
        model_name = m.group(4).strip()
        answer_text = m.group(5).strip()
        
        if not answer_text:
            return None, None, None, [], None, None
        
        info = f"Iteration {iteration}, {layer_type} layer, Model: {model_name}"
        tied_entries = _extract_tied_answers_from_console(console_output, prompt_num, score)
        return answer_text, score, info, tied_entries, int(iteration), layer_type
        
    except Exception as e:
        logging.debug(f"Failed to extract best-best from console: {e}")
        return None, None, None, [], None, None

def _extract_tied_answers_from_console(console_output: str, prompt_num: int, target_score: str) -> list:
    try:
        prompt_str = str(prompt_num)
        
        tied_list = []
        
        tied_pattern = (r"🏆\s*TIED\s+BEST\s*#\s*\d+\s+FOR\s+PROMPT\s*#\s*" + prompt_str + r"[\s\S]*?"
                       r"Score\s*:\s*(\d+)[\s\S]*?"
                       r"Iteration\s+(\d+)\s*[,\s]+\s*(\w+)[\s\S]*?"
                       r"Model\s*:\s*([^\n]+)[\s\S]*?"
                       r"FULL\s+ANSWER\s*:\s*\n?"
                       r"([\s\S]*?)"
                       r"\n\s*=+")
        tied_matches = list(re.finditer(tied_pattern, console_output, re.DOTALL))
        
        for m in tied_matches:
            score = m.group(1)
            if score == target_score:
                iteration = m.group(2)
                layer_type = m.group(3)
                model_name = m.group(4).strip()
                answer_text = m.group(5).strip()
                info = f"Iteration {iteration}, {layer_type} layer, Model: {model_name}"
                
                if answer_text:
                    tied_list.append({
                        'text': answer_text,
                        'score': score,
                        'info': info,
                        'iteration': int(iteration),
                        'layer_type': layer_type
                    })
        
        if len(tied_list) <= 1:
            return []
        
        deduped_dict = {}
        for entry in tied_list:
            text = entry['text']
            if text not in deduped_dict or entry['iteration'] > deduped_dict[text]['iteration']:
                deduped_dict[text] = entry
        
        result = list(deduped_dict.values())
        
        return result if len(result) > 1 else []
    except Exception as e:
        logging.debug(f"Failed to extract tied answers from console: {e}")
        return []

def extract_prompts_from_console(console_output: str) -> list:
    if not console_output or not isinstance(console_output, str):
        return []
    
    try:
        matches = list(_RE_PROMPT_START.finditer(console_output))
        
        if not matches:
            return []
        
        prompts_dict = {}
        for m in matches:
            prompt_num = int(m.group(1))
            prompt_text = m.group(2).strip()
            if prompt_text and prompt_num not in prompts_dict:
                prompts_dict[prompt_num] = prompt_text
        
        if not prompts_dict:
            return []
        
        sorted_nums = sorted(prompts_dict.keys())
        return [prompts_dict[num] for num in sorted_nums]
        
    except Exception as e:
        logging.debug(f"Failed to extract prompts from console: {e}")
        return []

def extract_all_best_best_from_console(console_output: str) -> list:
    if not console_output or not isinstance(console_output, str):
        return []
    
    try:
        matches = list(_RE_FINAL_BESTBEST.finditer(console_output))
        
        if not matches:
            return []
        
        prompt_numbers = sorted(set(int(m.group(1)) for m in matches))
        all_results = []
        
        for prompt_num in prompt_numbers:
            answer_text, score, info, tied_entries, iteration, layer_type = extract_best_best_from_console(console_output, prompt_num)
            
            result = {
                'prompt_number': prompt_num,
                'best_answer': answer_text or '[No answer found]',
                'best_score': score or 'N/A',
                'best_info': info or 'No info',
                'has_ties': len(tied_entries) > 1,
                'alternative_answers': tied_entries if len(tied_entries) > 1 else [],
                'iteration': iteration,
                'layer_type': layer_type
            }
            all_results.append(result)
        
        return all_results
        
    except Exception as e:
        logging.debug(f"Failed to extract all best-best answers from console: {e}")
        return []

def extract_max_iteration_from_console(console_output: str) -> int:
    if not console_output or not isinstance(console_output, str):
        return 1
    
    try:
        matches = _RE_ITERATION.findall(console_output)
        if matches:
            return max(int(m) for m in matches)
    except Exception as e:
        logging.debug(f"Failed to extract max iteration from console: {e}")
    
    return 1

def clean_text_for_json(text: str) -> str:
    if not text:
        return ""
    
    text = _RE_NEWLINES.sub(' ', text)
    text = _RE_SPACES.sub(' ', text)
    text = text.replace('\t', ' ')
    text = text.strip()
    
    return text

def calculate_text_similarity(text1: str, text2: str) -> float:
    try:
        if not text1 or not text2:
            return 0.0
        text1_clean = _RE_WHITESPACE.sub(' ', text1.lower().strip())
        text2_clean = _RE_WHITESPACE.sub(' ', text2.lower().strip())
        if text1_clean == text2_clean:
            return 1.0
        common_chars = sum(1 for a, b in zip(text1_clean, text2_clean) if a == b)
        max_len = max(len(text1_clean), len(text2_clean))
        return common_chars / max_len if max_len > 0 else 0.0
    except Exception as e:
        logging.error(f"Error calculating text similarity: {e}")
        return 0.0

def deduplicate_similar_answers(answers: List[dict], similarity_threshold: float = 0.85) -> List[dict]:
    if not answers or len(answers) < 2:
        return answers
    
    deduplicated = []
    for candidate in answers:
        candidate_text = candidate.get('text', '')
        is_duplicate = False
        for kept in deduplicated:
            kept_text = kept.get('text', '')
            similarity = calculate_text_similarity(candidate_text, kept_text)
            if similarity >= similarity_threshold:
                is_duplicate = True
                break
        if not is_duplicate:
            deduplicated.append(candidate)
    
    return deduplicated
