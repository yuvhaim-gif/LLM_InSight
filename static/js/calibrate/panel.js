const PANEL_ID = "calibration-panel";

function info(text) {
  return `<span class="info-icon" tabindex="0" role="img" aria-label="${esc(text)}" data-tooltip="${esc(text)}">i</span>`;
}

function esc(s) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(s == null ? "" : String(s)));
  return d.innerHTML;
}

function pct(x) {
  return x == null ? "—" : (Math.round(x * 1000) / 10).toFixed(1) + "%";
}

function num(x, d = 3) {
  return x == null ? "—" : (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
}

const Api = {
  async report() {
    const r = await fetch("/api/calibrate/report");
    return r.json();
  },
  async refit() {
    const r = await fetch("/api/calibrate/refit", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    return r.json();
  },
  async regrade(name) {
    const r = await fetch("/api/calibrate/regrade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grader_setting: name }),
    });
    return r.json();
  },
  async history() {
    const r = await fetch("/api/calibrate/history");
    return r.json();
  },
};

function panelEl() {
  return document.getElementById(PANEL_ID);
}

function buildShell() {
  const el = panelEl();
  if (!el) return;
  el.innerHTML = `
    <div class="cal-card" style="margin-top:22px;padding:18px;border-radius:12px;background:#f8f9fa;border:1px solid #e3e8ed;">
      <h3 style="margin:0 0 12px;font-size:1.05rem;color:#2d3436;display:flex;align-items:center;gap:6px;">
        🎯 Calibration vs. your judgments
        ${info("Live alignment between this grader config and your Arena votes — updates as you edit weights, no model calls.")}
      </h3>
      <div id="cal-metrics" class="cal-metrics" style="display:flex;flex-wrap:wrap;gap:18px;margin-bottom:14px;"></div>
      <div id="cal-bars" style="margin-bottom:14px;"></div>
      <div class="cal-actions" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
        <button type="button" id="cal-refit" class="btn-load">Re-fit weights ${info("Suggest weights that best reproduce your judgments — instant, no model calls.")}</button>
        <button type="button" id="cal-regrade" class="btn-load">Full re-grade ${info("Re-run the Layer 3 graders with this config — calls models, slow, blocking.")}</button>
        <button type="button" id="cal-history" class="btn-load">History ${info("Compare past grader configs by accuracy/κ and pick the best fit for your aim.")}</button>
        <span id="regrade-status" style="font-size:0.85rem;color:#636e72;"></span>
      </div>
      <div id="cal-refit-result" style="margin-top:12px;"></div>
      <div id="cal-history-result" style="margin-top:12px;"></div>
    </div>`;

  el.querySelector("#cal-refit").addEventListener("click", onRefit);
  el.querySelector("#cal-regrade").addEventListener("click", onRegrade);
  el.querySelector("#cal-history").addEventListener("click", onHistory);
}

function metricCard(label, value, tip) {
  return `<div style="min-width:120px;">
    <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:.04em;color:#636e72;display:flex;align-items:center;gap:4px;">${esc(label)}${info(tip)}</div>
    <div style="font-size:1.4rem;font-weight:800;color:#2d3436;">${value}</div>
  </div>`;
}

function renderMetrics(rep) {
  const m = panelEl().querySelector("#cal-metrics");
  if (!m) return;
  if (rep.error) {
    m.innerHTML = `<div style="color:#c0392b;">${esc(rep.error)}</div>`;
    panelEl().querySelector("#cal-bars").innerHTML = "";
    return;
  }
  m.innerHTML =
    metricCard("Pairwise accuracy", pct(rep.pairwise_acc), "Share of pairs where the grader's winner matches your human winner.") +
    metricCard("Cohen's κ", num(rep.cohen_kappa), "Agreement with you, corrected for chance (1 = perfect, 0 = random).") +
    metricCard("Spearman", num(rep.spearman), "Rank correlation between your scalar grades and grader overalls (needs ≥3 scored pairs).") +
    metricCard("n pairs", rep.n_pairs == null ? "—" : rep.n_pairs, "Number of decisive (left/right) human votes used for these metrics.");
  renderBars(rep.per_category || {});
}

function renderBars(perCat) {
  const wrap = panelEl().querySelector("#cal-bars");
  const keys = Object.keys(perCat);
  if (!keys.length) {
    wrap.innerHTML = "";
    return;
  }
  let html = `<div style="font-size:0.78rem;font-weight:700;color:#2d3436;margin-bottom:6px;display:flex;align-items:center;gap:4px;">Per-attribute alignment${info("How well each attribute's scores agree with your verdicts — fix low bars.")}</div>`;
  keys.forEach((k) => {
    const v = perCat[k];
    const w = v == null ? 0 : Math.max(0, Math.min(1, v)) * 100;
    const color = v == null ? "#b2bec3" : v >= 0.66 ? "#0f8f56" : v >= 0.5 ? "#e0a106" : "#c0392b";
    html += `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
      <div style="width:120px;font-size:0.8rem;color:#2d3436;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(k)}</div>
      <div style="flex:1;background:#e9ecef;border-radius:6px;height:14px;position:relative;">
        <div style="width:${w}%;background:${color};height:100%;border-radius:6px;"></div>
      </div>
      <div style="width:48px;text-align:right;font-size:0.8rem;font-weight:700;color:${color};">${v == null ? "—" : pct(v)}</div>
    </div>`;
  });
  wrap.innerHTML = html;
}

async function refresh() {
  try {
    const rep = await Api.report();
    renderMetrics(rep);
  } catch (e) {
    /* network error — leave previous state */
  }
}

function normKey(s) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function applyWeights(weights) {
  const rows = document.querySelectorAll("#keysBody tr");
  rows.forEach((row) => {
    const nameInput = row.querySelector(".key-name-input");
    const weightInput = row.querySelector(".key-weight-input");
    if (!nameInput || !weightInput) return;
    const key = normKey(nameInput.value);
    if (Object.prototype.hasOwnProperty.call(weights, key)) {
      weightInput.value = Math.round(weights[key] * 100);
      weightInput.dispatchEvent(new Event("input", { bubbles: true }));
      weightInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  if (typeof window.updateWeightTotal === "function") window.updateWeightTotal();
}

async function onRefit() {
  const out = panelEl().querySelector("#cal-refit-result");
  out.innerHTML = `<span style="color:#636e72;">Re-fitting…</span>`;
  let res;
  try {
    res = await Api.refit();
  } catch (e) {
    out.innerHTML = `<span style="color:#c0392b;">Re-fit failed.</span>`;
    return;
  }
  if (res.error) {
    out.innerHTML = `<span style="color:#c0392b;">${esc(res.error)}</span>`;
    return;
  }
  const list = Object.entries(res.weights)
    .map(([k, v]) => `<li>${esc(k)}: <strong>${Math.round(v * 100)}%</strong></li>`)
    .join("");
  out.innerHTML = `
    <div style="padding:12px;border-radius:10px;background:#fff;border:1px solid #e3e8ed;">
      <div style="font-weight:700;margin-bottom:6px;">Suggested weights ${info("Suggest weights that best reproduce your judgments — instant, no model calls.")}</div>
      <div style="font-size:0.85rem;color:#636e72;margin-bottom:6px;">projected accuracy ${pct(res.pairwise_acc)}, κ ${num(res.cohen_kappa)}</div>
      <ul style="margin:0 0 10px 18px;font-size:0.85rem;">${list}</ul>
      <button type="button" id="cal-apply" class="btn-load">Apply ${info("Fill the page's weight inputs with the suggestion; click the page's Save to persist.")}</button>
    </div>`;
  out.querySelector("#cal-apply").addEventListener("click", () => {
    applyWeights(res.weights);
    refresh();
    out.querySelector("#cal-apply").textContent = "Applied — now click Save";
  });
}

function setBusy(busy, statusText) {
  const el = panelEl();
  el.setAttribute("aria-busy", busy ? "true" : "false");
  el.querySelector("#cal-refit").disabled = busy;
  el.querySelector("#cal-regrade").disabled = busy;
  el.querySelector("#cal-history").disabled = busy;
  document.querySelectorAll(".key-weight-input").forEach((i) => (i.disabled = busy));
  const s = el.querySelector("#regrade-status");
  s.textContent = statusText || "";
  s.innerHTML = busy
    ? `<span class="cal-spinner" style="display:inline-block;width:12px;height:12px;border:2px solid #b2bec3;border-top-color:#667eea;border-radius:50%;animation:tooltipFadeIn 0s;"></span> ${esc(statusText || "")}`
    : esc(statusText || "");
}

async function onRegrade() {
  const sel = document.getElementById("settingSelector");
  const name = sel ? sel.value : "";
  const rep0 = await Api.report().catch(() => ({}));
  const n = rep0 && rep0.n_pairs != null ? rep0.n_pairs : "the";
  setBusy(true, `Re-grading ${n} pairs with ${name || "current"} config… this calls models and may take a while`);
  let res;
  try {
    res = await Api.regrade(name);
  } catch (e) {
    setBusy(false, "Re-grade failed (network).");
    return;
  }
  setBusy(false, "");
  if (res.error) {
    panelEl().querySelector("#regrade-status").textContent = res.error;
    return;
  }
  renderMetrics(res);
}

async function onHistory() {
  const out = panelEl().querySelector("#cal-history-result");
  out.innerHTML = `<span style="color:#636e72;">Loading history…</span>`;
  let rows;
  try {
    rows = await Api.history();
  } catch (e) {
    out.innerHTML = `<span style="color:#c0392b;">History failed.</span>`;
    return;
  }
  if (!Array.isArray(rows) || !rows.length) {
    out.innerHTML = `<span style="color:#636e72;">No calibration runs yet.</span>`;
    return;
  }
  const trs = rows
    .map(
      (r) => `<tr>
        <td style="padding:4px 8px;">${esc(r.created_at)}</td>
        <td style="padding:4px 8px;">${esc(r.grader_setting)}</td>
        <td style="padding:4px 8px;">${esc(r.tier)}</td>
        <td style="padding:4px 8px;text-align:right;">${r.pairwise_acc == null ? "—" : pct(r.pairwise_acc)}</td>
        <td style="padding:4px 8px;text-align:right;">${num(r.cohen_kappa)}</td>
        <td style="padding:4px 8px;text-align:right;">${r.n_pairs}</td>
      </tr>`
    )
    .join("");
  out.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.82rem;background:#fff;border:1px solid #e3e8ed;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#eef1f5;">
        <th style="padding:6px 8px;text-align:left;">When</th>
        <th style="padding:6px 8px;text-align:left;">Setting</th>
        <th style="padding:6px 8px;text-align:left;">Tier</th>
        <th style="padding:6px 8px;text-align:right;">Accuracy</th>
        <th style="padding:6px 8px;text-align:right;">κ</th>
        <th style="padding:6px 8px;text-align:right;">n</th>
      </tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
}

function bindWeightDelegation() {
  const body = document.getElementById("keysBody");
  if (!body) return;
  body.addEventListener("input", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("key-weight-input")) {
      refresh();
    }
  });
}

function start() {
  if (!panelEl()) return;
  buildShell();
  bindWeightDelegation();
  refresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
