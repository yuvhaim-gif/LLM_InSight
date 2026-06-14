# LLM InSights

> A local-first testing and optimization harness for iterative content creation — run multi-model A/B tests, refine prompts automatically with rubric-based grading, calibrate the grader to your own taste, and export training-ready datasets. Built for brand content workflows, prompt engineering, LLM evaluation, and dataset curation on your own hardware.

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

![Walkthrough](screenshots/demo.gif)
*Walkthrough (~1.5 min)*

---

## What It Does

You write a prompt — a piece of brand copy, a product description, a creative brief, or any content task. The tool sends it to two competing LLM models, grades both answers against a configurable rubric, optionally rewrites the prompt using grader feedback, and repeats the cycle — keeping the best answer each round. Every variable is controlled from the UI: which models compete, what the rubric measures, how categories are weighted, and when the loop stops.

The pipeline runs locally by default using Ollama, with optional cloud API support (Mistral, Google Gemini) for hybrid setups. No data leaves your machine unless you choose a cloud provider.

Each run produces a structured record of prompts, answers, scores, token counts, and model metadata — useful as refined synthetic data, prompt optimization logs, or content quality benchmarks.

When you want the grader to match **your** judgment, **Preference Studio** closes the loop: you judge answer pairs head-to-head, watch live alignment metrics (pairwise accuracy, Cohen's κ, Spearman) on the calibration panel, re-fit weights or re-grade until the grader agrees with you, and then export curated, training-ready JSONL datasets — for either the production model (SFT / DPO / KTO) or a trainable pass/fail judge.

---

## Key Capabilities

- **Custom Grading Rubrics** — Define up to 8 grading categories, each with its own free-text rubric description, dedicated grader model, and weight. The default rubric covers accuracy, clarity, conciseness, creativity, and structure. Save named configurations and switch between them at any time.
- **Automatic Prompt Optimization** — The system rewrites your prompt after each iteration using grader feedback, category weights, and best answers as context. Techniques are applied automatically while preserving the original intent, including Zero-Shot Prompting, Few-Shot Prompting, Chain-of-Thought (CoT), Self-Consistency, Least-to-Most Prompting, Tree of Thoughts (ToT), Directional Stimulus Prompting, Role Prompting, Generated Knowledge Prompting, Chain-of-Verification (CoVe), and Skeleton-of-Thought.
- **Multi-Model A/B Testing** — Assign different models to each answering slot and compare their outputs head-to-head. The Advanced panel supports per-iteration model assignments for systematic cross-model comparisons.
- **Parallel Multi-Category Grading** — Layer 3 grades each category in parallel using a thread pool, grouped by grader model. Failed graders fall back to a default score without stopping the pipeline. Retries with backoff are built in.
- **Synthetic Data Generation** — Every run produces structured (prompt, answer, multi-dimensional scores) tuples and (original prompt, improved prompt) pairs. The JSONL ledger records prompts, replies, models, scores, and token counts. Multi-prompt sessions chain the best answer from the previous prompt as context into the next.
- **Token Tracking** — Input, output, and total token counts are recorded per model per layer per iteration and aggregated by provider. Token usage is visible in the deeper analysis charts.
- **Tie Detection** — When multiple iterations produce the same best score, the system identifies tied answers, deduplicates by text similarity, and reports alternatives.
- **Session Review and Analysis** — Browse, load, and analyze past runs with per-prompt iteration stats, score grids, and an in-depth analysis modal featuring average grade bar charts, radar overlays, per-category score breakdowns, token usage charts, runtime comparisons, and adjustable weight sliders for live what-if recalculation.
- **Preference Studio (Human-in-the-Loop)** — A unified `/arena` + `/dataset` page to judge answer pairs (which is better, a tie, or both bad), give your own 1–100 grades, pin ground truth, write gold answers, and blacklist bad answers. An active-learning queue surfaces the hardest / most-uncertain pairs first.
- **Grader Calibration** — A calibration panel (on Config Graders) measures, live, how well the current grader reproduces your judgments (pairwise accuracy, Cohen's κ, Spearman, per-attribute alignment). Re-fit weights instantly (no model calls) or run a full re-grade with a candidate config, then apply and save.
- **Conflicts Report** — A per-chat reconciliation (opened from each source row in Preference Studio) that lists exactly where your decisive judgments disagree with the grader's picks, with pairwise accuracy and Cohen's κ for the chat. A grading-version selector switches between the Original grading and later re-grade runs (newest auto-selected), and your chosen version is persisted per chat.
- **Training-Dataset Export** — Build curated pools from exactly the sources you pick and export training-ready JSONL for a **production model** (`sft`, `preference`/DPO, `kto`) or a trainable **pass/fail judge** (`preference`/reward, `judge_cls`, `judge_gen`), each with a provenance sidecar and a summary card. All state is isolated from the live session.
- **REST API** — All UI actions are backed by JSON endpoints — analysis (`/iteration`, `/is-processing`, `/get_backup_data`, `/update_weights`, `/save_advanced_models`, `/grader_settings`, `/grader_setting/<name>`) and Preference Studio (`/api/arena/*`, `/api/calibrate/*`, `/api/dataset/*`). Programmatic access to model selection, weight management, grader configuration, session backup, judging, calibration, and dataset export is available out of the box.

---

## How the Pipeline Works

```mermaid
flowchart LR
    L0["Layer 0\n(brainstorm, optional)"] --> loop
    subgraph loop ["Repeat × N iterations"]
        direction LR
        L1A["Layer 1A\n(answer)"] --> G1["Layer 3\n(grade)"]
        G1 --> L2["Layer 2\n(rewrite prompt)"]
        L2 --> L1B["Layer 1B\n(answer)"]
        L1B --> G2["Layer 3\n(grade)"]
        G2 --> W["Pick winner"]
    end
```

| Layer | Role |
|---|---|
| **Layer 0** | Optional brainstorming step. Generates concise alternative ideas or directions before the loop begins. |
| **Layer 1A / 1B** | Two competing answer models. Each produces a full response to the prompt (or improved prompt). |
| **Layer 2** | Prompt improver. Rewrites the prompt using grader feedback, best answers, and micro-replies as context. |
| **Layer 3** | Multi-category grader. Each category is evaluated independently by its own small LLM in parallel, scores are weighted and combined. Failed categories receive a default score so the pipeline continues. |

### Stop Conditions

The loop ends when the first of these is met:

1. The best score reaches the target grade (default: 100).
2. Degradation break is enabled and the score drops from the previous iteration.
3. The maximum number of iterations is reached (default: 5).

---

## Pages

| Page | Path | Purpose |
|---|---|---|
| **Login** | `/login` | Simple authentication with an animated background |
| **Main Analysis** | `/` | Run experiments, configure models and toggles, view live results and charts |
| **Config Graders** | `/config_graders` | Create and edit grading rubrics — categories, rubric text, grader models, weights. Also hosts the **Calibration panel** (see Preference Studio) |
| **Review History** | `/review_chats` | Browse saved runs, load or delete past sessions, open the deeper analysis modal |
| **Preference Studio** | `/arena`, `/dataset` | Unified human-in-the-loop page with two tabs — **Judge** (pairwise judging to calibrate the grader and gather ground truth) and **Build & Export** (turn judgments, blacklist, and machine grades into training-ready JSONL). Both URLs open the same page on the matching tab |

---

## Preference Studio

A human-in-the-loop layer that calibrates the grader to **your** judgment and exports
training-ready datasets. It is a single page — **Preference Studio** — with two tabs (a shared
source rail spans both). See **[docs/preference_studio.md](docs/preference_studio.md)** for the
full operator + developer guide.

The loop: judge answer pairs in the **Judge** tab → watch alignment metrics on the **Calibration
panel** (on Config Graders) and re-fit weights or re-grade → assemble curated pools in the
**Build & Export** tab and export. The on-page *How it works* banner restates these steps.

**Two training targets** (pick on the Build & Export tab):

- **Production model** — the model that performs the task. Formats: `sft` (good answers),
  `preference` (DPO/reward, chosen vs rejected), `kto` (good + bad).
- **Pass/Fail judge** — a trainable Layer-3 grader. Formats: `preference` (reward model),
  `judge_cls` (binary classifier), `judge_gen` (generative PASS/FAIL).

Each source row in the shared rail also has a **⚠️ Report** button that opens the **Conflicts
Report** for that chat — a per-chat view of every pair where your decisive pick differs from the
grader's, with the chat's pairwise accuracy and Cohen's κ. A grading-version selector lets you
compare the Original grading against later re-grade runs (newest auto-selected), and your choice is
saved per chat.

All Preference Studio state lives in an isolated `preferences.db` plus separate export/regrade
directories; the live ledger is read-only here and never modified by re-grading.

---

## Frontend Controls

### Main Page — Sidebar (Model Selection)

| Control | Purpose |
|---|---|
| **Layer 0 Model** (Ideas) | Selects the brainstorming model that runs before the loop |
| **Answer Model 1** (Layer 1A) | First answer model in each iteration |
| **Answer Model 2** (Layer 1B) | Second answer model in each iteration |
| **Prompt Improver** (Layer 2) | Model that rewrites prompts using grader feedback |
| **Advanced Panel** | Per-iteration model assignment for Layers 1A, 1B, and 2. Locks main selectors when saved |
| **System Profile** | Filters model dropdowns by hardware tier (Simple / Medium / Powerful) — browser-side only, groups models by parameter size |

### Main Page — Controls Area

| Control | Purpose |
|---|---|
| **Advise Models by Domain** | Filters model dropdowns to show only models suited to a task domain: Coding, Creative, Science, Experimental, or Balanced |
| **Weight Preset** | Applies a predefined weight profile across grading categories (Balanced, Accuracy, Creativity, Conciseness) |
| **Break Target Grade** | Stop the loop when this score is reached (1--100) |
| **Iterations** | Maximum refinement rounds per prompt (1--5) |
| **Degradation Break** | Stop if the score drops from the previous iteration |
| **Change Prompt** | Enable or disable Layer 2 prompt rewriting |
| **Give Ideas** | Enable or disable Layer 0 brainstorming |
| **Last Best Answer Retention** | Feed the best answer from the previous iteration as context into the next |
| **Grade vs. Current / First Prompt** | Choose whether graders judge the answer against the current or the first prompt in the session |

### Main Page — Weights and Grader Settings

| Control | Purpose |
|---|---|
| **Weight Inputs** | Adjust category weights (auto-normalized). Apply and Reset buttons |
| **Grader Setting Selector** | Switch between saved grading rubrics |
| **Config Graders Link** | Opens the rubric editor page |

### Main Page — Action Buttons

| Button | Purpose |
|---|---|
| **START ANALYSIS** | Runs the iterative analysis loop |
| **Clear Chat** | Backs up and resets all runtime state |
| **Upload Chat** | Imports a previously exported JSON backup |
| **Download Chat** | Exports the session as a human-readable text log or a full restorable JSON backup |
| **Review History** | Opens the Review page |

### Config Graders Page

| Control | Purpose |
|---|---|
| **Load Setting** | Select and load an existing grading rubric |
| **Edit / Cancel** | Toggle edit mode for the grading keys table |
| **Key Name** | Category name (auto-lowercased, spaces converted to underscores) |
| **Rubric** | Free-text description of scoring criteria |
| **Grader Model** | Select which small LLM evaluates this category |
| **Weight %** | How much this category counts toward the overall score |
| **Add / Remove Keys** | Add a row (max 8) or remove an existing one |
| **Weight Total Indicator** | Live sum — green at 100%, red otherwise |
| **Save Setting** | Persist the configuration (blocked if incomplete or named `default`) |

### Review Page

| Control | Purpose |
|---|---|
| **Chat List** | Browse all saved backups, newest first |
| **Prompt Summary** | Scores, categories, models, and iterations for each prompt |
| **Iteration Cards** | Layer 1A vs. 1B detail with winner, model, and runtime |
| **Analyze Deeper** | Modal with average grade bar chart, radar overlay, per-category score breakdowns, token usage breakdown by provider, runtime comparison chart, adjustable weight sliders with live score recalculation for what-if analysis, weight reset, and the grader setting name from the original run |
| **Load This Chat** | Restore a backup into the active session |
| **Delete Chat** | Remove a backup file permanently |
| **Upload** | Import and restore a JSON backup |

---

## Models and Providers

Calls are routed automatically based on the model name:

| Provider | Models | Transport |
|---|---|---|
| **Ollama** | All models not listed below (local inference) | `ollama.chat()`, threaded with timeout |
| **Mistral API** | `mistral-small-2506`, `voxtral-mini-2507`, `open-mistral-nemo-2407` | REST with retry, exponential backoff, and rate-limit handling |
| **Google Gemini API** | `gemini-2.5-flash`, `gemini-2.5-pro` | REST with retry, constant backoff, and rate-limit handling |
| **GLM-4 (HuggingFace)** | `glm-4-9b`, `glm-4-9b-chat` | Local `transformers`, cached, preloaded at startup |

28 preconfigured models are available across layers, including gemma, granite, llama, qwen, deepseek-r1, deepseek-coder-v2, falcon3, phi4, devstral, solar, codellama, dolphin3, olmo2, starcoder2, and gpt-oss. All API calls are routed automatically based on the model name and include timeout handling; failures in any layer are caught gracefully so the pipeline continues.

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **[Ollama](https://ollama.com/)** installed and running (required for local model inference unless you configure cloud-only providers)
- A `.env` file with your credentials (see below)

### Installation

```bash
git clone https://github.com/yuvhaim-gif/LLM_InSight.git
cd LLM_InSight
python -m venv venv
source venv/bin/activate   # Linux / macOS
venv\Scripts\activate      # Windows
pip install -r requirements.txt
cp .env.example .env       # then edit .env with your credentials
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values.

| Variable | Required | Purpose |
|---|---|---|
| `APP_USER` | Yes | Login username |
| `APP_PASS` | Yes | Login password |
| `FLASK_SECRET` | Yes | Flask session secret (any random string) |
| `MISTRAL_API_KEY` | No | Enables Mistral models. If omitted, those models return errors when called |
| `GOOGLE_API_KEY` | No | Enables Google Gemini models. If omitted, those models return errors when called |
| `LANGCHAIN_API_KEY` | No | Enables [LangSmith](https://smith.langchain.com/) tracing. If omitted, tracing is disabled |
| `LANGCHAIN_PROJECT` | No | LangSmith project name (defaults to `llminsight`) |
| `PORT` | No | Server port (defaults to `5000`) |
| `SSL_CERT_PATH` / `SSL_KEY_PATH` | No | Paths to SSL certificate and key for HTTPS |

**Minimal `.env`** (Ollama-only, no cloud APIs):

```
APP_USER=admin
APP_PASS=changeme
FLASK_SECRET=changeme
```

The app runs with just these three variables. Missing optional keys are noted at startup; models routed to a provider without a key return error responses, but the app itself continues to work normally.

> **Important:** The default Layer 2 (prompt improver) model is `open-mistral-nemo-2407`, which requires `MISTRAL_API_KEY`. If you are running Ollama-only without a Mistral key, either disable the **Change Prompt** toggle in the UI or change `DEFAULT_LAYER2_MODEL` in `config/settings.py` to an Ollama model (e.g., `gemma2:9b`).

### Pull Ollama Models

Pull the default models used by each layer (skip any you don't plan to use):

```bash
ollama pull gemma:7b-instruct-q4_K_M   # Layer 1A default
ollama pull granite4:latest              # Layer 1B default
ollama pull gemma2:9b                    # Layer 0 default
ollama pull phi3:mini                    # Layer 3 grader (accuracy)
ollama pull gemma2:2b                    # Layer 3 grader (clarity)
ollama pull qwen2.5:1.5b                # Layer 3 grader (conciseness, structure)
ollama pull llama3.2:3b                  # Layer 3 grader (creativity)
```

The full list of preconfigured models is in `config/settings.py`.

### Run

```bash
python main.py
```

Open `http://localhost:5000` and sign in with the credentials from your `.env` file.

---

## Disabling Providers You Don't Need

If you only want to use a subset of providers, leave the corresponding API key out of `.env`:

- **No Mistral**: omit `MISTRAL_API_KEY`. Avoid selecting Mistral models in the UI and update `DEFAULT_LAYER2_MODEL` in `config/settings.py` to an Ollama or Gemini model.
- **No Google Gemini**: omit `GOOGLE_API_KEY`. Avoid selecting Gemini models in the UI.
- **No LangSmith**: omit `LANGCHAIN_API_KEY`. Tracing fails silently; the app works normally.
- **No GLM-4**: remove `glm-4-9b` and `glm-4-9b-chat` from the model lists in `config/settings.py`. Optionally remove `transformers` and `torch` from `requirements.txt` to save disk space.
- **No Ollama**: remove Ollama-only models from the model lists in `config/settings.py`, remove `ollama` from `requirements.txt`, and update the default model constants (`DEFAULT_LAYER1A_MODEL`, `DEFAULT_LAYER1B_MODEL`, `DEFAULT_LAYER0_MODEL`, `LAYER3_GRADER_MODELS`).

---

## Adding Your Own Models

### New Ollama model

1. Pull it: `ollama pull your-model-name`
2. Add the model name to the appropriate list(s) in `config/settings.py`
3. It appears in the UI dropdowns immediately

### New cloud API provider

1. Add your API key to `.env` and load it in `config/secrets.py`
2. Add a routing check and call function in `ai/api_calls.py` (follow the existing Gemini/Mistral pattern)
3. Add the model names to the lists in `config/settings.py`

### New grader model

Add the model name to `AVAILABLE_GRADER_MODELS` in `config/settings.py`. The model must be available via Ollama. It will appear in the grader model dropdown on the Config Graders page.

### Changing defaults

Edit the `DEFAULT_*` constants in `config/settings.py` (`DEFAULT_LAYER1A_MODEL`, `DEFAULT_LAYER1B_MODEL`, `DEFAULT_LAYER0_MODEL`, `DEFAULT_LAYER2_MODEL`, `LAYER3_GRADER_MODELS`).

---

## Running Tests

```bash
pip install -r requirements-dev.txt
pytest tests/ -v --tb=short
```

The 217 contract tests (135 core + 82 Preference Studio) validate backup schema, restore behavior, advanced model map compatibility, auth matrix, provider routing, route-refactor parity, CSRF protection, and the full Preference Studio package (`test_pref_*`: store, extraction, active-learning queue, calibration, dataset pools/examples, export, routes, sources, user-pref, and wiring). Tests use monkeypatched temp directories and an isolated SQLite database — no production files are touched, no AI models are called, and no `.env` file is required.

---

## Persistence and Backup

- **Session state**: authentication, selected models, weights, toggles, prompt history, advanced model maps, and the active grader setting name are stored in the server-side session and a SQLite database.
- **Runtime files**: `data/ledger.jsonl` (append-only event log), `data/iteration_history.json`, `data/best_best_layer1.json`, `data/console_output.txt`, and `graderdata/` (JSONL grader settings).
- **Preference Studio (isolated)**: `data/preferences.db` (judgments, queue, blacklist, calibration runs) plus `data/preferences_export/` and `data/preferences_regrade/`. These are never touched by the live session's clear/backup, and re-grading never writes to the ledger.
- **Browser storage**: `localStorage` (domain filter, weight preset, system type) and `sessionStorage` (review-to-main handoff).
- **Lifecycle**: startup, login, clear-chat, logout, exit, window close, and process signals each trigger backups of runtime files before clearing them.
- **JSON export** (version 2.0): captures console output, prompt history, iteration history, best-best cache, ledger entries, and full session state. Restorable via upload or the Review page.

---

## Observability

LangSmith/LangChain tracing is available on the orchestrating iterative loop and every individual AI layer (Layer 0, Layer 1, Layer 2, Layer 3) via `@traceable` decorators. Set `LANGCHAIN_API_KEY` in `.env` to enable it. If the key is missing or invalid, tracing is disabled and the app continues to function normally.

---

## Security

- **Authentication** — every page and mutating API requires a logged-in session (`APP_USER` / `APP_PASS`); unauthenticated requests are redirected to `/login` (pages) or rejected with JSON `401` (APIs).
- **CSRF protection** — all mutating requests (`POST`/`PUT`/`PATCH`/`DELETE`) are validated against a per-session token (`utils/csrf.py`). HTML forms carry a hidden `csrf_token` field; JavaScript `fetch` calls send an `X-CSRFToken` header injected by a single global wrapper (`static/js/shared/csrf.js`). Safe methods and the no-op `/shutdown-notify` are exempt. Controlled by the `CSRF_ENABLED` config flag (on by default; disabled in tests).
- **Session cookies** — `HttpOnly` and `SameSite=Lax` are always set; `Secure` is enabled automatically when the server is started with a valid SSL certificate/key.

---

## Project Structure

| Path | Purpose |
|---|---|
| `main.py` | Application entry point |
| `config/` | `settings.py` (models, paths, default weights), `secrets.py` (credentials via `.env`) |
| `core/` | `db.py` (SQLite state), `models.py` (Pydantic schemas), `state.py` (hybrid state management) |
| `data/` | Runtime working files (ledger, cache, history, console output, state DB, and the isolated `preferences.db` + `preferences_export/` / `preferences_regrade/` dirs). Auto-created on first run; git-ignored except a `.gitkeep` placeholder |
| `graderdata/` | JSONL grader setting files |
| `routes/` | `web_routes.py`, `api_routes.py`, `review_routes.py` |
| `preference/` | Isolated Preference Studio package: `store.py`, `extract.py`, `active_learning.py`, `calibrate.py`, `conflicts.py`, `dataset.py`, `export.py`, `routes.py` |
| `ai/` | `iterative_loop.py`, `iteration_summary.py`, `layer0.py`, `layer1.py`, `layer2.py`, `layer3.py`, `api_calls.py` |
| `utils/` | `session.py`, `session_keys.py`, `file_io.py`, `common.py`, `text_processing.py`, `validation.py`, `grader_settings.py`, `csrf.py` |
| `scripts/` | Developer utility scripts (`check_syntax.py`, `check_modified.py`, `create_graderdata.py`) |
| `templates/` | Jinja2 templates (login, main, review, config_graders, studio) with shared partials |
| `static/` | CSS, JavaScript, and assets (incl. `js/studio/`, `js/arena/`, `js/dataset/`, `js/calibrate/`) |
| `tests/` | Pytest contract tests (incl. `test_pref_*.py`) |

---

## Dependencies

| Package | Purpose |
|---|---|
| [Flask](https://flask.palletsprojects.com/) | Web framework, routing, sessions, template rendering |
| [Pydantic](https://docs.pydantic.dev/) | Data validation for Layer 2 response schemas |
| [ollama](https://github.com/ollama/ollama-python) | Python client for Ollama local inference |
| [requests](https://requests.readthedocs.io/) | HTTP client for Mistral and Gemini REST APIs |
| [python-dotenv](https://github.com/theskumar/python-dotenv) | Load `.env` into environment variables |
| [transformers](https://huggingface.co/docs/transformers/) | HuggingFace model loading for GLM-4 (optional) |
| [torch](https://pytorch.org/) | PyTorch backend for GLM-4 inference (optional) |
| [Chart.js](https://www.chartjs.org/) + [chartjs-plugin-datalabels](https://chartjs-plugin-datalabels.netlify.app/) | Bar, radar, and per-category charts in the analysis modal (loaded from CDN) |
| [langsmith](https://docs.smith.langchain.com/) | Tracing and observability (optional) |
| [pytest](https://docs.pytest.org/) | Test suite (dev dependency) |

---

## Further Documentation

- [Architecture](./docs/ARCHITECTURE.md) — system design and component layout
- [Implementation](./docs/IMPLEMENTATION.md) — route contracts, JSON schemas, layer behavior
- [Refactoring Notes](./docs/REFACTORING.md) — maintenance guidance and implementation notes
- [User Guide](./docs/user%20guide.md) — end-user walkthrough
- [Preference Studio](./docs/preference_studio.md) — judging, calibration, training targets, and export formats

---

## Contributing

Contributions are welcome. If you'd like to help improve LLM InSights, please open an issue to discuss your idea before submitting a pull request. Bug reports, feature suggestions, and documentation improvements are all appreciated.

---

## License

This project is released under the [MIT License](./LICENSE).
