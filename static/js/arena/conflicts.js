import { Api } from "./api.js";
import { esc } from "./state.js";

function el(id) {
  return document.getElementById(id);
}

const TARGET_RATE = 0.9;

const C = { source: "live", data: null, filter: "all" };

const STATUS = {
  contradict: { label: "⚠️ Conflict", short: "Conflicts" },
  tie: { label: "≈ Tie", short: "Ties" },
  agree: { label: "✅ Agreement", short: "Agreements" },
};

function open() {
  el("conflictsModal").classList.add("active");
}

function close() {
  el("conflictsModal").classList.remove("active");
}

function pct(v) {
  return v == null ? "—" : (Math.round(v * 1000) / 10).toFixed(1) + "%";
}

function num(v, d = 3) {
  if (v == null) return "—";
  const f = Math.pow(10, d);
  return (Math.round(v * f) / f).toFixed(d);
}

function sideLabel(side) {
  return side === "left" ? "Answer A" : side === "right" ? "Answer B" : "—";
}

function gradesHtml(grades) {
  if (!grades) return "";
  return Object.entries(grades)
    .map(([k, v]) => `<span class="grade-chip">${esc(k)}: ${esc(v)}</span>`)
    .join(" ");
}

function answerCol(label, side, isUserPick, isGraderPick) {
  const marks = [];
  if (isUserPick) marks.push('<span class="conflict-mark user" title="Your pick">⭐ Your pick</span>');
  if (isGraderPick) marks.push('<span class="conflict-mark grader" title="Grader pick">🤖 Grader</span>');
  return `<div class="conflict-answer${isUserPick ? " is-user" : ""}">
    <div class="conflict-answer-head"><strong>${esc(label)}</strong>
      <span class="muted">${esc(side.model || "?")} · overall ${esc(side.overall == null ? "—" : side.overall)}</span>
      ${marks.join(" ")}
    </div>
    <div class="conflict-answer-text">${esc((side.text || "").slice(0, 600))}</div>
    <div class="grades">${gradesHtml(side.grades)}</div>
  </div>`;
}

function attrDiffsHtml(c) {
  const diffs = c.attr_diffs || [];
  if (!diffs.length) return "";
  const chips = diffs
    .map((d) => {
      const fav = d.favors === "left" ? "A" : d.favors === "right" ? "B" : "tie";
      const drives = c.status === "contradict" && c.grader_pick !== "tie" && d.favors === c.grader_pick;
      const cls = "cf-attr" + (d.favors === "tie" ? " tie" : "") + (drives ? " drives" : "");
      const title = drives ? "Pushed the grader toward its pick" : `A ${d.left} vs B ${d.right}`;
      return `<span class="${cls}" title="${esc(title)}">${esc(d.key)}: A ${esc(d.left)} / B ${esc(d.right)} → ${fav}</span>`;
    })
    .join(" ");
  return `<div class="conflict-attrs"><span class="cf-attrs-label">Per attribute</span> ${chips}</div>`;
}

function judgmentBanner(c) {
  const meta = STATUS[c.status] || STATUS.agree;
  const marginTxt =
    c.margin == null ? "" : `<span class="cb-margin" title="Grader score gap between the two answers">Δ ${num(c.margin, 0)}</span>`;
  return `<div class="conflict-banner ${c.status}">
    <span class="cb-status">${meta.label}</span>
    <span class="cb-pick">⭐ You: <strong>${esc(sideLabel(c.verdict))}</strong></span>
    <span class="cb-pick">🤖 Grader: <strong>${esc(sideLabel(c.grader_pick))}</strong></span>
    ${marginTxt}
  </div>`;
}

function rowHtml(c) {
  const userIsLeft = c.verdict === "left";
  const graderIsLeft = c.grader_pick === "left";
  const graderIsRight = c.grader_pick === "right";
  return `<div class="conflict-row status-${c.status}">
    <div class="conflict-prompt"><span class="muted">Prompt ${esc(c.prompt_number ?? "")}</span> ${esc((c.prompt_text || "").slice(0, 160))}</div>
    ${judgmentBanner(c)}
    <div class="conflict-cols">
      ${answerCol("Answer A", c.left, userIsLeft, graderIsLeft)}
      ${answerCol("Answer B", c.right, !userIsLeft, graderIsRight)}
    </div>
    ${attrDiffsHtml(c)}
  </div>`;
}

function sectionHeader(status) {
  const meta = STATUS[status] || STATUS.agree;
  return `<div class="conflict-section ${status}">${meta.label} — ${esc(meta.short)}</div>`;
}

function renderVersionSelect() {
  const sel = el("conflicts-version-select");
  const versions = (C.data && C.data.versions) || [];
  const active = C.data && C.data.active_version;
  sel.innerHTML = versions
    .map((v) => {
      const last = v.is_last ? " (last)" : "";
      return `<option value="${esc(v.version_id)}"${v.version_id === active ? " selected" : ""}>${esc(v.label)}${last}</option>`;
    })
    .join("");
  sel.disabled = versions.length <= 1;
}

function renderSummary() {
  const s = (C.data && C.data.summary) || {};
  const n = s.n_decisive ?? 0;
  const agree = s.n_agree ?? 0;
  const rate = n ? agree / n : null;
  const w = rate == null ? 0 : Math.round(rate * 100);
  const hit = rate != null && rate >= TARGET_RATE;
  const grader = (C.data && C.data.active_version_grader) || "default";
  el("conflicts-summary").innerHTML =
    `<div class="cs-headline">Grader matches <strong>${agree} / ${n}</strong> of your decisive picks ` +
    `<strong class="${hit ? "cs-good" : "cs-bad"}">${pct(rate)}</strong></div>` +
    `<div class="cs-bar"><div class="cs-bar-fill${hit ? " good" : ""}" style="width:${w}%"></div>` +
    `<div class="cs-bar-target" style="left:${Math.round(TARGET_RATE * 100)}%" title="Target ${Math.round(TARGET_RATE * 100)}%"></div></div>` +
    `<div class="cs-breakdown">` +
    `<span class="cs-chip contradict">⚠️ ${s.n_contradict ?? 0} conflicts</span>` +
    `<span class="cs-chip tie">≈ ${s.n_tie ?? 0} ties</span>` +
    `<span class="cs-chip agree">✅ ${agree} agree</span>` +
    `<span class="cs-chip">κ ${num(s.cohen_kappa)}</span>` +
    `<span class="cs-chip muted">grader: ${esc(grader)}</span>` +
    `</div>` +
    `<div class="cs-goal muted">Tune graders, weights and attributes until this reaches ≥ ${Math.round(TARGET_RATE * 100)}%. Ties and skips are not counted.</div>`;
}

function renderFilters() {
  const box = el("conflicts-filters");
  if (!box) return;
  const s = (C.data && C.data.summary) || {};
  const counts = {
    all: s.n_decisive ?? 0,
    contradict: s.n_contradict ?? 0,
    tie: s.n_tie ?? 0,
    agree: s.n_agree ?? 0,
  };
  const defs = [
    ["all", "All"],
    ["contradict", "Conflicts"],
    ["tie", "Ties"],
    ["agree", "Agreements"],
  ];
  box.innerHTML = defs
    .map(
      ([k, label]) =>
        `<button type="button" class="conflicts-filter-btn${C.filter === k ? " active" : ""}" data-filter="${k}">${label} <span class="cf-count">${counts[k]}</span></button>`
    )
    .join("");
  box.querySelectorAll(".conflicts-filter-btn").forEach((b) => {
    b.addEventListener("click", () => {
      C.filter = b.getAttribute("data-filter");
      renderFilters();
      renderList();
    });
  });
}

function renderList() {
  const all = (C.data && C.data.conflicts) || [];
  const box = el("conflicts-list");
  if (!all.length) {
    box.innerHTML = `<div class="conflicts-empty neutral">No decisive judgments yet for this chat — vote on some pairs first.</div>`;
    return;
  }
  const rows = C.filter === "all" ? all : all.filter((c) => c.status === C.filter);
  if (!rows.length) {
    const what = (STATUS[C.filter] && STATUS[C.filter].short.toLowerCase()) || "rows";
    box.innerHTML = `<div class="conflicts-empty">No ${esc(what)} for this chat.</div>`;
    return;
  }
  let html = "";
  let last = null;
  rows.forEach((c) => {
    if (C.filter === "all" && c.status !== last) {
      html += sectionHeader(c.status);
      last = c.status;
    }
    html += rowHtml(c);
  });
  box.innerHTML = html;
}

function render() {
  renderVersionSelect();
  renderSummary();
  renderFilters();
  renderList();
}

async function load(source, version) {
  C.source = source;
  el("conflicts-summary").textContent = "Loading…";
  el("conflicts-list").innerHTML = "";
  const filters = el("conflicts-filters");
  if (filters) filters.innerHTML = "";
  try {
    const data = await Api.conflicts(source, version);
    const v = (data.versions || []).find((x) => x.version_id === data.active_version);
    data.active_version_grader = v ? v.grader_setting : "default";
    C.data = data;
    render();
  } catch (e) {
    el("conflicts-summary").textContent = "Failed to load conflicts.";
  }
}

export async function openConflictsReport(source) {
  open();
  C.filter = "all";
  await load(source, null);
}

export function bindConflicts() {
  const closeBtn = el("conflicts-close");
  if (closeBtn) closeBtn.addEventListener("click", close);
  const modal = el("conflictsModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });
  }
  const sel = el("conflicts-version-select");
  if (sel) {
    sel.addEventListener("change", async () => {
      const version = sel.value;
      try {
        await Api.setGradingSelection(C.source, version);
      } catch (e) {
        /* ignore persistence error, still preview */
      }
      await load(C.source, version);
    });
  }
}
