#!/usr/bin/env python3

from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class Layer2Critique(BaseModel):
    issues: List[str]
    suggestions: List[str]
    verdict: str

class Layer2Response(BaseModel):
    improved_prompt: str
    critique: Layer2Critique
    token_info: Optional[Dict[str, Any]] = None
