import { S, esc } from "../arena/state.js";
import { Api } from "../arena/api.js";
import { Arena, refreshFitness } from "../arena/arena.js";
import { Refine } from "../arena/refine.js";
import { openConflictsReport, bindConflicts } from "../arena/conflicts.js";
import { Table } from "../dataset/table.js";
import { Export } from "../dataset/export.js";

function el(id) {
  return document.getElementById(id);
}

let BACKUPS = [];

const DS = {
  build: { gold: [], auto: [], review: [], counts: {}, kappa: null },
  examples: { examples: [], counts: {}, kappa: null },
};

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("request failed");
  return r.json();
}

function cssEsc(s) {
  return (s || "").replace(/["\\]/g, "\\$&");
}

/* ---------------- tabs ---------------- */
function showTab(name) {
  document.querySelectorAll(".studio-tab").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-tab") === name);
  });
  document.querySelectorAll(".studio-panel").forEach((p) => {
    p.classList.toggle("active", p.getAttribute("data-panel") === name);
  });
}

function activeTab() {
  const b = document.querySelector(".studio-tab.active");
  return b ? b.getAttribute("data-tab") : "arena";
}

/* ---------------- shared sources ---------------- */
function srcRow(value, label, enabled, isLive, ephemeral, fullPrompt, grader) {
  const checked = isLive && enabled ? "checked" : "";
  const chkDisabled = enabled ? "" : "disabled";
  const eph = ephemeral ? ` <em class="ephemeral">${esc(ephemeral)}</em>` : "";
  const graderTxt = grader ? ` · ${esc(grader)}` : "";
  const title = fullPrompt ? esc(fullPrompt) : "Click to grade this chat in the Judge tab";
  const actions = [`<button class="mini" data-act="grade"${enabled ? "" : " disabled"}>🥊 Grade</button>`,
                   `<button class="mini" data-act="report">⚠️ Report</button>`];
  if (!isLive) {
    actions.push(`<button class="mini" data-act="analyze">Analyze</button>`);
    actions.push(`<button class="mini" data-act="forget">Forget</button>`);
  }
  return `<div class="src-row" data-value="${esc(value)}" data-live="${isLive ? 1 : 0}">
    <div class="src-top">
      <input type="checkbox" class="src-chk" value="${esc(value)}" ${checked} ${chkDisabled}
             title="Include this source in dataset build &amp; export">
      <span class="src-label" role="button" tabindex="0" title="${title}">${esc(label)}<span class="src-grader" data-file="${esc(value)}">${graderTxt}</span>${eph}</span>
    </div>
    <div class="src-actions">${actions.join("")}</div>
    <div class="src-detail"></div>
  </div>`;
}

async function loadSources() {
  const data = await Api.sources();
  BACKUPS = data.backups || [];
  const live = data.live || {};
  const liveOk = !!live.available;
  const liveLabel = live.prompt_preview ? "📥 " + live.prompt_preview : "📥 Live ledger";
  const rows = [srcRow("live", liveLabel, liveOk, true,
    `ephemeral — current session only${liveOk ? "" : " (empty)"}`, live.first_prompt || "", "")];
  BACKUPS.forEach((b) =>
    rows.push(srcRow(b.file, "📁 " + (b.prompt_preview || b.label), true, false, "",
      b.first_prompt || b.label, b.grader_setting)));
  el("source-manager").innerHTML = rows.join("");
  bindSourceEvents();

  if (liveOk) {
    S.source_kind = "live";
    S.source_ref = "live_ledger";
  } else if (BACKUPS[0]) {
    S.source_kind = "backup";
    S.source_ref = BACKUPS[0].file;
  } else {
    S.source_kind = "live";
    S.source_ref = "live_ledger";
  }
  highlightSelected();
}

function bindSourceEvents() {
  document.querySelectorAll("#source-manager .src-chk").forEach((c) =>
    c.addEventListener("change", rebuild)
  );
  document.querySelectorAll("#source-manager .src-label").forEach((lbl) => {
    const value = lbl.closest(".src-row").getAttribute("data-value");
    lbl.addEventListener("click", () => gradeSource(value));
    lbl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        gradeSource(value);
      }
    });
  });
  document.querySelectorAll("#source-manager .mini[data-act]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onSrcAction(btn);
    });
  });
}

function highlightSelected() {
  const cur = S.source_kind === "live" ? "live" : S.source_ref;
  document.querySelectorAll("#source-manager .src-row").forEach((row) => {
    row.classList.toggle("selected", row.getAttribute("data-value") === cur);
  });
}

function gradeSource(value) {
  const row = document.querySelector(`#source-manager .src-row[data-value="${cssEsc(value)}"]`);
  if (row && row.querySelector('.mini[data-act="grade"]').disabled) return;
  const live = value === "live";
  S.source_kind = live ? "live" : "backup";
  S.source_ref = live ? "live_ledger" : value;
  highlightSelected();
  showTab("arena");
  doScan();
}

function arenaPromptSelectorHtml(list, idx) {
  if (list.length <= 1) return "";
  const opts = list
    .map((p, i) => {
      const preview = (p.prompt_text || "").replace(/\s+/g, " ").trim().slice(0, 60);
      const label = "Prompt " + (p.prompt_number || i + 1) + (preview ? " · " + preview : "");
      return `<option value="${i}"${i === idx ? " selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
  return `<div class="arena-deeper-prompt" style="margin-bottom:12px; padding:8px 14px; background:linear-gradient(135deg, rgba(9,132,227,0.10) 0%, rgba(9,132,227,0.16) 100%); border-radius:8px; border-left:4px solid #0984E3; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
    <span style="font-size:0.85rem; font-weight:700; color:#2d3436;">🧭 Prompt</span>
    <select id="arenaDeeperPromptSelect" style="padding:5px 8px; border-radius:6px; border:1px solid #cdd5df; font-size:0.82rem; max-width:420px;">${opts}</select>
  </div>`;
}

function openArenaDeeper(list, idx, grader, weights) {
  if (typeof window.openDeeperAnalysis !== "function") return;
  const p = list[idx];
  const ctx = {
    bannerHtml: arenaPromptSelectorHtml(list, idx),
    onMount: (body) => {
      const sel = body.querySelector("#arenaDeeperPromptSelect");
      if (sel) {
        sel.addEventListener("change", () => {
          const next = parseInt(sel.value, 10) || 0;
          openArenaDeeper(list, next, grader, weights);
        });
      }
    },
  };
  window.openDeeperAnalysis(p.prompt_number || idx + 1, p.iterations || [], grader, weights, ctx);
}

async function onSrcAction(btn) {
  const row = btn.closest(".src-row");
  const file = row.getAttribute("data-value");
  const act = btn.getAttribute("data-act");
  if (act === "grade") {
    gradeSource(file);
    return;
  }
  if (act === "report") {
    openConflictsReport(file === "live" ? "live" : file);
    return;
  }
  if (act === "analyze") {
    const d = row.querySelector(".src-detail");
    d.textContent = "Loading…";
    try {
      const m = await Api.analyze(file);
      const prompts = m.prompts || {};
      const list = Object.keys(prompts)
        .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
        .map((k) => prompts[k])
        .filter((p) => p && (p.iterations || []).length);
      if (!list.length) {
        d.textContent = "No analysis data.";
        return;
      }
      d.textContent = "";
      openArenaDeeper(list, 0, m.grader_setting || "default", m.weights || {});
    } catch (e) {
      d.textContent = "Analyze failed.";
    }
  } else if (act === "forget") {
    try {
      await Api.forget(file);
      await loadSources();
      rebuild();
    } catch (e) {
      /* ignore */
    }
  }
}

function selectedSources() {
  const out = [];
  document.querySelectorAll("#source-manager .src-chk").forEach((c) => {
    if (c.checked) out.push(c.value);
  });
  return out.length ? out : ["live"];
}

function sourcesQuery() {
  return "sources=" + encodeURIComponent(selectedSources().join(","));
}

/* ---------------- judge (arena) ---------------- */
async function doScan() {
  S.pair_mode = el("mode").value;
  el("progress").textContent = "Scanning…";
  try {
    const r = await Api.scan(S);
    el("progress").textContent = `Queued ${r.queued} · Annotated ${r.annotated} / ${r.total}`;
    await Arena.advance();
    refreshFitness();
  } catch (e) {
    el("progress").textContent = "Scan failed.";
  }
}

function isTyping(e) {
  const t = e.target;
  if (!t) return false;
  const tag = (t.tagName || "").toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "input" && t.type === "text") return true;
  return false;
}

function bindKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (activeTab() !== "arena") return;
    if (el("refineModal").classList.contains("active")) return;
    const t = e.target;
    const focusedSlider = t && (t.id === "left_human" || t.id === "right_human");
    if (focusedSlider && e.key >= "1" && e.key <= "9") {
      t.value = parseInt(e.key, 10) * 10;
      e.preventDefault();
      return;
    }
    if (isTyping(e)) return;
    switch (e.key) {
      case "ArrowLeft":
        Arena.vote("left");
        break;
      case "ArrowRight":
        Arena.vote("right");
        break;
      case "ArrowDown":
        Arena.vote("tie");
        break;
      case "b":
        Arena.vote("both_bad");
        break;
      case "g":
        Arena.groundTruth();
        break;
      case "r":
        if (S.current) Refine.open(S.current);
        break;
      default:
        return;
    }
    e.preventDefault();
  });
}

function bindArena() {
  el("scan").addEventListener("click", doScan);
  el("blind").addEventListener("change", () => {
    S.blind = el("blind").checked;
    if (S.current) Arena.render(S.current);
  });
  document.querySelectorAll(".vote-btn[data-verdict]").forEach((b) => {
    b.addEventListener("click", () => Arena.vote(b.getAttribute("data-verdict")));
  });
  el("ground-truth").addEventListener("click", () => Arena.groundTruth());
  Refine.bind((res) => {
    Arena.render(res.next);
    refreshFitness();
  });
}

/* ---------------- build & export (dataset) ---------------- */
function target() {
  return el("target").value;
}

function filters() {
  return {
    band: el("f-band").value,
    minconf: parseFloat(el("f-minconf").value) || 0,
    label: el("f-label").value,
    cap: parseInt(el("f-cap").value, 10) || 0,
    balance: parseInt(el("f-balance").value, 10) || 0,
  };
}

function renderCounts() {
  if (target() === "judge") {
    const c = DS.examples.counts || {};
    el("counts").innerHTML = `PASS <strong>${c.pass || 0}</strong> · FAIL <strong>${c.fail || 0}</strong> · total ${c.total || 0} · κ ${esc(DS.examples.kappa)}`;
  } else {
    const c = DS.build.counts || {};
    el("counts").innerHTML = `Gold <strong>${c.gold || 0}</strong> · Auto <strong>${c.auto || 0}</strong> · Review <strong>${c.review || 0}</strong> · blacklist ${DS.build.blacklist_count || 0} · κ ${esc(DS.build.kappa)}`;
  }
}

function applyTargetUI() {
  const isJudge = target() === "judge";
  document.querySelectorAll(".judge-only").forEach((e) => {
    e.style.display = isJudge ? "" : "none";
  });
  Export.refreshFormats();
}

function renderTable() {
  Table.render(DS.build, DS.examples, target(), filters());
}

async function rebuild() {
  const qs = sourcesQuery();
  el("table-area").innerHTML = '<div class="muted">Building…</div>';
  try {
    const [build, examples] = await Promise.all([
      getJSON("/api/dataset/build?" + qs),
      getJSON("/api/dataset/examples?" + qs),
    ]);
    DS.build = build;
    DS.examples = examples;
  } catch (e) {
    el("table-area").innerHTML = '<div class="muted">Build failed.</div>';
    return;
  }
  renderCounts();
  renderTable();
}

async function sendReviewToArena() {
  const ids = Table.selectedReviewIds();
  if (!ids.length) {
    el("send-review").textContent = "No REVIEW rows";
    return;
  }
  try {
    const r = await fetch("/api/dataset/send_to_arena", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_ids: ids }),
    });
    const body = await r.json();
    el("send-review").textContent = `Sent ${ids.length} → Judge`;
    if (body.total != null) {
      el("progress").textContent = `Queued REVIEW · Annotated ${body.annotated} / ${body.total}`;
    }
    showTab("arena");
    await Arena.advance();
    refreshFitness();
  } catch (e) {
    /* ignore */
  }
}

function bindFilters() {
  ["f-band", "f-label", "f-cap", "f-balance"].forEach((id) =>
    el(id).addEventListener("change", renderTable)
  );
  el("f-minconf").addEventListener("input", () => {
    el("f-minconf-val").textContent = el("f-minconf").value;
    renderTable();
  });
}

function bindDataset() {
  el("rebuild").addEventListener("click", rebuild);
  el("send-review").addEventListener("click", sendReviewToArena);
  el("target").addEventListener("change", () => {
    applyTargetUI();
    renderCounts();
    renderTable();
  });
  bindFilters();
  Export.init(selectedSources, target);
}

function bindTabs() {
  document.querySelectorAll(".studio-tab").forEach((b) =>
    b.addEventListener("click", () => showTab(b.getAttribute("data-tab")))
  );
}

/* ---------------- boot ---------------- */
async function start() {
  bindTabs();
  bindArena();
  bindDataset();
  bindConflicts();
  bindKeyboard();
  applyTargetUI();
  showTab(window.__STUDIO_TAB__ === "dataset" ? "dataset" : "arena");
  try {
    await loadSources();
  } catch (e) {
    el("source-manager").textContent = "Failed to load sources.";
  }
  await rebuild();
  refreshFitness();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
