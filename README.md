# LLM InSights — Demo

> **Release note:** This is my home rig testing process shown through a frontend. I decided to release because I am sure many of you will have better ideas of how to define evaluation, improve prompts automatically to specific evaluation results, test models, and review logs.

A hands-on demo for building your own grading rubric, automatically optimizing prompts, A/B testing models, and refining synthetic data — all from the browser. No code changes needed; every experiment is configured through frontend selectors and pages.

## Demo

[![Watch Demo](screenshots/Main%20page.png)](screenshots/Recording%202026-05-05.mp4)

## Core Idea

You write a prompt. The system sends it to two competing LLM models, grades both answers with configurable rubrics, rewrites the prompt using grader feedback, and repeats — keeping the best answer each round. You control every variable from the UI: which models compete, what the rubric measures, how categories are weighted, and when the loop stops.

The result is a structured record of prompts, answers, scores, and model metadata that doubles as refined synthetic data.

## What You Can Do (Frontend Only)

### Create Your Own Grading Rubric

Open **Config Graders** (`/config_graders`) and define 1-8 grading categories. For each category you set:

- **Key name** — what the category measures (e.g. `accuracy`, `humor`, `safety`).
- **Rubric** — free-text description of scoring criteria.
- **Grader model** — which small LLM evaluates this category (`phi3:mini`, `gemma2:2b`, `qwen2.5:1.5b`, `llama3.2:3b`).
- **Weight %** — how much it counts toward the overall score.

Save named configurations, load them on the main page, and switch between rubrics at any time. The `default` setting ships with five categories (accuracy, clarity, conciseness, creativity, structure) and is read-only.

### Automatically Optimize Prompts

Toggle **Change Prompt** to `Yes` on the main page. Layer 2 rewrites your prompt after every iteration using grader feedback, category weights, and best answers as context. It applies Chain-of-Thought, Few-Shot, Tree of Thoughts, Role Prompting, and other techniques automatically. The original prompt's intent and constraints are always preserved.

### A/B Test Models

Pick different models for **Answer Model 1** (Layer 1A) and **Answer Model 2** (Layer 1B) in the sidebar. Each iteration runs both, grades both, and picks the winner. The **Advanced** panel lets you assign a different model to each iteration for Layer 1A, 1B, and the prompt improver (Layer 2) individually, enabling systematic cross-model comparisons.

### Refine Synthetic Data

Every run produces structured (prompt, answer, multi-dimensional scores) tuples. Layer 2 generates (original prompt, improved prompt) pairs. The JSONL ledger records every call with prompts, replies, models, scores, and token counts — ready for dataset construction. Multi-prompt sessions chain context across prompts, enabling multi-turn synthetic conversations.

### Review Page — Log and Analysis Tool

The **Review History** page (`/review_chats`) lets you browse, load, and analyze past runs:

- Per-prompt iteration stats with scores, models, runtimes, and token usage.
- Score grids and iteration cards that dynamically render whatever grading keys were used.
- **Analyze Deeper** modal with average grade bar/radar charts, token usage chart, runtime chart, per-key charts, adjustable weights for what-if analysis, and the grader setting name from the original run.
- Load any past session back into the main page for continued experimentation.
- Delete old runs or upload exported JSON files.

## Prerequisites

- **Python 3.13+**
- **[Ollama](https://ollama.com/)** installed and running (required for local model inference — most models route through Ollama)
- A `.env` file with your credentials (see `.env.example` and the table below)

## Environment Variables (`.env`)

Copy `.env.example` to `.env` and fill in your values.

| Variable | Required | Purpose |
|---|---|---|
| `APP_USER` | **Yes** | Login username |
| `APP_PASS` | **Yes** | Login password |
| `FLASK_SECRET` | **Yes** | Flask session secret key (any random string) |
| `MISTRAL_API_KEY` | No | API key for Mistral models (`mistral-small-2506`, `voxtral-mini-2507`, `open-mistral-nemo-2407`). If omitted, Mistral models return errors when called |
| `GOOGLE_API_KEY` | No | API key for Google Gemini models (`gemini-2.5-flash`, `gemini-2.5-pro`). If omitted, Gemini models return errors when called |
| `LANGCHAIN_API_KEY` | No | API key for [LangSmith](https://smith.langchain.com/) tracing/observability. If omitted, tracing is disabled |
| `LANGCHAIN_PROJECT` | No | LangSmith project name (defaults to `llminsight`) |
| `PORT` | No | Server port (defaults to `5000`) |
| `SSL_CERT_PATH` | No | Path to SSL certificate (HTTPS) |
| `SSL_KEY_PATH` | No | Path to SSL key (HTTPS) |

**Minimal setup** — only Ollama models, no cloud APIs:

```
APP_USER=admin
APP_PASS=changeme
FLASK_SECRET=changeme
```

The app starts with only the three required variables. Provider-specific keys are optional; the app prints a note at startup listing any missing optional keys. Models routed to a provider without a valid key will return error responses when called — the app itself continues to work normally with the remaining providers.

### Disabling Providers You Don't Need

If you only want to use a subset of providers, simply leave the corresponding API key out of `.env`:

- **No Mistral models**: omit `MISTRAL_API_KEY`. Avoid selecting Mistral models (`mistral-small-2506`, `voxtral-mini-2507`, `open-mistral-nemo-2407`) in the UI. Change the default Layer 2 model in `config.py` (`DEFAULT_LAYER2_MODEL`) to an Ollama or Gemini model.
- **No Google Gemini models**: omit `GOOGLE_API_KEY`. Avoid selecting Gemini models (`gemini-2.5-flash`, `gemini-2.5-pro`) in the UI.
- **No LangSmith tracing**: omit `LANGCHAIN_API_KEY`. Tracing calls fail silently; the app works normally.
- **No GLM-4 (HuggingFace) models**: GLM models require `transformers` and `torch`. To skip them: remove `glm-4-9b` and `glm-4-9b-chat` from the model lists in `config.py`, and optionally remove `transformers` and `torch` from `requirements.txt` to save disk space. The GLM preload thread at startup becomes a no-op if the models are not in the config.
- **No Ollama**: Ollama is the default local provider. If you only want to use cloud APIs (Mistral/Gemini), remove the Ollama-only models from the model lists in `config.py` and remove `ollama` from `requirements.txt`. Note: the default Layer 1A, 1B, 0, and Layer 3 grader models all use Ollama, so you must also update `DEFAULT_LAYER1A_MODEL`, `DEFAULT_LAYER1B_MODEL`, `DEFAULT_LAYER0_MODEL`, and `LAYER3_GRADER_MODELS` in `config.py`.

## Setup

```bash
git clone https://github.com/yuvhaim-gif/LLM_InSight.git
cd LLM_InSight
python -m venv venv
source venv/bin/activate   # Linux/macOS
venv\Scripts\activate      # Windows
pip install -r requirements.txt
cp .env.example .env       # Edit .env with your credentials
```

### Pull Ollama Models

Pull the default models used by each layer (skip if not using Ollama):

```bash
ollama pull gemma:7b-instruct-q4_K_M   # Layer 1A default
ollama pull granite4:latest              # Layer 1B default
ollama pull gemma2:9b                    # Layer 0 default
ollama pull phi3:mini                    # Layer 3 grader (accuracy)
ollama pull gemma2:2b                    # Layer 3 grader (clarity)
ollama pull qwen2.5:1.5b                # Layer 3 grader (conciseness, structure)
ollama pull llama3.2:3b                  # Layer 3 grader (creativity)
```

You only need to pull models you plan to use. The full list of preconfigured models is in `config.py`.

### Run

```bash
python main.py
```

Open `http://localhost:5000` and sign in with the credentials from your `.env` file.

## Pages

| Page | Path | Purpose |
|---|---|---|
| **Login** | `/login` | Authentication with animated background |
| **Main Analysis** | `/` | Run experiments, configure all selectors and toggles, view results and charts |
| **Config Graders** | `/config_graders` | Create and edit grading rubrics (categories, rubric text, grader models, weights) |
| **Review History** | `/review_chats` | Browse saved runs, load/delete/analyze past sessions, deeper analysis charts |

## Frontend Selectors and Controls

### Main Page Selectors

| Control | Location | What It Does |
|---|---|---|
| **Layer 0 Model** (Ideas) | Right sidebar | Selects the brainstorming model that runs before the loop |
| **Answer Model 1** (Layer 1A) | Right sidebar | First answer model each iteration |
| **Answer Model 2** (Layer 1B) | Right sidebar | Second answer model each iteration |
| **Prompt Improver** (Layer 2) | Right sidebar | Model that rewrites prompts using grader feedback |
| **Advanced panel** | Right sidebar (toggle) | Per-iteration model assignment for Layer 1A, 1B, and Layer 2. Locks main selectors when saved |
| **Grader setting selector** | Weights area | Switch between saved grading rubrics |
| **Config Graders link** | Weights area | Opens the rubric editor page |
| **Weight inputs** | Top-left panel | Adjust category weights (auto-normalized, Apply/Reset buttons) |
| **Advise Models by Domain** | Controls area | Visual filter for model dropdowns (Coding, Creative, Science, Experimental, Balanced) |
| **Domain Selection** | Controls area | Weight profile preset (Balanced, Accuracy, Creativity, Conciseness) |
| **Break Target Grade** | Controls area | Stop loop when this score is reached (1-100) |
| **Iterations** | Controls area | Max refinement rounds per prompt (1-5) |
| **Degradation Break** | Toggle | Stop when score drops from previous iteration |
| **Change Prompt** | Toggle | Enable/disable Layer 2 prompt rewriting |
| **Give Ideas** | Toggle | Enable/disable Layer 0 brainstorming |
| **Last Best Answer Retention** | Toggle | Feed best answer as context into next iteration |
| **Grade vs. Current/First Prompt** | Toggle | Graders judge against current or first prompt in session |
| **System Profile** | Top-left corner | Filters model dropdowns by speed category (Simple hides slower/slow, Good hides slow, Super shows all). Browser-only |

### Main Page Actions

| Button | What It Does |
|---|---|
| **START ANALYSIS** | Runs the iterative analysis loop |
| **Clear Chat** | Backs up and resets all runtime state |
| **Upload Chat** | Imports a JSON backup file |
| **Download Chat (Text)** | Exports human-readable log (not restorable) |
| **Download Chat (JSON)** | Exports full backup (restorable) |
| **Review History** | Opens the review page |

### Config Graders Page

| Control | What It Does |
|---|---|
| **Load Setting dropdown** | Select and load an existing grading rubric |
| **Edit / Cancel** | Toggle edit mode for the grading keys table |
| **Key Name field** | Category name (auto-lowercased, spaces to underscores) |
| **Rubric field** | Free-text scoring criteria for the category |
| **Grader Model dropdown** | Select grader model per category |
| **Weight % field** | Weight as percentage (converted to 0-1 on save) |
| **Add Grading Key** | Add a row (max 8 categories) |
| **Remove** | Delete a category row |
| **Weight total indicator** | Live sum pill (green at 100%, red otherwise) |
| **Setting Name input** | Name for saving (auto-normalized) |
| **Save Setting** | Persist the configuration (blocked if incomplete or `default`) |

### Review Page

| Control | What It Does |
|---|---|
| **Chat list** | Browse all saved backups from `~/Downloads`, newest first |
| **Prompt summary** | Scores, categories, models, iterations per prompt |
| **Iteration cards** | Layer 1A vs 1B detail with winner, model, runtime |
| **Analyze Deeper** | Modal with average grade bar/radar charts, token usage chart, runtime chart, per-key charts, adjustable weights for what-if, grader setting name |
| **Load This Chat** | Restore backup into active session (clears current data) |
| **Delete Chat** | Remove backup file permanently |
| **Upload** | Import and restore a JSON backup |

## Loop Pipeline

```
Layer 0 (once, optional) -> [ Layer 1A -> Grade -> Layer 2 rewrite -> Layer 1B -> Grade -> pick winner ] x N
```

### Stop Conditions (first match wins)

1. Best score reaches the target grade (default 100).
2. Degradation break: score dropped from previous iteration (when enabled).
3. Max iterations reached (default 5, max 5).

## Models and Providers

Calls are routed automatically by model name:

| Provider | Models | Transport |
|---|---|---|
| Ollama | All models not listed below (local inference) | `ollama.chat()`, threaded with timeout |
| Mistral API | `mistral-small-2506`, `voxtral-mini-2507`, `open-mistral-nemo-2407` | REST with retry + backoff |
| Google Gemini API | `gemini-2.5-flash`, `gemini-2.5-pro` | REST with retry |
| GLM-4 (HuggingFace) | `glm-4-9b`, `glm-4-9b-chat` | Local `transformers`, cached, preloaded at startup, unloaded on exit |

28 preconfigured models available across layers, including gemma, granite, llama, qwen, deepseek-r1, deepseek-coder-v2, falcon3, phi4, devstral, solar, codellama, dolphin3, olmo2, starcoder2, and gpt-oss.

## Dependencies and Tools

| Package | Version | Purpose |
|---|---|---|
| [Flask](https://flask.palletsprojects.com/) | >=3.0 | Web framework, routing, sessions, template rendering |
| [Pydantic](https://docs.pydantic.dev/) | >=2.0 | Data validation for Layer 2 response schemas (`Layer2Response`, `Layer2Critique`) |
| [ollama](https://github.com/ollama/ollama-python) | >=0.4 | Python client for Ollama local inference (most models) |
| [requests](https://requests.readthedocs.io/) | >=2.31 | HTTP client for Mistral and Google Gemini REST APIs |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | >=1.0 | Load `.env` file into environment variables |
| [transformers](https://huggingface.co/docs/transformers/) | >=4.40 | HuggingFace model loading for GLM-4 (optional — only needed for GLM models) |
| [torch](https://pytorch.org/) | >=2.2 | PyTorch backend for GLM-4 inference (optional — only needed for GLM models) |
| [langsmith](https://docs.smith.langchain.com/) | >=0.1 | Tracing/observability via `@traceable` decorator (optional — falls back to no-op if missing) |
| [Chart.js](https://www.chartjs.org/) | CDN | Frontend charts (bar, radar, line) in main and review pages |
| [chartjs-plugin-datalabels](https://chartjs-plugin-datalabels.netlify.app/) | CDN | Data labels on Chart.js charts |

To remove optional dependencies, see [Disabling Providers You Don't Need](#disabling-providers-you-dont-need).

## Adding Your Own Models and APIs

### Adding a new Ollama model

1. Pull it: `ollama pull your-model-name`.
2. Add the model name to the appropriate list(s) in `config.py` (`_CORE_MODELS`, `AVAILABLE_LAYER0_MODELS`, `AVAILABLE_LAYER2_MODELS`, etc.).
3. The model is immediately available in the UI dropdowns.

### Adding a new cloud API provider

1. Add your API key to `.env` and load it in `secrets_config.py`.
2. In `ai/api_calls.py`, add a routing check in `call_model()` (similar to the existing Gemini/Mistral checks) and implement a `call_yourprovider()` function that returns the standard `{ content, token_info }` format.
3. Add the model names to the lists in `config.py`.
4. Use the `_post_with_retry()` helper for REST APIs with rate limiting.

### Adding a new grader model

Add the model name to `AVAILABLE_GRADER_MODELS` in `config.py`. The model must be pullable via Ollama (graders use Ollama by default). Then it appears in the grader model dropdown on the Config Graders page.

### Changing default models

Edit the `DEFAULT_LAYER*` variables and `LAYER3_GRADER_MODELS` in `config.py`. These control which models are pre-selected when a new session starts.

## Persistence

- **Session**: auth, models, weights, toggles, prompt history, advanced maps, active grader setting name.
- **Files**: `ledger.jsonl` (append-only events), `iteration_history.json`, `best_best_layer1.json`, `console_output.txt`, `backup/` (timestamped copies), `graderdata/` (JSONL grader settings).
- **Browser**: `localStorage` (domain filter, weight preset, system type), `sessionStorage` (review-to-main handoff).
- **Lifecycle**: startup, login, clear-chat, logout, exit, window close, and process signals each back up runtime files and then clear a subset of them.

## Backup Format

JSON export (version 2.0) captures: console output, prompt history, iteration history, best-best cache, ledger entries, full session state (models, weights, toggles, advanced maps, grader setting name). Restorable via upload or review page load.

## Observability

LangSmith/LangChain tracing on all AI layers via `@traceable` decorators. Requires `LANGCHAIN_API_KEY` in `.env`. If the key is missing or invalid, tracing is disabled and the app continues to function normally.

## Project Map

- **App entry point**: `main.py`
- **Configuration**: `config.py` (models, paths, weights), `secrets_config.py` (credentials via `.env`), `graderdata/` (JSONL grader settings)
- **Routes**: `routes/web_routes.py`, `routes/api_routes.py`, `routes/review_routes.py`
- **AI pipeline**: `ai/iterative_loop.py`, `ai/layer0.py`, `ai/layer1.py`, `ai/layer2.py`, `ai/layer3.py`, `ai/api_calls.py`
- **Data models**: `models.py` (Pydantic: `Layer2Response`, `Layer2Critique`)
- **Utilities**: `utils/session.py`, `utils/file_io.py`, `utils/common.py`, `utils/text_processing.py`, `utils/validation.py`, `utils/grader_settings.py`, `state.py`
- **Frontend**: `templates/` (login, main, review, config_graders), `templates/partials/` (shared Jinja2 includes and macros), `static/css/shared.css` (common base styles), `static/css/` (page-specific overrides), `static/js/`

## Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system design and component layout
- [IMPLEMENTATION.md](./docs/IMPLEMENTATION.md) — route contracts, JSON schemas, layer behavior
- [REFACTORING.md](./docs/REFACTORING.md) — maintenance guidance and implementation notes
- [user guide.md](./docs/user%20guide.md) — end-user walkthrough
- [LICENSE](./LICENSE) — MIT license
