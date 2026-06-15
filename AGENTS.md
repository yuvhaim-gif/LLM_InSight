be accurate.
change what you are told while keeping everything else intact.
use best practices in coding.
include notations for the whole file and process not for each change you made.

## Project Overview

LLM InSights is a Flask-based tool for creating custom grading rubrics, automatically optimizing prompts, A/B testing LLM models, and refining synthetic data — all configured through frontend selectors and pages. No code changes are needed to run experiments.

## Key Capabilities (Frontend-Driven)

1. **Create Grading Rubrics** — Config Graders page (`/config_graders`): define 1-8 categories with key names, rubrics, grader models, and weights. Save named configurations as JSONL. Switch between rubrics on the main page.
2. **Automatic Prompt Optimization** — Toggle Change Prompt on the main page. Layer 2 rewrites prompts using grader feedback, weights, and prompt engineering techniques (CoT, Few-Shot, ToT, Role Prompting, CoVe, etc.).
3. **A/B Test Models** — Select different models for Layer 1A and Layer 1B. Advanced panel enables per-iteration model assignment. Each iteration records scores, winner, and model metadata.
4. **Refine Synthetic Data** — Every run produces (prompt, answer, multi-dimensional scores) tuples. JSONL ledger captures all calls with full metadata. Multi-prompt sessions chain context for multi-turn conversations.
5. **Review Page as Analysis Tool** — (`/review_chats`): browse saved runs, per-prompt iteration stats, Analyze Deeper modal with average grade bar/radar charts, token usage chart, runtime chart, per-key charts, adjustable weights for what-if analysis, grader setting context from the original run.

## Architecture

- **Entry**: `main.py` (Flask app, startup/exit cleanup, SSL, signal handlers, GLM preload)
- **Config**: `config/settings.py` (models, paths, weights), `config/secrets.py` (credentials via `.env`; required: `APP_USER`, `APP_PASS`, `FLASK_SECRET`; optional: `MISTRAL_API_KEY`, `GOOGLE_API_KEY`, `LANGCHAIN_API_KEY`), `graderdata/*.jsonl` (grader settings)
- **Routes**: `routes/web_routes.py` (pages), `routes/api_routes.py` (auth, models, weights, toggles, grader settings, backup), `routes/review_routes.py` (review CRUD)
- **Preference Studio**: `preference/` isolated package (`store.py` SQLite, `extract.py`, `active_learning.py`, `calibrate.py`, `conflicts.py`, `dataset.py`, `export.py`, `routes.py` blueprint registered in `routes/__init__.py`). Human-in-the-loop pairwise judging, grader calibration, the per-chat **Conflicts Report** (`conflicts.py` — reconciles your decisive judgments against the grader's picks, with a persisted grading-version selector), and training-set export. State is fully isolated from the live session. See `docs/preference_studio.md`.
- **AI Pipeline**: `ai/iterative_loop.py` (orchestrator), `ai/iteration_summary.py` (summary display and tie resolution), `ai/layer0.py` (brainstorm), `ai/layer1.py` (answers), `ai/layer2.py` (prompt rewrite), `ai/layer3.py` (parallel grading)
- **Provider Routing**: `ai/api_calls.py` — Ollama (local), Mistral API, Google Gemini API, GLM-4 (HuggingFace). Routed by model name.
- **Data Models**: `core/models.py` (Pydantic: `Layer2Response`, `Layer2Critique`)
- **Utilities**: `utils/session.py`, `utils/session_keys.py` (centralized session key constants), `utils/file_io.py`, `utils/common.py`, `utils/text_processing.py`, `utils/validation.py`, `utils/grader_settings.py`
- **State**: `core/state.py` (hybrid: per-session state via SQLite, GLM cache/lock/cancel in-memory), `core/db.py` (SQLite backend for per-session runtime state — iteration counter, processing flag, models executed)
- **Frontend**: `templates/` (login, main, review, config_graders, studio), `templates/partials/` (7 shared Jinja2 includes/macros: head common, head charts, footer, logo badge, deeper-analysis modal, model icon, model selector), `static/css/shared.css` (base reset, body, keyframes, footer, logo-circle, deeper-analysis modal), `static/css/` (page-specific overrides incl. `studio.css`, `arena.css`, `dataset.css`), `static/js/` (modular: `shared/` 4 files incl. `csrf.js` loaded in `<head>`, `main/` 10 files, `review/` 6 files, `config_graders.js`; Preference Studio: `studio/init.js` orchestrating reused `arena/`, `dataset/`, `calibrate/` logic modules)

## Pages

| Page | Path | Purpose |
|---|---|---|
| Login | `/login` | Authentication |
| Main Analysis | `/` | Run experiments, configure selectors/toggles, view results/charts |
| Config Graders | `/config_graders` | Create/edit grading rubrics (categories, rubrics, models, weights) |
| Review History | `/review_chats` | Browse/load/delete/analyze past sessions, deeper analysis charts |
| Preference Studio | `/arena`, `/dataset` | Unified two-tab page — Judge (pairwise judging/calibration) and Build & Export (training-set assembly/export). Both URLs render `studio.html` on the matching tab |

## Persistence

- **Session**: auth, models, weights, toggles, prompt history, advanced maps, grader setting name, min_grade, max_iterations
- **Files**: `data/ledger.jsonl`, `data/iteration_history.json`, `data/best_best_layer1.json`, `data/console_output.txt`, `data/runtime_state.db`, `backup/`, `graderdata/`
- **Preference Studio**: `data/preferences.db` (judgments, queue, blacklist, calibration runs, per-chat grading-version selections), `data/preferences_export/` (exported datasets), `data/preferences_regrade/` (Tier-B re-grade artifacts) — all under `data/`, isolated from the live session and never touched by clear/backup
- **Browser**: `localStorage` (domain filter, weight preset, system type), `sessionStorage` (review-to-main handoff)

## Stable Contracts

- Route URLs and payload shapes used by frontend JS files
- Session key names centralized in `utils/session_keys.py` (`SK_*` constants); actual string values are the stable contract for frontend handoff
- Backup payload version `2.0` with `grader_setting_name` in `session_data`
- Grader setting JSONL format: `{ key, rubric, grader, weight }` per line
- Provider response format: `{ content, token_info: { tool, input_tokens, output_tokens, total_tokens } }`
- Error prefixes: `[OLLAMA_TIMEOUT]`, `[OLLAMA_ERROR]`, `[GOOGLE_TIMEOUT]`, `[GOOGLE_ERROR]`, `[MISTRAL_TIMEOUT]`, `[MISTRAL_ERROR]`, `[GLM_TIMEOUT]`, `[GLM_ERROR]`
- CSRF: mutating requests carry the session token via the `X-CSRFToken` header (JS `fetch`, injected by `static/js/shared/csrf.js`) or the `csrf_token` form field; token is exposed as `<meta name="csrf-token">` and the `csrf_token()` Jinja helper. Enforced by `utils/csrf.py` when `CSRF_ENABLED` is true (off in tests). Exempt: `api.shutdown_notify`.

## Documentation

- [README.md](./README.md) — project overview, setup, selectors reference
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system design, components, data flow
- [IMPLEMENTATION.md](./docs/IMPLEMENTATION.md) — route contracts, JSON schemas, layer behavior
- [REFACTORING.md](./docs/REFACTORING.md) — maintenance guidance, regression checklist
- [preference_studio.md](./docs/preference_studio.md) — Preference Studio operator + developer guide
- [user guide.md](./docs/user%20guide.md) — end-user walkthrough
