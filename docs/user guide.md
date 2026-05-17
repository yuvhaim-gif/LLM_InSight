# LLM InSights — User Guide

## What Is This?

A tool for creating your own grading rubric, automatically optimizing prompts, A/B testing models, and refining synthetic data — all from the browser. It sends your prompt to two competing models, grades their answers across configurable quality categories, rewrites the prompt to improve results, and repeats until a target score is reached. Everything is saved for review, analysis, and export.

## Quick Start

1. Open the app and sign in.
2. Pick your models and adjust settings.
3. Type a prompt and press **START ANALYSIS**.
4. Review the best answers, iteration cards, and charts.
5. Download results as JSON to save or restore later.

---

## Pages

### Login (`/login`)

Enter username and password, then press **Sign In**. Invalid credentials show an error message.

### Main Analysis (`/`)

The central page for running experiments and configuring every aspect of the analysis.

#### Top Bar

- **Logged in as** — current user.
- **Logout** — ends session, backs up data, returns to login.
- **System profile** — Simple Laptop / Good Laptop or Desktop / Super Laptop or Good Desktop. Filters model dropdowns by speed category: Simple shows only fast and middle-speed models, Good adds slower models, Super shows all models including the slowest. Models are color-coded by speed: green (fast), yellow (middle), orange (slower), red (slow). Browser-only setting.

#### Weights Panel (Left Side)

Controls how much each quality category matters in the overall score.

| Category | Default |
|---|---|
| Accuracy | 0.25 |
| Clarity | 0.25 |
| Creativity | 0.25 |
| Conciseness | 0.15 |
| Structure | 0.10 |

These are the default categories and weights. When using a custom grader setting, categories and weights update dynamically to match the setting.

- **Apply** — sends weights to the backend (auto-normalized to sum 1). These override the grader setting's default weights for the current session.
- **Reset** — restores defaults for the active grader setting.
- A pencil icon appears when you have unapplied edits.
- **Config Graders** — opens the grader configuration page.
- **Grader selector** — dropdown to switch between available grader settings (default and custom). Switching resets any manually applied weights to the new setting's defaults and dynamically rebuilds the weight inputs.
- Up to 5 weight items display per row; 6th-8th keys wrap to a second line.

#### Domain Helpers

- **Advise Models by Domain** — filters model dropdowns by use case (All, Coding/Dev, Creative/Writing, Science/Reasoning, Experimental, Balanced). Visual filter only, stored in browser.
- **Domain Selection** — applies a weight preset (Balanced, Accuracy, Creativity, Conciseness). Takes effect after pressing Apply.

#### Loop Settings

- **Break Target Grade** (1-100, default 100) — loop stops when best score reaches this.
- **Iterations** (1-5, default 5) — max refinement rounds per prompt.

#### Toggles

| Toggle | Effect | Default |
|---|---|---|
| **Degradation Break** | Stop when score drops from previous iteration | On |
| **Change Prompt** | Let Layer 2 rewrite the prompt before Layer 1B runs | On |
| **Give Ideas** | Generate brainstorming ideas (Layer 0) before the loop | On |
| **Last Best Answer Retention** | Feed best answer so far as context into next iteration | On |
| **Grade vs. Current / First Prompt** | Graders judge against current or first prompt in session | Current |

#### Action Buttons

- **START ANALYSIS** — runs the iterative loop.
- **Clear Chat** — backs up and resets runtime state.
- **Upload Chat** — imports a JSON backup. Disabled when the console already has content (clear chat first).
- **Download Chat** — two options:
  - **As Text** — human-readable log (not restorable).
  - **As JSON** — full backup (restorable).
- **Review History** — opens the review page.

#### Results Area

- **Best-Best Answers** — winning answer for each prompt (latest first), with score, model, iteration, and expandable prompt text. Tied answers shown when multiple entries share the top score.
- **Iteration History** — one card per prompt with a line chart (Layer 1A vs Layer 1B vs Best scores) and iteration detail cards: models, scores, runtimes, winner badges, degradation flags, best-best indicators.
- **Analyze Deeper** — modal with four chart sections:
  - Average Grade Analysis: bar chart (Layer 1A vs 1B with winner line) and radar chart (best-best key grades with weighted average). Adjustable weight controls for what-if recalculation.
  - Token Usage & Runtime Analysis: stacked bar chart (input/output tokens per model) and bar chart (runtimes per model). Token chart only appears when token data is available.
  - Individual Grading Key Analysis: one bar chart per grading key showing Layer 1A vs 1B scores per iteration.
- **Console Output** — full raw processing log.

#### Model Selectors (Right Sidebar)

| Layer | Role | Default |
|---|---|---|
| Layer 0 (Ideas) | Brainstorming directions before loop | `gemma2:9b` |
| Layer 1A (Answer 1) | Original answer each iteration | `gemma:7b-instruct-q4_K_M` |
| Layer 1B (Answer 2) | Improved answer each iteration | `granite4:latest` |
| Layer 2 (Prompt Improver) | Rewrites prompt between 1A and 1B | `open-mistral-nemo-2407` |
| Layer 3 (Graders) | Configurable small models, one per category | Configurable via Config Graders page |

- **Advanced panel** — assign a different model to each iteration for Layer 1A, 1B, and Layer 2 individually. Enables systematic cross-model A/B comparisons. When advanced models are saved, the corresponding main sidebar selectors are locked and show "Advanced (Per-Iteration)". Changing a main selector clears all advanced maps and unlocks the selectors.

### Config Graders (`/config_graders`)

Create and manage grader settings — named configurations that define grading categories, rubrics, models, and default weights. This is the core tool for building your own grading rubric.

#### Loading and Viewing

- **Load Setting** — select an existing grader setting from the dropdown and press Load. The table populates with its keys, rubrics, grader models, and weights. Edit mode is exited automatically on load.
- **Read-only notice** — appears when viewing the `default` setting, which cannot be modified or overwritten.

#### Editing

- **Edit** — enters edit mode, making all fields editable. When the `default` setting is loaded, a warning prompts to save under a new name.
- **Cancel** — exits edit mode without saving changes.
- **Add Grading Key** — adds a new row (up to 8 maximum). Each key requires:
  - **Key name** — automatically lowercased with spaces converted to underscores. Duplicate names are detected and prevented on save.
  - **Rubric** — free-text description of what the key measures and how it should be scored.
  - **Grader model** — one of the available grader models: `phi3:mini`, `gemma2:2b`, `qwen2.5:1.5b`, `llama3.2:3b`.
  - **Weight %** — entered as a percentage (e.g. 25 for 25%), converted to a 0-1 decimal on save and back to percentage on load.
- **Remove** — removes a grading key row from the configuration.
- **Weight total indicator** — live pill next to "Add Grading Key" shows the sum of all weights. Turns green at 100%, red otherwise.

#### Saving

- **Setting Name** — enter a name for the configuration. Names are automatically lowercased with spaces converted to underscores.
- **Save Setting** — saves the configuration. Blocked with an error unless:
  - All keys have a name, rubric, and grader model.
  - Weights sum to exactly 100%.
  - The name is not `default`.
- If a setting with that name already exists, a confirmation dialog warns about overwriting.
- After saving, the new setting appears in the Load Setting dropdown automatically, and edit mode is exited.

#### Integration with Main Page

- The **grader selector** on the main page lists all saved grader settings. Switching the active setting resets any manually applied weights to the new setting's defaults and dynamically rebuilds weight inputs.
- The active grader setting name is stored in the session and saved with chat backups, so it can be restored when loading a backup from the review page.

- **Back to Main** — returns to the main analysis page.

### Review History (`/review_chats`)

The review page serves as both a log of past runs and a deeper analysis tool.

- Lists saved backups from `~/Downloads`, newest first.
- Select a chat to see prompt summary (scores, categories, models, iterations).
- Score grids and iteration cards dynamically display whatever grading keys were used during the run — they are not limited to the default five categories.
- Drill into any prompt for charts and iteration cards showing Layer 1A vs Layer 1B comparisons.
- **Analyze Deeper** — detailed charts modal showing:
  - The grader setting name from the original run.
  - Average Grade Analysis: bar chart (Layer 1A vs 1B with winner line) and radar chart (best-best key grades) with adjustable weight controls for what-if analysis.
  - Token Usage & Runtime Analysis: stacked token bar chart and runtime bar chart.
  - Individual Grading Key Analysis: per-key bar charts (Layer 1A vs 1B).
- **Load This Chat** — restores backup into active session (clears current data, confirmation required). Automatically loads the grader setting that was active during the run.
- **Delete Chat** — removes backup file (confirmation required).
- **Upload Chat** — import and restore a JSON backup file.
- **Back to Analysis** — returns to main page.

---

## How the Loop Works

Each time you press START ANALYSIS, the main page switches to a full-screen processing view showing the current prompt number, iteration count, model runs completed, and elapsed time. When processing finishes, the page reloads with results.

1. **Layer 0 — Brainstorm** (optional): generates up to five short idea directions. These feed into later layers as context.

2. **Per iteration:**
   - **Layer 1A**: first model answers the prompt (with optional accumulated context from previous iterations).
   - **Layer 3**: grader models score the answer in parallel across all configured categories (customizable via Config Graders).
   - **Layer 2** (optional): rewrites the prompt using grader feedback, best answers, micro-ideas, and weights. Uses Chain-of-Thought, Few-Shot, Tree of Thoughts, Role Prompting, and other techniques. Preserves the original prompt's intent.
   - **Layer 1B**: second model answers the rewritten prompt.
   - **Layer 3**: grades the improved answer.
   - **A/B Result**: higher score wins. Ties go to the improved side. Both scores, the winner, and model metadata are recorded.
   - **Best-best tracking**: if the winner beats all previous iterations, it becomes the new best.
   - **Stop checks**: loop ends if score reaches the target grade, or degradation break fires (score dropped).

3. **Final output**: best-best answer (and any ties) displayed with full scoring breakdown, model usage, and token counts.

Multi-prompt sessions carry the best answer from the previous prompt forward as context.

---

## Capabilities

### Creating Your Own Grading Rubric

- Open Config Graders (`/config_graders`) from the main page.
- Define 1-8 grading categories, each with a key name, rubric, grader model, and weight.
- Save named configurations. Switch between them on the main page.
- The `default` setting ships with five categories and is read-only.
- Custom settings can use any categories you need (e.g. `humor`, `safety`, `relevance`).

### Automatic Prompt Optimization

- Toggle Change Prompt to Yes on the main page.
- Layer 2 rewrites your prompt each iteration using grader feedback and category weights.
- Techniques applied: Zero-Shot, Few-Shot, CoT, Self-Consistency, Least-to-Most, ToT, Directional Stimulus, Role Prompting, Generated Knowledge, CoVe, Skeleton-of-Thought.
- The original prompt's intent, rules, and constraints are always preserved.
- Weights influence which weak areas get priority attention.

### A/B Testing Models

- Pick different models for Answer Model 1 (Layer 1A) and Answer Model 2 (Layer 1B).
- Each iteration runs both, grades both, and picks the winner.
- Advanced panel: assign different models to specific iterations for Layer 1A, 1B, and Layer 2.
- Every iteration records: original score, improved score, winner, models used.
- Compare patterns across iteration cards and charts.

### Refining Synthetic Data

- Each iteration produces progressively refined prompt-answer pairs.
- Multiple models compete; only the best answer survives (natural quality filter).
- Every output labeled with multi-dimensional scores across all configured categories: (prompt, answer, scores) tuples.
- Layer 2 generates (original prompt, improved prompt) pairs.
- Best-best selection distills the highest-quality answer per prompt.
- JSONL ledger contains all calls with prompts, replies, models, scores, tokens — ready for dataset construction.
- Cross-prompt context enables multi-turn synthetic conversations.
- LangSmith tracing provides full observability.

### Review Page as Log and Analysis Tool

- Browse all saved backups from `~/Downloads`, sorted by date.
- Per-prompt iteration stats with scores, models, runtimes, and token usage.
- All Prompts Summary table shows best scores, per-category scores (uses the default five category columns: accuracy, clarity, creativity, structure, conciseness), model, and iteration count at a glance.
- Dynamic score grids in iteration cards render whatever grading keys were used (not limited to defaults).
- Analyze Deeper modal: per-category bar/radar charts, adjustable weights for what-if analysis, grader setting name from the original run.
- Load past sessions back into the main page for continued experimentation.
- Delete old runs or upload exported JSON files.

### Prompts

- Full prompt history tracked across iterations and sessions.
- Multi-prompt chaining: best answer from prompt N carries into prompt N+1.
- Automatic prompt improvement via Layer 2.
- Grade-vs-prompt mode: grade against current or first prompt.
- Change Prompt toggle off = pure model-vs-model comparison.

### Models

- Four providers routed by model name: Ollama (local), Mistral API, Google Gemini API, GLM-4 (HuggingFace).
- GLM-4 models are preloaded in the background at startup and unloaded on exit or process termination (Ctrl+C).
- 28 preconfigured models across layers.
- Independent model selection per layer.
- Advanced mode: different model per iteration per layer.
- Model changes between iterations are detected and logged.

### Grading

- Configurable parallel grading on every answer (1-8 categories per grader setting).
- Default: five categories (accuracy, clarity, conciseness, creativity, structure) with dedicated rubrics.
- Custom grader settings: define key names, rubrics, grader models, and default weights via Config Graders page.
- Strict rubrics: 50 = pass, 75 = good, 95 = near-perfect, 100 = reserved.
- Customizable weights per setting, adjustable per prompt, auto-normalized.
- Up to 3 retries per grader on failure.
- Failed models get a default score (grader: 50, answer model: 1).
- Grader setting name saved with chat backups; automatically restored when loading from review.

### Export and Backup

- Full JSON backup: console, prompts, iterations, best-best, ledger, models, weights, toggles.
- JSONL ledger with every layer call (timestamps, models, tokens, scores).
- Upload/download via main page.
- Load/delete from review page.
- Automatic backups on startup, login, logout, clear, and exit.
- Versioned format (v2.0).

---

## Frontend-Only vs Backend Controls

| Control | Storage | Effect |
|---|---|---|
| Domain advisor filter | localStorage | Filters dropdowns visually |
| Weight profile selector (before Apply) | localStorage | Pre-fills weight fields |
| Deeper-analysis modal weights | Temporary | Charts only |
| System profile | localStorage | Filters model dropdowns by speed category |

All other controls (models, weights after Apply, toggles, loop settings, grader settings) are stored in the server session.

---

## Tips

1. Start with a clear prompt.
2. Keep iterations low (1-3) for initial exploration.
3. Adjust weights based on what matters for your use case.
4. Compare A/B patterns across iteration cards.
5. Save successful runs as JSON for later.
6. Use Review History to compare runs and do what-if analysis with different weights.
7. Export the JSONL ledger when collecting training data.
8. Create custom grader settings for domain-specific evaluation (e.g. add `humor`, `safety`, or `relevance` categories).
9. Use the Advanced panel to test the same prompt against different models per iteration.

---

## Notes

- This is a research and experimentation tool.
- Logging out ends the session and automatically backs up state.
- Clear Chat removes runtime state only after creating a backup.
- Models route to their provider (Ollama, Mistral, Gemini, GLM) based on model name.
