# Refactoring Notes

Guidance for maintaining and evolving the tool without breaking existing behavior. The tool's core value proposition — creating custom grading rubrics, automatic prompt optimization, A/B model testing, and synthetic data refinement via frontend selectors — must remain intact through any changes.

## Stable Contracts

- Route URLs and payload shapes used by frontend JS modules (`static/js/main/`, `static/js/review/`, `static/js/shared/`, `config_graders.js`).
- Session key names used across backend and frontend handoff.
- Runtime file names and paths: `ledger.jsonl`, `iteration_history.json`, `best_best_layer1.json`, `console_output.txt`, `runtime_state.db`.
- Backup payload version `2.0` and key layout (including `grader_setting_name` in `session_data`).
- Layer 3 grader category system: 1-8 configurable categories per grader setting, loaded from `graderdata/*.jsonl`.
- Grader setting JSONL file format: one JSON object per line with `key`, `rubric`, `grader`, `weight` fields.
- `grader_setting_name` in session and backup payload.
- Provider routing logic in `ai/api_calls.py` (model name determines provider).
- Standardized provider response format `{ content, token_info }`. Ollama unavailability returns `[OLLAMA_ERROR]` prefix (not dummy text).
- Error response prefixes: `[OLLAMA_TIMEOUT]`, `[OLLAMA_ERROR]`, `[GOOGLE_TIMEOUT]`, `[GOOGLE_ERROR]`, `[MISTRAL_TIMEOUT]`, `[MISTRAL_ERROR]`, `[GLM_TIMEOUT]`, `[GLM_ERROR]`.
- A/B test result structure per iteration: `original_score`, `improved_score`, `winner`.
- Weight normalization behavior: auto-normalized to sum 1, cleared when switching grader settings.

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
- Credentials are loaded from `.env` via `secrets_config.py`. Only `APP_USER`, `APP_PASS`, and `FLASK_SECRET` are required (missing these causes exit). Provider keys (`MISTRAL_API_KEY`, `GOOGLE_API_KEY`, `LANGCHAIN_API_KEY`) are optional — missing ones print a note at startup and the corresponding providers return errors when called. `LANGCHAIN_PROJECT` defaults to `"llminsight"` if unset.
- `utils/validation.py` provides input/integer/float/model validators.
- GLM model cache (`state._glm_model_cache`) is keyed by HuggingFace model ID, preloaded at startup, unloaded on exit/process signal. Thread-safe via double-checked locking (`state._glm_load_lock`), cancellable via `state._glm_cancel_load`. GLM cache/lock/cancel remain in-memory globals (not in SQLite) since they hold non-serializable Python objects.
- Per-session runtime state (iteration counter, processing flag, models executed) is stored in SQLite (`runtime_state.db`) via `db.py`, accessed through accessor functions in `state.py`. Session isolation uses a deterministic ID derived from `session['user']`. Iteration change events remain in-memory as a per-session `threading.Event` dict. `state.py` caches the resolved session ID in a thread-local variable for the duration of a loop run, avoiding repeated Flask session lookups. `db.py` maintains a `_known_sessions` set to skip redundant `_ensure_row` SELECT queries for already-seen sessions.
- `/iteration-wait` mirrors `/iteration` with no blocking/polling behavior.
- Review parsing includes compatibility branches for older backup formats.
- Layer 2 receives weights and uses them as optimization priorities to focus prompt improvement on weak high-weight areas.
- Layer 3 rubrics and grader models are loaded from the active grader setting at grade time, not cached at session start. If the named setting file is missing on disk (e.g., after restoring a backup from another machine), `get_layer3_grader_models()` falls back to session-stored graders. If the file exists, it remains the source of truth.
- Weight priority chain: user-applied custom weights -> active grader config defaults -> hardcoded `CATEGORY_WEIGHTS`.
- Config Graders: key names and setting names are normalized (lowercase, underscores). Duplicate key detection prevents saves with repeated key names.
- Weights entered as percentages on Config Graders page, converted to 0-1 decimals on save, converted back on load.
- `@traceable` decorator is resolved at import time in `utils/common.py`. If `langsmith` is not installed, a no-op decorator is used instead, so tracing is non-blocking.
- When advanced per-iteration models are saved, main sidebar selectors are locked (disabled) and show "Advanced (Per-Iteration)". Changing a main selector clears all advanced maps via `POST /clear_advanced_models`.
- Upload button on main page is disabled when console output is non-empty, preventing accidental overwrite of an active session.
- System type selector filters model dropdowns by speed category (FAST/MIDDLE/SLOWER/SLOW), not just a display preference.
- Review page All Prompts Summary table has hardcoded column headers for the default five categories (accuracy, clarity, creativity, structure, conciseness). Custom grading keys are only rendered dynamically in iteration cards and score grids.

## Safe Refactoring Steps

1. Keep endpoint signatures stable.
2. Frontend scripts are split into `shared/`, `main/`, and `review/` modules. The Deeper Analysis modal is unified in `shared/deeper-analysis.js`. All functions remain at global scope for inline handler compatibility.
3. Shared CSS is extracted to `static/css/shared.css`. Repeated HTML fragments are extracted to Jinja2 partials in `templates/partials/`. Page-specific CSS files retain only override rules.
4. 102 contract tests in `tests/` cover backup schema (11), restore behavior (15), advanced map compatibility (8), auth matrix (40), and provider routing (28). Uses `pytest` with monkeypatched temp directories and in-memory DB. Dev dependency in `requirements-dev.txt`.
5. Internal optimizations: incremental token usage merging via `_merge_token_usage`, thread-local session ID cache in `state.py`, module-level `ERROR_PREFIXES` constant and pre-compiled regex patterns, `_known_sessions` set in `db.py` to skip redundant SELECT queries.
6. Backend hardening: Ollama unavailability returns `[OLLAMA_ERROR]` prefix; `create_failed_grade_entry` accepts `score_weights` for correct scoring with custom grader keys; `backup_chat_json` guards session access with `has_request_context()`; `_merge_token_usage` covers all 6 layers including Layer 3's nested per-category structure; `get_layer3_grader_models()` falls back to session-stored graders when the named setting file is missing on disk.

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
- [user guide.md](./user%20guide.md)
