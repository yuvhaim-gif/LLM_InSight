# Preference Studio — Operator & Developer Guide

Preference Studio is a human-in-the-loop layer on top of the grading pipeline. You judge answer
pairs, the tool measures how well the configured grader agrees with you, you adjust the grader
(weights / rubrics / models) until it matches your taste, and then you export curated,
training-ready datasets — both for the **production model** and for a trainable **pass/fail
judge**.

It is implemented as an isolated `preference/` package plus a single unified page
(`templates/studio.html`) with two tabs — **Judge** and **Build & Export** — sharing one source
rail. Existing logic is **called**, not modified. All Preference Studio state is stored
separately from the live session so nothing here can corrupt or be wiped with the ephemeral
ledger. The routes `/arena` and `/dataset` both render this page, opening it on the Judge or the
Build & Export tab respectively.

---

## 1. The workflow (end-to-end loop)

1. **Run experiments** as usual — the live ledger and saved chat backups accumulate graded
   answers.
2. **Judge tab** — pick a source (tick a checkbox to include it in builds, or click a source name
   / **🥊 Grade** to judge that chat), **Scan** to build a priority queue of the hardest /
   most-uncertain pairs, and judge them: which answer is better, a tie, or both bad. Optionally
   give each side your own 1–100 grade, pin a judgment as ground truth, or open **Refine** to
   write a gold answer and blacklist both shown answers.
3. **Calibration panel** (on `/config_graders`) — see, live, how well the current grader config
   reproduces your judgments: pairwise accuracy, Cohen's κ, Spearman, and per-attribute
   alignment. **Re-fit weights** (instant, no model calls) or **Full re-grade** (re-runs the
   Layer 3 graders with a candidate config) and **Apply** the suggestion into the page's weight
   inputs, then **Save**.
4. **Build & Export tab** — assemble curated pools from exactly the sources you tick, inspect them
   by band/confidence, push uncertain rows back to the Judge tab, and **export** training-ready
   JSONL for your chosen target and format.

Repeat until the grader's accuracy/κ against your judgments is high enough for your aim. An
on-page **How it works** banner summarises these four steps, and every control carries an
**(i) info icon**.

---

## 2. The Studio page (tabs and controls)

Every control carries the same small **(i) info icon** (`.info-icon`) with a short tooltip; the
texts below mirror those tooltips. The two tabs (**Judge** and **Build & Export**) share one
left rail listing all sources.

### 2.0 Shared source rail (both tabs)

- Each source row has a **checkbox** (tick to include the source in dataset **build/export**), a
  clickable **source name** and a **🥊 Grade** button (select that single chat and jump to the
  Judge tab), plus **Analyze** / **Forget** for backups.
- The live ledger is badged *ephemeral — current session only* and is read-only here.
- The rail also shows the **Queue** progress and the live **Fitness** (accuracy + κ).

### 2.1 Judge tab

- **Source** — where pairs come from: the live ledger or a saved backup session (chosen via the
  shared rail). The live ledger is read-only here.
- **Pairing** — same-iteration (original vs improved), cross-iteration (best vs rest), or both.
- **Blind** — hide model names and scores until you vote, to avoid bias; they are revealed after
  each vote.
- **Scan** — build the priority queue; hardest/most-uncertain pairs are shown first.
- **Analyze** (per backup, in the rail) — prompt count, grader name, first prompt; **Forget** is a
  non-destructive removal from your manifest.
- **A better / Tie / B better** — pick the answer that better satisfies the task; ordering
  matters, not the number.
- **Both bad** — neither is acceptable; opens **Refine** to write a gold answer.
- **Your grade A/B** — optional 1–100 scalar grade per side; skip if you only want the ordering.
- **★ Ground truth** — pin this judgment as high-trust ground truth (used for eval + training).
- **Refine modal** — write the correct (gold) answer; optionally **blacklist both shown**
  answers as universal FAIL/rejected.
- **Keyboard**: ←/→ pick a side, ↓ tie, `b` both-bad, `g` ground-truth, `r` refine, `1`–`9` set
  the focused scalar slider.

### 2.2 Calibration panel (on `/config_graders`)

The panel reads and writes the page's existing weight inputs — it never duplicates them.

- **Pairwise accuracy** — share of pairs where the grader's winner matches your human winner.
- **Cohen's κ** — agreement with you, corrected for chance (1 = perfect, 0 = random).
- **Spearman** — rank correlation between your scalar grades and grader overalls (needs ≥3 scored
  pairs).
- **Per-attribute alignment** — how well each attribute's scores agree with your verdicts; fix
  the low bars (rewrite that rubric, swap that grader model, drop or down-weight the attribute).
- **Re-fit weights** — suggest weights that best reproduce your judgments; instant, no model
  calls. **Apply** fills the page's weight inputs (you then click the page's **Save** to persist).
- **Full re-grade** — re-run the Layer 3 graders with the chosen config; **calls models, slow,
  blocking**. While it runs the panel disables its controls, sets `aria-busy`, and shows a
  spinner + status line.
- **History** — compare past calibration runs by accuracy/κ and pick the best fit for your aim.

Metrics update live as you edit weights (no model calls); the full re-grade is the only
model-intensive action.

### 2.3 Build & Export tab

- **Training target** — *Production model* or *Pass/Fail judge* (drives the available formats).
- **Sources** — the **ticked** rows in the shared rail feed the pools (Live + manifest backups);
  default is the live ledger. The selected sources are passed to every build/preview/export call,
  so pools are assembled from exactly those files. Each backup's pairs are tagged with **that
  backup's** grader setting — use **Analyze** to see which config a source was graded under before
  mixing sources.
- **Counts / κ** — gold / auto / review (pairwise) or PASS / FAIL / total (judge), plus the
  calibrated κ.
- **Filters** — band (GOLD / AUTO+ / REVIEW), minimum confidence, per-prompt cap; for the judge
  view also PASS/FAIL and a class-balance cap so the set is not skewed.
- **Send REVIEW → Judge** — re-queue uncertain REVIEW rows into the Judge tab for human judgment.
- **Export** — format, conversational toggle, pools (pairwise), min-confidence, train/test split,
  **Preview**, and **Download**.

#### Pools (pairwise)

- **Ground truth (human)** — decisive human verdicts, `ground_truth`-pinned rows, and
  `both_bad` + gold corrections. Highest trust.
- **Blacklist** — answers in the blacklist table and `both_bad` losers; a universal **rejected**
  source, never used as a chosen answer.
- **Automated (machine)** — ledger pairs not human-judged, promoted to **AUTO+** only when they
  pass the margin + confidence thresholds, deduped, and capped per prompt; everything else lands
  in **REVIEW**.

---

## 3. Two training targets

| Target | Goal | Formats | Data used |
|---|---|---|---|
| **A — Production model** | the model that performs the tested task | `sft`, `preference`, `kto` | good answers (SFT targets / chosen), bad answers (rejected / KTO negatives) |
| **B — Pass/Fail judge** | a trainable "Layer 3" grader | `preference` (reward model), `judge_cls`, `judge_gen` | human verdicts + gold (PASS), blacklist + both_bad losers (FAIL), calibrated grade bands |

`preference` serves both targets: as DPO data for the production model and as reward-model data
for the judge. Both targets draw from the **same** curated pools/examples — nothing is wasted.

- Pick **Production model** when you are training the model that does the task.
- Pick **Pass/Fail judge** when you are training a fast, trainable replacement/aid for the Layer 3
  LLM grader.

---

## 4. Export formats

Each format emits a **clean training file** whose columns exactly match what the trainer expects,
plus a line-aligned `*.meta.jsonl` provenance sidecar (keyed by `pair_id`) and a `*.card.json`
summary. **Drop the `*.meta.jsonl` sidecar before training** — never feed it to the trainer.

| `format` | Dataset type | Standard columns | Conversational columns | Trainer |
|---|---|---|---|---|
| `preference` | TRL `preference` | `{prompt, chosen, rejected}` | message-list `prompt`/`chosen`/`rejected` | `DPOTrainer`, `RewardTrainer` |
| `sft` | TRL `prompt_completion` | `{prompt, completion}` (PASS only) | `{messages:[user,assistant]}` | `SFTTrainer` |
| `kto` | TRL `unpaired_preference` | `{prompt, completion, label}` | message-list `prompt`/`completion` | `KTOTrainer` |
| `judge_cls` | `text_classification` | `{text, label∈{0,1}}` | — | `AutoModelForSequenceClassification` / SetFit |
| `judge_gen` | TRL `prompt_completion` | `{prompt, completion}` (`PASS`/`FAIL`) | `{messages:[user,assistant]}` | `SFTTrainer` (generative judge) |

Each exported file loads directly via `datasets.load_dataset('json', ...)`. Usage snippets (the
`*.meta.jsonl` sidecar is dropped — load only the `*_train.jsonl` / `*_test.jsonl`):

**`preference` → DPO / Reward**
```python
from datasets import load_dataset
from trl import DPOTrainer  # or RewardTrainer
ds = load_dataset("json", data_files={"train": "preference_std_<ts>_train.jsonl"})
# trainer = DPOTrainer(model, args=..., train_dataset=ds["train"], ...)
```

**`sft` → SFTTrainer (good answers only)**
```python
from datasets import load_dataset
from trl import SFTTrainer
ds = load_dataset("json", data_files={"train": "sft_std_<ts>_train.jsonl"})
# trainer = SFTTrainer(model, args=..., train_dataset=ds["train"])
```

**`kto` → KTOTrainer (good + bad, boolean label)**
```python
from datasets import load_dataset
from trl import KTOTrainer
ds = load_dataset("json", data_files={"train": "kto_std_<ts>_train.jsonl"})
# trainer = KTOTrainer(model, args=..., train_dataset=ds["train"])
```

**`judge_cls` → sequence-classification (binary PASS/FAIL)**
```python
from datasets import load_dataset
ds = load_dataset("json", data_files={"train": "judge_cls_std_<ts>_train.jsonl"})
# tokenize ds["train"]["text"] -> AutoModelForSequenceClassification + Trainer (labels 0/1)
```

**`judge_gen` → SFTTrainer (generative PASS/FAIL)**
```python
from datasets import load_dataset
from trl import SFTTrainer
ds = load_dataset("json", data_files={"train": "judge_gen_std_<ts>_train.jsonl"})
# completion is the literal "PASS"/"FAIL" verdict
```

The **conversational** toggle switches the columns to message lists (`[{role, content}, …]`)
where applicable. Optional `trl`/`transformers`/`datasets`/`accelerate` are used **outside** the
app to train; they are never imported by the running app.

---

## 5. Files & config knobs

New isolated package and assets:

- `preference/` — `store.py` (SQLite), `extract.py` (pairs from ledger/backups),
  `active_learning.py` (queue scoring), `calibrate.py` (metrics, re-fit, re-grade),
  `dataset.py` (pools + examples), `export.py` (writers), `routes.py` (blueprint).
- `templates/studio.html` — the unified two-tab page (`/arena` and `/dataset` both render it);
  the calibration panel is hosted on `templates/config_graders.html`.
- `static/js/studio/init.js` — the page orchestrator (tabs, shared source rail), which **reuses**
  the logic modules `static/js/arena/{state,api,arena,refine}.js`,
  `static/js/dataset/{table,export}.js`, and `static/js/calibrate/panel.js` unchanged.
- `static/css/studio.css`, `static/css/arena.css`, `static/css/dataset.css`.

Config constants (in `config/settings.py`):

| Constant | Meaning |
|---|---|
| `PREFERENCES_DB` | Isolated SQLite DB for judgments, queue, blacklist, calibration runs |
| `PREFERENCE_EXPORT_DIR` | Where exported datasets are written |
| `PREFERENCE_REGRADE_DIR` | Where Tier-B re-grade artifacts are written |
| `ARENA_QUEUE_WEIGHTS`, `ARENA_CROSS_*`, `ARENA_PASS_THRESHOLDS` | Active-learning queue + pairing knobs |
| `DATASET_AUTO_MIN_MARGIN` | Minimum overall-score gap to auto-label a pair |
| `DATASET_AUTO_MIN_CONF` | Minimum confidence to promote a row to AUTO+ |
| `DATASET_MAX_PER_PROMPT` | Per-prompt cap on auto rows |
| `DATASET_TEST_SPLIT`, `DATASET_DEFAULT_FORMAT`, `DATASET_EXPORT_CONVERSATIONAL` | Export defaults |
| `JUDGE_PASS_GRADE`, `JUDGE_FAIL_GRADE` | PASS/FAIL bands for per-answer examples |
| `JUDGE_GEN_INSTRUCTION`, `JUDGE_CLS_TEMPLATE` | Templates for the judge formats |

---

## 6. Persistence & security guarantees

- **Isolation** — all judgments, queue, blacklist, and calibration runs live in `PREFERENCES_DB`;
  exports and re-grade artifacts live in their own directories. None of this is touched by the
  app's clear/backup of the live session.
- **The live ledger is ephemeral and read-only here** — the Judge tab can read it as a source, but
  Preference Studio never writes to it.
- **Re-grade never pollutes the ledger** — Tier-B full re-grade calls the lower-level
  `_grade_single_category`, not `layer3_grade` (which would append to the live ledger). Re-grade
  results are written only to `PREFERENCE_REGRADE_DIR`.
- **Atomic writes** — every dataset/sidecar/card file is written to a temp path and then
  `os.replace`d into place, so readers never see partial files.
- **Clean training files** — no provenance/extra keys ever appear in a training row; provenance
  lives only in the `*.meta.jsonl` sidecar.
