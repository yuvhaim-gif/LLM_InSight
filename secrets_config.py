#!/usr/bin/env python3

import os
import sys
from dotenv import load_dotenv

load_dotenv()

_REQUIRED = ["APP_USER", "APP_PASS", "FLASK_SECRET"]
_OPTIONAL = ["MISTRAL_API_KEY", "GOOGLE_API_KEY", "LANGCHAIN_API_KEY"]

_missing = [k for k in _REQUIRED if k not in os.environ]
if _missing:
    print(f"ERROR: Missing required environment variables: {', '.join(_missing)}", file=sys.stderr)
    print("Copy .env.example to .env and fill in your values.", file=sys.stderr)
    sys.exit(1)

_skipped = [k for k in _OPTIONAL if not os.environ.get(k)]
if _skipped:
    print(f"NOTE: Optional keys not set: {', '.join(_skipped)}. Related providers will return errors when called.", file=sys.stderr)

ADMIN_USER = os.environ["APP_USER"]
ADMIN_PASS = os.environ["APP_PASS"]
FLASK_SECRET = os.environ["FLASK_SECRET"]
MISTRAL_API_KEY = os.environ.get("MISTRAL_API_KEY", "")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
LANGCHAIN_API_KEY = os.environ.get("LANGCHAIN_API_KEY", "")
LANGCHAIN_PROJECT = os.environ.get("LANGCHAIN_PROJECT", "llminsight")
