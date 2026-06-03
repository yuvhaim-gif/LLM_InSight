function esc(s) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(s == null ? "" : String(s)));
  return d.innerHTML;
}

function bandClass(band) {
  if (band === "GOLD") return "band-gold";
  if (band === "AUTO+") return "band-auto";
  return "band-review";
}

function clip(s, n) {
  s = s == null ? "" : String(s);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function passFilter(r, f, isJudge) {
  if (f.band && r.band !== f.band) return false;
  if (r.confidence < f.minconf) return false;
  if (isJudge && f.label) {
    if (f.label === "pass" && !r.label) return false;
    if (f.label === "fail" && r.label) return false;
  }
  return true;
}

function capPerPrompt(rows, cap) {
  if (!cap || cap <= 0) return rows;
  const seen = {};
  const out = [];
  rows
    .slice()
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .forEach((r) => {
      const n = seen[r.prompt] || 0;
      if (n >= cap) return;
      seen[r.prompt] = n + 1;
      out.push(r);
    });
  return out;
}

function classBalance(rows, cap) {
  if (!cap || cap <= 0) return rows;
  const counts = { true: 0, false: 0 };
  const out = [];
  rows.forEach((r) => {
    const key = r.label ? "true" : "false";
    if (counts[key] >= cap) return;
    counts[key] += 1;
    out.push(r);
  });
  return out;
}

export const Table = {
  lastRows: [],

  render(build, examples, target, filters) {
    const isJudge = target === "judge";
    const area = document.getElementById("table-area");
    if (isJudge) {
      this.renderJudge(examples, filters, area);
    } else {
      this.renderPairwise(build, filters, area);
    }
  },

  renderPairwise(build, f, area) {
    const all = []
      .concat((build.gold || []).map((r) => ({ ...r })))
      .concat((build.auto || []).map((r) => ({ ...r })))
      .concat((build.review || []).map((r) => ({ ...r })));
    let rows = all.filter((r) => passFilter(r, f, false));
    rows = capPerPrompt(rows, f.cap);
    this.lastRows = rows;

    const body = rows
      .map(
        (r) => `<tr class="${bandClass(r.band)}">
        <td><input type="checkbox" class="row-chk" data-pid="${esc(r.pair_id)}" data-band="${esc(r.band)}"></td>
        <td>${esc(clip(r.prompt, 80))}</td>
        <td>${esc(clip(r.chosen, 80))}</td>
        <td>${esc(clip(r.rejected, 80))}</td>
        <td>${esc(r.source)}</td>
        <td>${esc(r.band)}</td>
        <td>${esc(r.confidence)}</td>
      </tr>`
      )
      .join("");

    area.innerHTML = `
      <div class="ds-table-meta">Pairwise pools — showing ${rows.length} rows (κ = ${esc(build.kappa)})</div>
      <table class="ds-table">
        <thead><tr>
          <th></th><th>Prompt</th><th>Chosen</th><th>Rejected</th><th>Source</th><th>Band</th><th>Conf</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="7" class="muted">No rows.</td></tr>`}</tbody>
      </table>`;
  },

  renderJudge(examples, f, area) {
    let rows = (examples.examples || []).map((r) => ({ ...r })).filter((r) => passFilter(r, f, true));
    rows = capPerPrompt(rows, f.cap);
    rows = classBalance(rows, f.balance);
    this.lastRows = rows;

    const body = rows
      .map(
        (r) => `<tr class="${bandClass(r.band)}">
        <td><input type="checkbox" class="row-chk" data-pid="${esc(r.pair_id)}" data-band="${esc(r.band)}"></td>
        <td>${esc(clip(r.prompt, 90))}</td>
        <td>${esc(clip(r.answer, 90))}</td>
        <td>${r.label ? '<span class="pass">PASS</span>' : '<span class="fail">FAIL</span>'}</td>
        <td>${esc(r.source)}</td>
        <td>${esc(r.band)}</td>
        <td>${esc(r.confidence)}</td>
      </tr>`
      )
      .join("");

    const c = examples.counts || {};
    area.innerHTML = `
      <div class="ds-table-meta">Judge examples — showing ${rows.length} rows · PASS ${c.pass || 0} / FAIL ${c.fail || 0} (κ = ${esc(examples.kappa)})</div>
      <table class="ds-table">
        <thead><tr>
          <th></th><th>Prompt</th><th>Answer</th><th>Label</th><th>Source</th><th>Band</th><th>Conf</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="7" class="muted">No rows.</td></tr>`}</tbody>
      </table>`;
  },

  selectedReviewIds() {
    const ids = [];
    document.querySelectorAll(".row-chk").forEach((chk) => {
      if (chk.checked && chk.getAttribute("data-band") === "REVIEW") {
        ids.push(chk.getAttribute("data-pid"));
      }
    });
    if (ids.length) return ids;
    return this.lastRows.filter((r) => r.band === "REVIEW").map((r) => r.pair_id);
  },
};
