import { Api } from "./api.js";
import { esc } from "./state.js";

function el(id) {
  return document.getElementById(id);
}

const C = { source: "live", data: null };

function open() {
  el("conflictsModal").classList.add("active");
}

function close() {
  el("conflictsModal").classList.remove("active");
}

function pct(v) {
  return v == null ? "—" : (Math.round(v * 1000) / 10).toFixed(1) + "%";
}

function num(v) {
  return v == null ? "—" : (Math.round(v * 1000) / 1000).toFixed(3);
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

function answerCol(label, side, c, isUserPick, isGraderPick) {
  const marks = [];
  if (isUserPick) marks.push('<span class="conflict-mark user" title="Your pick">⭐ Your pick</span>');
  if (isGraderPick) marks.push('<span class="conflict-mark grader" title="Grader pick">🤖 Grader</span>');
  return `<div class="conflict-answer${isUserPick ? " is-user" : ""}">
    <div class="conflict-answer-head"><strong>${esc(label)}</strong>
      <span class="muted">${esc(side.model || "?")} · overall ${esc(side.overall)}</span>
      ${marks.join(" ")}
    </div>
    <div class="conflict-answer-text">${esc((side.text || "").slice(0, 600))}</div>
    <div class="grades">${gradesHtml(side.grades)}</div>
  </div>`;
}

function judgmentBanner(c) {
  const conflict = c.is_conflict;
  const bg = conflict
    ? "linear-gradient(135deg, rgba(220,53,69,0.12) 0%, rgba(220,53,69,0.18) 100%)"
    : "linear-gradient(135deg, rgba(0,184,148,0.12) 0%, rgba(0,184,148,0.18) 100%)";
  const border = conflict ? "#dc3545" : "#00b894";
  let h = `<div style="margin-bottom:12px; padding:8px 14px; background:${bg}; border-radius:8px; border-left:4px solid ${border}; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">`;
  h += `<span style="font-size:0.85rem; font-weight:700; color:#2d3436;">${conflict ? "⚠️ Conflict" : "✅ Agreement"}</span>`;
  h += `<span style="font-size:0.85rem; color:#2d3436;">⭐ Your pick: <strong>${esc(sideLabel(c.verdict))}</strong></span>`;
  h += `<span style="font-size:0.85rem; color:#2d3436;">🤖 Grader pick: <strong>${esc(sideLabel(c.grader_pick))}</strong></span>`;
  h += `</div>`;
  return h;
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
  el("conflicts-summary").innerHTML =
    `<span>Conflicts <strong>${s.n_conflicts ?? 0}</strong> / ${s.n_decisive ?? 0} decisive</span>` +
    `<span> · acc <strong>${pct(s.pairwise_acc)}</strong></span>` +
    `<span> · κ <strong>${num(s.cohen_kappa)}</strong></span>`;
}

function renderList() {
  const rows = ((C.data && C.data.conflicts) || []).filter((c) => c.is_conflict);
  const box = el("conflicts-list");
  if (!rows.length) {
    box.innerHTML = `<div class="conflicts-empty">✅ No conflicts — the grader agrees with all your decisive judgments for this chat.</div>`;
    return;
  }
  box.innerHTML = rows
    .map((c, i) => {
      const userIsLeft = c.verdict === "left";
      const graderIsLeft = c.grader_pick === "left";
      return `<div class="conflict-row">
        <div class="conflict-prompt"><span class="muted">Prompt ${esc(c.prompt_number ?? "")}</span> ${esc((c.prompt_text || "").slice(0, 160))}</div>
        ${judgmentBanner(c)}
        <div class="conflict-cols">
          ${answerCol("Answer A", c.left, c, userIsLeft, graderIsLeft)}
          ${answerCol("Answer B", c.right, c, !userIsLeft, !graderIsLeft)}
        </div>
      </div>`;
    })
    .join("");
}

function render() {
  renderVersionSelect();
  renderSummary();
  renderList();
}

async function load(source, version) {
  C.source = source;
  el("conflicts-summary").textContent = "Loading…";
  el("conflicts-list").innerHTML = "";
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
