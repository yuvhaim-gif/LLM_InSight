# Refactoring Notes

Guidance for maintaining and evolving the tool without breaking existing behavior. The tool's core value proposition — creating custom grading rubrics, automatic prompt optimization, A/B model testing, and synthetic data refinement via frontend selectors — must remain intact through any changes.

## Stable Contracts

- Route URLs and payload shapes used by frontend JS modules (`static/js/main/`, `static/js/review/`, `static/js/shared/`, `config_graders.js`, and the Preference Studio modules `static/js/studio/`, `static/js/arena/`, `static/js/dataset/`, `static/js/calibrate/`).
- Session key names centralized in `utils/session_keys.py` (constants prefixed `SK_`). All backend files use these constants instead of raw strings. The actual string values are the stable contract for frontend handoff.
- Runtime file names and paths: `data/ledger.jsonl`, `data/iteration_history.json`, `data/best_best_layer1.json`, `data/console_output.txt`, `data/runtime_state.db`.
- Backup payload version `2.0` and key layout (including `grader_setting_name` in `session_data`).
- Layer 3 grader category system: 1-8 configurable categories per grader setting, loaded from `graderdata/*.jsonl`.
- Grader setting JSONL file format: one JSON object per line with `key`, `rubric`, `grader`, `weight` fields.
- `grader_setting_name` in session and backup payload.
- Provider routing logic in `ai/api_calls.py` (model name determines provider).
- Standardized provider response format `{ content, token_info }`. Ollama unavailability returns `[OLLAMA_ERROR]` prefix (not dummy text).
- Error response prefixes: `[OLLAMA_TIMEOUT]`, `[OLLAMA_ERROR]`, `[GOOGLE_TIMEOUT]`, `[GOOGLE_ERROR]`, `[MISTRAL_TIMEOUT]`, `[MISTRAL_ERROR]`, `[GLM_TIMEOUT]`, `[GLM_ERROR]`.
- A/B test result structure per iteration: `original_score`, `improved_score`, `winner`.
- Weight normalization behavior: auto-normalized to sum 1, cleared when switching grader settings.
- Preference Studio isolation: all its state lives in `data/preferences.db` plus
  `data/preferences_export/` and `data/preferences_regrade/`. It only **calls** existing grading
  logic and never writes to the live ledger; the app's clear/backup lifecycle must not touch these.
- Preference Studio routes (`pref_bp` in `preference/routes.py`) and their JSON payload shapes are
  consumed by `static/js/studio/init.js` and the reused `arena/`, `dataset/`, `calibrate/` modules.
  The `/arena` and `/dataset` URLs both render `studio.html` (Judge / Build & Export tabs).

## Frontend/Backend Coupling

- Main page toggles and selectors are wired to specific API endpoints.
- Advanced mapping accepts both canonical (`layer1a_models`) and alias (`layer1a`) key forms.
- Review load flow copies these fields to `sessionStorage` for handoff to main page:
  - `loaded_last_prompt`, `loaded_layer1a_model`, `loaded_layer1b_model`
  - `loaded_layer0_model`, `loaded_layer2_model`
  - `loaded_layer1_last_best_context_enabled`, `loaded_grade_vs_prompt_mode`
  - `loaded_grader_setting_name`
- Chart.js and datalabels plugin loaded from CDN via `_head_charts.html` partial in both `main.html` and `review.html`.
- Config Graders page receives `AVAILABLE_GRADER_MODELS`, `INITIAL_CONFIG`, and `INITIAL_SETTING_NAME` as inline script variables from the template.
- Grader setting selector on main page triggers `applyGraderSetting()` (in `main/grader-settings.js`) which calls `/set_grader_setting` and dynamically rebuilds weight inputs.
- Review page iteration cards and score grids detect grading keys dynamically from data — they are not hardcoded to the default five categories. However, the All Prompts Summary table header columns are hardcoded to the default five (accuracy, clarity, creativity, structure, conciseness).
- `shared/deeper-analysis.js` uses `typeof initialGraderWeights !== 'undefined'` to safely handle the review page where that template variable is not defined. On the review page, `openDeeperAnalysis()` receives `graderSettingName` and `savedWeights` from the chat data; on the main page, it reads weights from sidebar inputs.
- `main.html` loads 13 script files (3 shared + 10 main); `review.html` loads 9 (3 shared + 6 review). Load order matters: shared first, then domain modules, then init (which registers event listeners). CSS load order: `shared.css` (via `_head_common.html` partial) loads before page-specific CSS files, ensuring page overrides work correctly.

## Implementation Notes

- Progress endpoints (`/is-processing`, `/iteration`, `/iteration-wait`) are public (no auth guard).
- `max_iterations`: backend and UI both enforce 1-5.
- Frontend JS is split into modular files under `static/js/shared/`, `static/js/main/`, and `static/js/review/`. The Deeper Analysis modal code is unified in `shared/deeper-analysis.js` (used by both main and review pages). All functions remain at global scope for compatibility with inline `onclick` handlers in templates. Script load order in templates preserves dependency chains: shared modules → domain modules → init.
- Credentials are loaded from `.env` via `config/secrets.py`. Only `APP_USER`, `APP_PASS`, and `FLASK_SECRET` are required (missing these causes exit). Provider keys (`MISTRAL_API_KEY`, `GOOGLE_API_KEY`, `LANGCHAIN_API_KEY`) are optional — missing ones print a note at startup and the corresponding providers return errors when called. `LANGCHAIN_PROJECT` defaults to `"llminsight"` if unset.
- `utils/validation.py` provides input/integer/float/model validators.
- GLM model cache (`state._glm_model_cache`) is keyed by HuggingFace model ID, preloaded at startup, unloaded on exit/process signal. Thread-safe via double-checked locking (`state._glm_load_lock`), cancellable via `state._glm_cancel_load`. GLM cache/lock/cancel remain in-memory globals (not in SQLite) since they hold non-serializable Python objects.
- Per-session runtime state (iteration counter, processing flag, models executed) is stored in SQLite (`data/runtime_state.db`) via `core/db.py`, accessed through accessor functions in `core/state.py`. Session isolation uses a deterministic ID derived from `session['user']`. Iteration change events remain in-memory as a per-session `threading.Event` dict. `core/state.py` caches the resolved session ID in a thread-local variable for the duration of a loop run, avoiding repeated Flask session lookups. `core/db.py` uses per-call connections with `try/finally` to prevent stale connection issues in a threaded server; each connection enables `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` for resilience under concurrent progress-poll reads. WAL is internal to `runtime_state.db` (plus its `-wal`/`-shm` sidecars, both git-ignored) and does not touch chat/working files or the backup lifecycle.
- `/iteration-wait` mirrors `/iteration` with no blocking/polling behavior.
- Review parsing includes compatibility branches for older backup formats.
- Layer 2 receives weights and uses them as optimization priorities to focus prompt improvement on weak high-weight areas.
- Layer 3 rubrics and grader models are loaded from the active grader setting at grade time, not cached at session start. If the named setting file is missing on disk (e.g., after restoring a backup from another machine), `get_layer3_grader_models()` falls back to session-stored graders. If the file exists, it remains the source of truth.
- Weight priority chain: user-applied custom weights -> active grader config defaults -> hardcoded `CATEGORY_WEIGHTS`.
- Config Graders: key names and setting names are normalized (lowercase, underscores). Duplicate key detection prevents saves with repeated key names.
- Weights entered as percentages (-100 to 100) on Config Graders page, converted to decimals on save, converted back on load. Negative weights are allowed; the total must still equal 100%.
- `@traceable` decorator is resolved at import time in `utils/common.py`. If `langsmith` is not installed, a no-op decorator is used instead, so tracing is non-blocking.
- When advanced per-iteration models are saved, main sidebar selectors are locked (disabled) and show "Advanced (Per-Iteration)". Changing a main selector clears all advanced maps via `POST /clear_advanced_models`.
- Upload button on main page is disabled when console output is non-empty, preventing accidental overwrite of an active session.
- System type selector filters model dropdowns by speed category (FAST/MIDDLE/SLOWER/SLOW), not just a display preference.
- Review page All Prompts Summary table has hardcoded column headers for the default five categories (accuracy, clarity, creativity, structure, conciseness). Custom grading keys are only rendered dynamically in iteration cards and score grids.

## Safe Refactoring Steps

1. Keep endpoint signatures stable.
2. Frontend scripts are split into `shared/`, `main/`, and `review/` modules. The Deeper Analysis modal is unified in `shared/deeper-analysis.js`. All functions remain at global scope for inline handler compatibility.
3. Shared CSS is extracted to `static/css/shared.css`. Repeated HTML fragments are extracted to Jinja2 partials in `templates/partials/`. Page-specific CSS files retain only override rules.
4. 217 contract tests in `tests/` cover backup schema (11), restore behavior (15), advanced map compatibility (8), auth matrix (44), provider routing (24), route-refactor parity (24), and CSRF protection (9) — 135 core tests — plus 82 Preference Studio tests (`test_pref_*`: store, extract, active-learning, calibrate, dataset, examples, export, routes, sources, user_pref, wiring). Uses `pytest` with monkeypatched temp directories and in-memory DB. Dev dependency in `requirements-dev.txt`.
5. Internal optimizations: incremental token usage merging via `_merge_token_usage`, thread-local session ID cache in `core/state.py`, module-level `ERROR_PREFIXES` constant and pre-compiled regex patterns. Summary/display logic extracted to `ai/iteration_summary.py`. Provider post-thread result handling consolidated in `_handle_thread_result` helper in `ai/api_calls.py`.
6. Backend hardening: Ollama unavailability returns `[OLLAMA_ERROR]` prefix; `create_failed_grade_entry` accepts `score_weights` for correct scoring with custom grader keys; `backup_chat_json` guards session access with `has_request_context()`; `_merge_token_usage` covers all 6 layers including Layer 3's nested per-category structure; `get_layer3_grader_models()` falls back to session-stored graders when the named setting file is missing on disk.
7. Route boilerplate in `routes/api_routes.py` is centralized without changing any URL, payload, or response shape: the repeated unauthenticated guard (`{'error': 'Not authenticated'}`, 401) is a `login_required` decorator; the four model `update_*`/`reset_*` pairs and the four boolean toggle endpoints are generated from `_MODEL_ROUTE_SPECS`/`_TOGGLE_ROUTE_SPECS` via `_make_update_model_route`/`_make_reset_model_route`/`_make_toggle_route` (registered with `add_url_rule`, endpoint names unchanged). The `layer2` update keeps its quirk of defaulting a missing `model` to `DEFAULT_LAYER2_MODEL`. Session-reset defaults shared by `login` and `clear_chat` live in `_apply_default_settings()`. Routes that return the `{'success': False, ...}` unauth shape (`save_current_selection`, `save_chat_for_review`, `get_backup_data`) keep their inline guard. Parity is locked by `tests/test_route_refactor_parity.py`.
8. GLM model load in `ai/api_calls.py` selects `attn_implementation` with a graceful fallback: `flash_attention_2` when CUDA and the `flash_attn` package are both present, otherwise `sdpa` on CUDA, and `None` on CPU. CUDA+`flash_attn` and CPU paths are unchanged; only a CUDA host missing `flash_attn` (previously a hard failure) now falls back to `sdpa`.
9. `core/db.py` enables SQLite WAL (`PRAGMA journal_mode=WAL`) and a 5s `busy_timeout` per connection, guarded by `try/except sqlite3.Error`. This only affects `runtime_state.db` (counters/flags), never chat data or the displayed console, so frontend output is unchanged.
10. Session cookie hardening in `main.py` is non-breaking by construction: `SESSION_COOKIE_HTTPONLY=True` (already the Flask default) and `SESSION_COOKIE_SECURE=_SSL_CONFIGURED`, where `_SSL_CONFIGURED` is true only when valid `SSL_CERT_PATH`/`SSL_KEY_PATH` files exist. On plain-HTTP deployments `SECURE` stays `False` exactly as before; it tightens to `True` only when the server is already running HTTPS. `SAMESITE` and session lifetime are unchanged.
11. CSRF protection (`utils/csrf.py`, wired via `init_csrf(app)` in `main.py`) guards mutating requests with a per-session `secrets.token_hex(32)` token validated in an `app.before_request` hook using `hmac.compare_digest`. The token is exposed via the `csrf_token()` context processor — rendered into `<meta name="csrf-token">` in the single shared head partial `templates/partials/_head_common.html` (included by all five templates) and into hidden `csrf_token` fields in the three HTML forms (`analysisForm`, `clear-form`, login). A global `fetch` wrapper (`static/js/shared/csrf.js`, loaded from the head partial before any deferred module script) attaches the `X-CSRFToken` header to all same-origin non-safe-method JS calls, so no per-call JS edits were needed. The displayed console/chat output is unaffected (CSRF acts only on request admission). Gated by `CSRF_ENABLED` (default `True`; set `False` in `tests/conftest.py` so the pre-existing tests need no tokens). Safe methods and `api.shutdown_notify` are exempt. Enforcement, token round-trip, and template rendering are locked by `tests/test_csrf.py` (9 tests).

## Regression Checklist

- Login -> submit prompt -> iterate -> stop conditions work correctly.
- Toggle state survives navigation and resets.
- Download JSON -> Review -> Load restores prompt/model/toggle/grader-setting state.
- Review delete updates listing without affecting active runtime files.
- `iteration_history.json` and `best_best_layer1.json` remain readable by UI code.
- All four providers (Ollama, Mistral, Gemini, GLM) return the standardized response format.
- Layer 3 parallel grading retries and fallback scoring work on model failures.
- Tied best-best entries are deduplicated and persisted correctly.
- Custom grader settings load, save, and apply correctly; default setting remains read-only.
- Switching grader setting on main page clears custom weights and rebuilds weight inputs dynamically.
- Config Graders page: create new setting, edit, save, load, overwrite confirmation, weight total validation.
- Review page: Analyze Deeper modal detects dynamic keys and shows grader setting name from the run.
- A/B test results (original vs improved, winner) display correctly in iteration cards.
- Advanced per-iteration model maps apply correctly for Layer 1A, 1B, and Layer 2.
- Advanced model save locks main selectors; changing main selector clears advanced maps and unlocks.
- Upload button disabled when console has content, enabled when empty.
- System type selector correctly filters model dropdowns by speed category.
- Multi-prompt sessions carry best-best context forward correctly.
- All inline `onclick`/`onchange` handlers in templates and dynamically-generated HTML resolve to globally-scoped functions in loaded modules.
- Deeper Analysis modal works on both main page (reads sidebar weights) and review page (receives saved weights from chat data).
- `runtime_state.db` is created automatically on first startup via `init_db()`.
- Per-session state isolation: two simultaneous browser sessions do not interfere with each other's iteration counters or processing flags.
- Login, logout, and clear chat reset the session's state DB row before clearing the Flask session.
- Server restarts cleanly: old DB rows are cleaned up at startup (24h) and exit (all rows).
- When Ollama is not installed, error is correctly detected (`[OLLAMA_ERROR]` prefix) and Layer 3 grading is skipped with score 1.
- Failed iterations with custom grader keys produce score ~1 (not ~50) via `create_failed_grade_entry` with session weights.
- Exit-time and signal-handler backups produce valid JSON with file-based data even when no Flask request context exists (session_data is empty `{}`).
- Token usage summaries include all 6 layers (layer0, layer1a, layer1b, layer2, layer3a, layer3b) in `tools_token_usage`.
- Restoring a backup with a grader setting name not present on disk uses session-stored graders as fallback; if the file does exist, it takes priority.

## References

- [README.md](../README.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [IMPLEMENTATION.md](./IMPLEMENTATION.md)
- [preference_studio.md](./preference_studio.md)
- [user guide.md](./user%20guide.md)
