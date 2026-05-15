#!/usr/bin/env python3

import os
import sys
import signal
import atexit
import logging
import threading

from flask import Flask
from config import FLASK_SECRET, PORT, SSL_CERT_PATH, SSL_KEY_PATH, BACKUP_DIR
from config import LEDGER_FILE, BESTBEST_CACHE, ITERATION_HISTORY_FILE, CONSOLE_OUTPUT_FILE
from utils.file_io import backup_file, backup_chat_json, clear_file
from db import init_db, cleanup_old_sessions

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

app = Flask(__name__, template_folder='templates', static_folder='static', static_url_path='/static')
app.secret_key = FLASK_SECRET

app.config.update(
    MAX_CONTENT_LENGTH=16 * 1024 * 1024,
    SEND_FILE_MAX_AGE_DEFAULT=0,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=False,
    PERMANENT_SESSION_LIFETIME=86400
)


def startup_cleanup():
    print("STARTUP: Initializing clean state...")
    print("Backing up any existing working files (only if non-empty)...")
    backup_file(LEDGER_FILE, "startup")
    backup_file(BESTBEST_CACHE, "startup")
    backup_file(ITERATION_HISTORY_FILE, "startup")
    backup_file(CONSOLE_OUTPUT_FILE, "startup")
    print("Clearing working files for fresh start...")
    clear_file(LEDGER_FILE)
    clear_file(BESTBEST_CACHE)
    clear_file(ITERATION_HISTORY_FILE)
    
    active_threads = threading.enumerate()
    num_threads = len(active_threads)
    if num_threads > 1:
        print(f"Found {num_threads} active threads at startup (expected ~1 main thread)")
    
    init_db()
    cleanup_old_sessions(max_age_hours=24)
    print(f"Startup cleanup completed - ready to process prompts (Total threads: {num_threads})")

def exit_backup():
    try:
        logging.disable(logging.CRITICAL)
        print("EXIT: Saving session state...")
        from ai.api_calls import unload_glm_models
        unload_glm_models()
        print("Backing up any working files with content...")
        backup_file(LEDGER_FILE, "exit")
        backup_file(BESTBEST_CACHE, "exit")
        backup_file(ITERATION_HISTORY_FILE, "exit")
        backup_file(CONSOLE_OUTPUT_FILE, "exit")
        backup_chat_json("exit")
        print("Clearing working files...")
        clear_file(LEDGER_FILE)
        clear_file(BESTBEST_CACHE)
        clear_file(ITERATION_HISTORY_FILE)
        cleanup_old_sessions(max_age_hours=0)
        print("Exit backup completed")
    except Exception:
        pass

from routes import register_routes
register_routes(app)

atexit.register(exit_backup)

if __name__ == '__main__':
    startup_cleanup()
    
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)
    
    from ai.api_calls import preload_glm_models, unload_glm_models
    threading.Thread(target=preload_glm_models, daemon=True).start()

    def _shutdown_handler(signum, frame):
        print(f"\nSIGNAL {signum}: Shutting down...")
        unload_glm_models()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown_handler)
    signal.signal(signal.SIGTERM, _shutdown_handler)

    ssl_context = None
    if SSL_CERT_PATH and SSL_KEY_PATH and os.path.exists(SSL_CERT_PATH) and os.path.exists(SSL_KEY_PATH):
        ssl_context = (SSL_CERT_PATH, SSL_KEY_PATH)
        print(f"SSL enabled with cert: {SSL_CERT_PATH}")

    print(f"Starting LLM Analysis Tool on port {PORT}...")
    app.run(host='0.0.0.0', port=PORT, debug=False, ssl_context=ssl_context, threaded=True, use_reloader=False)
