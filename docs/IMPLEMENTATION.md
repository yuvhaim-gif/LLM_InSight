# Implementation Details

Route contracts, runtime behavior, JSON schemas, configuration, and frontend integration. Covers all endpoints, layer behavior, provider transport, control constraints, data schemas, configuration files, and frontend selectors.

## Routes

### Web

| Method | Path | Description |
|---|---|---|
| `GET /` | Render main analysis page with all selectors, toggles, results, and charts |
| `POST /` | Run iterative analysis for submitted prompt |
| `GET /config_graders` | Render grader configuration page for creating/editing rubrics |

### Auth and Session

| Method | Path | Description |
|---|---|---|
| `GET\|POST /login` | Login page / authenticate |
| `GET /logout` | End session, back up, redirect to login |
| `POST /clear_chat` | Back up and reset runtime state (stay logged in) |
| `POST /shutdown-notify` | Acknowledge browser close (no-op) |

### Progress

| Method | Path | Description |
|---|---|---|
| `GET /is-processing` | Returns `{ processing, models_executed }` |
| `GET /iteration` | Returns `{ iteration }` (current iteration number) |
| `GET /iteration-wait` | Same as `/iteration` (no blocking behavior) |

### Models and Weights

| Method | Path | Description |
|---|---|---|
| `POST /update_layer1a_model` | Set Layer 1A model |
| `POST /reset_layer1a_model` | Reset Layer 1A to default |
| `POST /update_layer1b_model` | Set Layer 1B model |
| `POST /reset_layer1b_model` | Reset Layer 1B to default |
| `POST /update_layer0_model` | Set Layer 0 model |
| `POST /reset_layer0_model` | Reset Layer 0 to default |
| `POST /update_layer2_model` | Set Layer 2 model |
| `POST /reset_layer2_model` | Reset Layer 2 to default |
| `POST /update_weights` | Set custom category weights |
| `POST /reset_weights` | Reset to active grader setting's default weights |
| `GET /get_current_models` | Get all active model selections |

### Advanced Model Mapping

| Method | Path | Description |
|---|---|---|
| `GET /get_advanced_models` | Get per-iteration model maps |
| `POST /save_advanced_models` | Save per-iteration maps (accepts canonical + alias keys) |
| `POST /clear_advanced_models` | Clear all advanced maps |

### Loop Toggles

| Method | Path | Description |
|---|---|---|
| `POST /set_degradation_break` | Toggle degradation break |
| `POST /set_change_prompt_between_layers1` | Toggle prompt improvement (Layer 2) |
| `POST /set_give_ideas` | Toggle Layer 0 idea generation |
| `POST /set_layer1_last_best_context` | Toggle context carry-over between iterations |
| `POST /set_grade_vs_prompt_mode` | Set to `first` or `current` |

### Grader Settings

| Method | Path | Description |
|---|---|---|
| `GET /grader_settings` | List all available grader settings and the active one |
| `GET /grader_setting/<name>` | Load a grader setting by name |
| `POST /save_grader_setting` | Save a grader setting (max 8 keys, `default` is read-only) |
| `POST /set_grader_setting` | Set the active grader setting for the session (clears custom weights) |
| `GET /get_grader_config` | Get the active grader configuration (keys, rubrics, models, weights) |

### Backup and Review

| Method | Path | Description |
|---|---|---|
| `POST /save_current_selection` | Mark session as modified (flush pending state) |
| `GET /get_backup_data` | Export full session as JSON (version 2.0) |
| `GET /review_chats` | Render review page |
| `GET /get_chat_stats` | Get stats for all backup files in `~/Downloads` |
| `POST /load_chat_from_review` | Restore a backup into the active session |
| `POST /delete_chat_file` | Delete a backup file from `~/Downloads` |
| `POST /upload_chat_json` | Upload and restore a JSON backup |

## Auth Behavior

| Endpoint group | Guard | Unauthenticated result |
|---|---|---|
| `/login` | None | Shows login page |
| `GET /`, `POST /`, `/clear_chat`, `/config_graders` | `session['logged_in']` | Redirect to `/login` |
| Model/weights/toggle/advanced/grader APIs | `session['logged_in']` | JSON 401 |
| Progress APIs | Currently public | JSON response |
| `/shutdown-notify` | Currently public | JSON response |
| `/get_backup_data` | `session['logged_in']` | JSON 401 |
| Review load/delete | `session['user']` | Redirect or JSON 401 |
| `/upload_chat_json` | `session['logged_in']` | JSON error |

## Loop Behavior

1. Prompt appended to `session['prompt_history']`.
2. Layer 0 runs once (when enabled): up to 5 micro-idea directions.
3. Per iteration:
   - Resolve model (advanced map override or session default).
   - Layer 1A: answer with original prompt (+ optional accumulated context).
   - Layer 3: grade Layer 1A (or assign score 1 on Layer 1 error/timeout).
   - Layer 2: rewrite prompt (when enabled) using grader feedback, weights, best answers, micro-replies, and context.
   - Layer 1B: answer with rewritten prompt (or original if Layer 2 off/failed).
   - Layer 3: grade Layer 1B (same fallback logic).
   - Pick winner (`improved` wins ties for iteration best selection and recorded winner).
   - Record A/B test result (original score, improved score, winner).
   - Persist iteration data.
4. Stop on first match: score >= `min_grade`, degradation break (score dropped), or `max_iterations` reached.
5. Mark best-best/ties, save to `iteration_history.json`, `best_best_layer1.json`, and ledger.
6. Token usage accumulated incrementally per iteration via `_merge_token_usage` (no post-loop scan). Final totals written to all entries and saved with history.

## Layer Behavior

### Layer 0 (`ai/layer0.py`)

- Generates up to 5 concise alternative idea directions (not answers).
- Receives optional previous-prompt and best-best context for multi-prompt sessions.
- Returns `(micro_replies: list[str], original_prompt: str, token_info: dict)`.
- Default model: `gemma2:9b`.
- Skipped when Give Ideas toggle is off.

### Layer 1 (`ai/layer1.py`)

- Generates a full answer from prompt + optional accumulated context.
- Two variants: `original` (Layer 1A) and `improved` (Layer 1B).
- Model resolved from advanced per-iteration map or session default.
- Defaults: Layer 1A `gemma:7b-instruct-q4_K_M`, Layer 1B `granite4:latest`.
- Each call logged to ledger with timestamp, model, runtime, tokens.
- Model resolution consolidated to a single summary print per call: `"⏹️  Iteration {N} - Layer1{A/B}: {model} ({source})"`. Model change detection logged at `DEBUG` level.
- Timeout: 240s.

### Layer 2 (`ai/layer2.py`)

- Rewrites the prompt using grader feedback, best answers, micro-replies, recent prompts, and category weights.
- Uses prompt engineering techniques as needed: Zero-Shot, Few-Shot, CoT, Self-Consistency, Least-to-Most, ToT, Directional Stimulus, Role Prompting, Generated Knowledge, CoVe, Skeleton-of-Thought.
- Hierarchy of truth: the current prompt is authoritative; feedback and weights are secondary signals.
- Incorporates optimization priorities (weights) to focus on weak high-weight areas.
- Returns `Layer2Response`: `improved_prompt`, `critique { issues, suggestions, verdict }`, `token_info`.
- Default model: `open-mistral-nemo-2407`.
- Model resolved from advanced per-iteration map or session default.
- Skipped when Change Prompt toggle is off.

### Layer 3 (`ai/layer3.py`)

- Configurable grader models loaded from the active grader setting (`graderdata/*.jsonl`). Default: accuracy (`phi3:mini`), clarity (`gemma2:2b`), conciseness (`qwen2.5:1.5b`), creativity (`llama3.2:3b`), structure (`qwen2.5:1.5b`).
- Available grader models: `phi3:mini`, `gemma2:2b`, `qwen2.5:1.5b`, `llama3.2:3b`.
- 1-8 grading categories per setting, each with its own rubric and grader model.
- Grades all categories in parallel (ThreadPoolExecutor).
- Up to 3 retries per category on error, invalid JSON, or out-of-range score.
- Scoring rubric: 50 = pass, 75 = good, 95 = near-perfect, 100 = reserved (never awarded), below 50 = failure.
- Scores clamped to integers 1-100. Failed graders default to 50.
- Weighted overall computed using session weights (priority: user-applied custom weights -> active grader config defaults -> hardcoded defaults).
- Prompt reference mode: `current` (latest prompt) or `first` (first prompt in session).

## Provider Transport (`ai/api_calls.py`)

| Provider | Method | Retry | Token tracking |
|---|---|---|---|
| Ollama | `ollama.chat()`, threaded | Timeout only | `prompt_eval_count`, `eval_count` |
| Mistral | REST API, threaded | 3 retries, exponential backoff (1s base) | `prompt_tokens`, `completion_tokens` |
| Gemini | REST API, threaded | 5 retries, constant 3s delay | `promptTokenCount`, `candidatesTokenCount` |
| GLM-4 | HuggingFace `transformers`, local, cached by HF model ID with thread-safe loading, preloaded at startup, unloaded on exit/process signal | Timeout only | Estimated from input/output length |

All return `{ content, token_info: { tool, input_tokens, output_tokens, total_tokens } }`.

Error responses use standardized prefixes: `[OLLAMA_TIMEOUT]`, `[OLLAMA_ERROR]`, `[GOOGLE_TIMEOUT]`, `[GOOGLE_ERROR]`, `[MISTRAL_TIMEOUT]`, `[MISTRAL_ERROR]`, `[GLM_TIMEOUT]`, `[GLM_ERROR]`.

## Configuration

### Environment Variables (`secrets_config.py`)

Variables are loaded from `.env` via `python-dotenv`.

| Variable | Required | Used by |
|---|---|---|
| `APP_USER` | **Yes** | Login authentication (`routes/api_routes.py`) |
| `APP_PASS` | **Yes** | Login authentication |
| `FLASK_SECRET` | **Yes** | Flask session encryption (`main.py`) |
| `MISTRAL_API_KEY` | No | Mistral REST API calls (`ai/api_calls.py`) |
| `GOOGLE_API_KEY` | No | Google Gemini REST API calls (`ai/api_calls.py`) |
| `LANGCHAIN_API_KEY` | No | LangSmith tracing (`config.py` sets `LANGCHAIN_TRACING_V2`, `LANGSMITH_TRACING`) |
| `LANGCHAIN_PROJECT` | No | LangSmith project name (default: `llminsight`) |
| `PORT` | No | Server port (default: `5000`, read in `config.py`) |
| `SSL_CERT_PATH` | No | HTTPS certificate path (`main.py`) |
| `SSL_KEY_PATH` | No | HTTPS key path (`main.py`) |

Startup behavior: missing required variables print an error and `sys.exit(1)`. Missing optional provider keys print a note to stderr and default to empty strings — providers with missing keys return error responses when called.

### Model Configuration (`config.py`)

| Setting | Purpose |
|---|---|
| `DEFAULT_LAYER1A_MODEL` | Pre-selected Layer 1A model on new session |
| `DEFAULT_LAYER1B_MODEL` | Pre-selected Layer 1B model on new session |
| `DEFAULT_LAYER0_MODEL` | Pre-selected Layer 0 model on new session |
| `DEFAULT_LAYER2_MODEL` | Pre-selected Layer 2 model on new session |
| `LAYER3_GRADER_MODELS` | Default grader model per category (used when no grader setting overrides) |
| `AVAILABLE_GRADER_MODELS` | Allowed models in Config Graders page dropdown |
| `_CORE_MODELS` | Base model list for Layer 1A/1B selectors |
| `AVAILABLE_LAYER0_MODELS` | Allowed models for Layer 0 selector |
| `AVAILABLE_LAYER2_MODELS` | Allowed models for Layer 2 selector |
| `_GEMINI_MODELS` | Model names routed to Google Gemini API |
| `_MISTRAL_MODELS` | Model names routed to Mistral API |
| `_GLM_MODELS` | Model names routed to GLM-4 HuggingFace inference |
| `_GLM_MODEL_MAP` | Maps display model names to HuggingFace model IDs |
| `CATEGORY_WEIGHTS` | Hardcoded fallback weights (lowest priority in weight chain) |

### Dependencies (`requirements.txt`)

| Package | Purpose | Optional |
|---|---|---|
| `flask` | Web framework | No |
| `pydantic` | Data validation (Layer 2 response schemas) | No |
| `ollama` | Ollama local inference client | Yes (if not using Ollama models) |
| `requests` | HTTP client for Mistral/Gemini REST APIs | No |
| `python-dotenv` | Load `.env` into environment | No |
| `transformers` | HuggingFace model loading for GLM-4 | Yes (only for GLM models) |
| `torch` | PyTorch backend for GLM-4 | Yes (only for GLM models) |
| `langsmith` | `@traceable` decorator for observability | Yes (falls back to no-op) |

### Dev Dependencies (`requirements-dev.txt`)

| Package | Purpose |
|---|---|
| `pytest` | Contract test suite (102 tests: backup schema, restore, advanced maps, auth matrix, provider routing) |

### Grader Settings (`graderdata/*.jsonl`)

One file per named setting. Each file has one JSON object per line: `{ key, rubric, grader, weight }`. The `default.jsonl` file ships with the project and is read-only. Custom settings are created via the Config Graders page and stored in the same directory.

## Control Constraints

- `min_grade`: clamped to 0-100, default 100.
- `max_iterations`: 1-5, default 5.
- Weight updates require all active grader setting category keys, each value in [0, 1]; auto-normalized to sum 1.
- Model updates validated against allow-lists in `config.py`.
- Grader setting saves require: name not `default`, max 8 entries, each entry has key/rubric/grader, grader in `AVAILABLE_GRADER_MODELS`.

## Extending the System

### Adding a new model (existing provider)

1. Add the model name to the relevant list(s) in `config.py` (e.g. `_CORE_MODELS`, `AVAILABLE_LAYER0_MODELS`, `AVAILABLE_LAYER2_MODELS`).
2. For Ollama models: pull the model with `ollama pull <name>`.
3. For Gemini/Mistral: add the name to `_GEMINI_MODELS` or `_MISTRAL_MODELS` in `config.py`.

### Adding a new API provider

1. Add the API key variable to `.env` and load it in `secrets_config.py` (add to `_OPTIONAL` list).
2. In `ai/api_calls.py`:
   - Define a model name tuple (e.g. `_OPENAI_MODELS`) in `config.py`.
   - Add a routing check in `call_model()` before the Ollama fallback.
   - Implement `call_yourprovider()` returning `_make_response(content, tool, input_tokens, output_tokens)`.
   - Use `_post_with_retry()` for HTTP calls with retry/backoff.
3. Add model names to the UI lists in `config.py`.
4. Add an error prefix pair (e.g. `[YOURAPI_TIMEOUT]`, `[YOURAPI_ERROR]`) and include in `is_error_response()`.

### Adding a new grader model

Add the model name to `AVAILABLE_GRADER_MODELS` in `config.py`. Graders route through `call_model()` like any other call — the model must be available via one of the configured providers (typically Ollama for small models).

### Disabling a provider

- **Mistral/Gemini**: omit the API key from `.env`. Update `DEFAULT_LAYER2_MODEL` if it points to a model from the disabled provider.
- **GLM-4**: remove model names from `_GLM_MODELS` and model lists in `config.py`. Optionally remove `transformers` and `torch` from `requirements.txt`.
- **Ollama**: remove Ollama-only models from all lists in `config.py`. Update all `DEFAULT_LAYER*` and `LAYER3_GRADER_MODELS` to use cloud provider models. Remove `ollama` from `requirements.txt`.
- **LangSmith**: omit `LANGCHAIN_API_KEY`. The `@traceable` decorator falls back to a no-op.

## JSON Schemas

### Backup/Export (version 2.0)

```json
{
  "console_output": "string",
  "prompt_history": ["string"],
  "all_prompt_results": ["object"],
  "iteration_history": {
    "prompts": {
      "prompt_1": {
        "prompt_number": 1,
        "iterations": ["IterationData"],
        "tools_token_usage": {}
      }
    }
  },
  "best_best_cache": {
    "best_best_entry": "object",
    "tied_entries": ["object"],
    "has_ties": false,
    "prompt_number": 1,
    "timestamp": "ISO-8601"
  },
  "ledger_entries": ["LedgerEntry"],
  "session_data": {
    "current_weights": {},
    "layer1a_model": "string",
    "layer1b_model": "string",
    "layer0_model": "string",
    "layer2_model": "string",
    "layer3_graders": {},
    "advanced_layer1a_models": {},
    "advanced_layer1b_models": {},
    "advanced_layer2_models": {},
    "degradation_break_enabled": true,
    "change_prompt_between_layers1": true,
    "give_ideas_enabled": true,
    "layer1_last_best_context_enabled": true,
    "grade_vs_prompt_mode": "current",
    "grader_setting_name": "default",
    "min_grade": 100,
    "max_iterations": 5
  },
  "timestamp": "ISO-8601",
  "version": "2.0"
}
```

### IterationData

```json
{
  "iteration": 1,
  "layer1a_score": 73,
  "layer1b_score": 79,
  "layer1a_grades": { "accuracy": 70, "clarity": 75, "conciseness": 72, "creativity": 74, "structure": 73 },
  "layer1b_grades": { "accuracy": 78, "clarity": 80, "conciseness": 77, "creativity": 79, "structure": 81 },
  "layer1a_model_used": "string",
  "layer1b_model_used": "string",
  "layer1a_time": 1.23,
  "layer1b_time": 1.45,
  "layer1a_tokens": 123,
  "layer1b_tokens": 145,
  "winner": "improved",
  "best_score": 79,
  "is_best_best": true,
  "prompt_number": 1,
  "layer2_improved_prompt": "string",
  "layer2_critique": { "issues": [], "suggestions": [], "verdict": "string" },
  "layer3_feedback_original": "string",
  "layer3_feedback_improved": "string",
  "token_data": {},
  "all_tools_token_usage": {}
}
```

### token_data (per iteration)

```json
{
  "layer0": {},
  "layer1a": { "tool": "string", "input_tokens": 0, "output_tokens": 0, "total_tokens": 0 },
  "layer1b": { "tool": "string", "input_tokens": 0, "output_tokens": 0, "total_tokens": 0 },
  "layer2": {},
  "layer3a": {},
  "layer3b": {}
}
```

### Ledger Entry (JSONL)

```json
{
  "timestamp": "ISO-8601",
  "layer": "Layer1|Layer3",
  "prompt_number": 1,
  "iteration": 1,
  "type": "original|improved",
  "model_used": "string",
  "model_source": "string",
  "runtime_in_sec": 1.2,
  "token_info": { "tool": "string", "input_tokens": 0, "output_tokens": 0, "total_tokens": 0 }
}
```

Layer 1 entries add: `prompt`, `layer1_reply`. Layer 3 entries add: `grade`, `overall_score`, `grade_tag`, `feedback`, `raw_grader_output`, `raw_grader_outputs`, `layer3_graders`, `prompt_reference_mode`.

### Grader Setting (JSONL, one object per line)

```json
{
  "key": "accuracy",
  "rubric": "Meaning: factual correctness...",
  "grader": "phi3:mini",
  "weight": 0.25
}
```

## Frontend Integration

### Template Structure

All four page templates (`main.html`, `review.html`, `config_graders.html`, `login.html`) use shared Jinja2 partials from `templates/partials/`:

- **`_head_common.html`** — charset, viewport meta, favicon SVG, Dancing Script font, `shared.css` link. Included in every template's `<head>`.
- **`_head_charts.html`** — Chart.js and datalabels CDN scripts. Included in `main.html` and `review.html`.
- **`_footer.html`** — footer div with production warning and rights notice. Included at the bottom of every template.
- **`_logo_badge.html`** — gradient circle brand badge. Accepts `badge_size` (default 180), `badge_font_size` (default 2.2rem), and `badge_extra_style` via `{% with %}`. Used in main (header 180px, processing 140px), review (140px fixed), config_graders (140px fixed), and login (via `.logo-circle` CSS class).
- **`_deeper_analysis_modal.html`** — deeper analysis modal markup. Accepts `modal_title` and `modal_placeholder`. Used in `main.html` and `review.html`.
- **`_model_icon.html`** — Jinja macro `cloud_icon(model)` that emits ☁️ for cloud-provider models. Used in model selector blocks and advanced sidebar.
- **`_model_selector.html`** — Jinja macro `model_selector(layer_label, select_id, model_list, current_model, default_model, apply_fn, reset_fn, status_id, color_class, tooltip)` for sidebar model selector blocks. Used 4 times in `main.html`.

CSS load order: `shared.css` (via `_head_common.html`) → page-specific CSS. This ensures page-specific rules override shared base styles.

### Main Page (`main.html` + `main.js`)

#### Selectors and Controls

- **Model selectors** (right sidebar): Layer 0, Layer 1A, Layer 1B, Layer 2 with Apply/Reset per selector.
- **Advanced panel** (right sidebar toggle): per-iteration model assignment for Layer 1A, 1B, and Layer 2. When advanced models are saved, the corresponding main sidebar selectors are locked (disabled) and show "Advanced (Per-Iteration)". Changing a main selector clears all advanced maps and unlocks the selectors.
- **Weight inputs** (top-left): per-category weight fields with Apply/Reset, auto-sum indicator, pencil icon for unapplied edits.
- **Grader setting selector** (weights area): dropdown to switch active grading rubric. Switching clears custom weights and updates weight inputs dynamically.
- **Config Graders link** (weights area): navigates to `/config_graders`.
- **Domain advisor filter**: filters model dropdowns visually by domain (All, Coding/Dev, Creative/Writing, Science/Reasoning, Experimental, Balanced). Stored in `localStorage`.
- **Domain Selection (weight presets)**: pre-fills weight fields (Balanced, Accuracy, Creativity, Conciseness). Stored in `localStorage`.
- **Break Target Grade**: input field, 1-100, default 100.
- **Max Iterations**: input field, 1-5, default 5.
- **Toggles**: Degradation Break, Change Prompt, Give Ideas, Last Best Answer Retention, Grade vs. Current/First Prompt.
- **System type selector** (top-left corner): Simple Laptop / Good Laptop or Desktop / Super Laptop or Good Desktop. Filters model dropdowns by speed category — Simple shows only fast and middle models, Good adds slower models, Super shows all including the slowest. Models are categorized as FAST (green), MIDDLE (yellow), SLOWER (orange), or SLOW (red) based on size and resource requirements. Stored in `localStorage`.

#### Actions

- Prompt submit (`POST /`), clear chat, upload/download JSON (restorable) or text (human-readable), review navigation. Upload is disabled when the console already has content (to prevent overwriting an active session).
- `beforeunload` sends `sendBeacon('/shutdown-notify')` to notify the server of tab/window close.
- Processing screen: on prompt submit, the main layout is replaced with a full-screen processing view showing prompt number, current iteration, model runs completed, and elapsed time. Polls `GET /is-processing` and `GET /iteration` every 2 seconds. Page reloads automatically when processing completes.

#### Results Display

- **Best-Best Answers**: winning answer per prompt (newest first), with score, model, iteration, expandable prompt text. Tied answers shown when multiple entries share the top score.
- **Iteration History**: per-prompt card with Chart.js line chart (Layer 1A vs 1B vs Best scores), iteration detail cards (models, scores, runtimes, winner badges, degradation flags, best-best indicators).
- **Analyze Deeper**: modal with four chart sections:
  - Average Grade Analysis: bar chart (Layer 1A vs 1B per iteration with winner line) and radar chart (best-best key grades with weighted average). Adjustable weight controls for what-if recalculation.
  - Token Usage & Runtime Analysis: stacked bar chart (input/output tokens per model per iteration) and bar chart (Layer 1A vs 1B runtimes per iteration). Token chart only appears when token data is available.
  - Individual Grading Key Analysis: one bar chart per grading key (Layer 1A vs 1B scores per iteration).
- **Console Output**: full raw processing log.
- Charts via Chart.js with datalabels plugin (loaded via `_head_charts.html` partial).

### Config Graders Page (`config_graders.html` + `config_graders.js`)

- **Load Setting dropdown**: select and load an existing grader setting.
- **View/Edit mode toggle**: Edit button enters edit mode, Cancel exits without saving.
- **Grading keys table**: key name, rubric (free text), grader model (dropdown from `AVAILABLE_GRADER_MODELS`), weight as percentage.
- **Key name normalization**: auto-lowercased, spaces to underscores. Duplicate key names detected and prevented on save.
- **Setting name normalization**: same rules (lowercase, underscores).
- **Add Grading Key**: adds a row (max 8 enforced on frontend and backend).
- **Remove**: deletes a category row.
- **Weight total indicator**: live pill showing sum (green at 100%, red otherwise). Save blocked unless total = 100% and all fields filled.
- **Weights**: entered as percentages (0-100), converted to 0-1 decimals on save, converted back on load.
- **Save Setting**: persists configuration. Blocked for `default` name. Overwrite confirmation dialog for existing settings. New settings appear in dropdown immediately.
- **Read-only notice**: appears when viewing the `default` setting.
- **Back to Main**: navigates to `/`.

### Review Page (`review.html` + `review.js`)

- Lists backups from `~/Downloads` (`GET /get_chat_stats`), newest first.
- Per-chat display: prompt count, first prompt text, file date.
- Per-prompt drill-down: score summary, iteration cards with Layer 1A vs 1B scores, models, runtimes, winners.
- Score grids and iteration cards dynamically render whatever grading keys are in the data.
- **All Prompts Summary table**: shows best score, per-category scores (hardcoded to the default five categories: accuracy, clarity, creativity, structure, conciseness), model, and iteration count for each prompt in a tabular view.
- **Analyze Deeper modal**: detects keys from grade data, shows grader setting name. Contains four chart sections: Average Grade Analysis (bar + radar with adjustable weight controls for what-if), Token Usage Analysis (stacked input/output bar chart, shown when data available), Runtime Analysis (bar chart), and Individual Grading Key Analysis (per-key bar charts).
- **Load This Chat** (`POST /load_chat_from_review`): restores backup into session. Writes handoff values to `sessionStorage` (including `grader_setting_name`); main page consumes and clears them.
- **Delete Chat** (`POST /delete_chat_file`): removes backup file with confirmation.
- **Upload Chat** (`POST /upload_chat_json`): imports and restores a JSON backup.
- **Back to Main**: navigates to `/`.

### Login Page (`login.html`)

- Uses `shared.css` for base styles (reset, body gradient, star overlay, keyframes, logo-circle, footer) with inline `<style>` overrides for login-specific body (scroll attachment, flex centering, overflow hidden), body::before (absolute positioning, 200% size, float animation), and slideUp (with scale transform).
- Login-specific styles (`.login-container`, `.form-group`, `.login-btn`, `.error-message`, media queries) remain inline.
- Animated background with gradient and floating elements.
- Circular login container with username/password fields.
- Error message display with shake animation on invalid credentials.
- Footer with demo/rights notice via `_footer.html` partial.

## References

- [README.md](../README.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [REFACTORING.md](./REFACTORING.md)
- [user guide.md](./user%20guide.md)
