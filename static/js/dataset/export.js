const FORMATS = {
  production: [
    ["preference", "preference — DPO / Reward (chosen vs rejected)"],
    ["sft", "sft — supervised fine-tune on good answers only"],
    ["kto", "kto — unpaired preference (good + bad)"],
  ],
  judge: [
    ["preference", "preference — reward model for the judge"],
    ["judge_cls", "judge_cls — binary PASS/FAIL classifier"],
    ["judge_gen", "judge_gen — generative PASS/FAIL judge"],
  ],
};

const PAIRWISE = new Set(["preference"]);

export const Export = {
  _sources: () => [],
  _target: () => "production",

  init(getSources, getTarget) {
    this._sources = getSources;
    this._target = getTarget;
    document.getElementById("ex-preview").addEventListener("click", () => this.preview());
    document.getElementById("ex-download").addEventListener("click", () => this.download());
    document.getElementById("ex-format").addEventListener("change", () => this.syncFormatUI());
  },

  refreshFormats() {
    const target = this._target();
    const sel = document.getElementById("ex-format");
    const prev = sel.value;
    const opts = FORMATS[target] || FORMATS.production;
    sel.innerHTML = opts.map(([v, label]) => `<option value="${v}">${label}</option>`).join("");
    if (opts.some(([v]) => v === prev)) sel.value = prev;
    this.syncFormatUI();
  },

  syncFormatUI() {
    const fmt = document.getElementById("ex-format").value;
    const pairwise = PAIRWISE.has(fmt);
    document.querySelectorAll(".pools-only").forEach((e) => {
      e.style.display = pairwise ? "" : "none";
    });
  },

  _query() {
    const fmt = document.getElementById("ex-format").value;
    const params = new URLSearchParams();
    params.set("format", fmt);
    if (document.getElementById("ex-conv").checked) params.set("conversational", "1");
    params.set("min_conf", document.getElementById("ex-minconf").value || "0");
    params.set("split", document.getElementById("ex-split").value || "0");
    const sources = this._sources();
    if (sources.length) params.set("sources", sources.join(","));
    if (PAIRWISE.has(fmt)) {
      const pools = Array.from(document.getElementById("ex-pools").selectedOptions).map((o) => o.value);
      if (pools.length) params.set("pools", pools.join(","));
    } else if (this._target() === "judge") {
      const lbl = document.getElementById("f-label").value;
      if (lbl) params.set("label", lbl);
    }
    return params.toString();
  },

  async preview() {
    const out = document.getElementById("ex-preview-out");
    out.textContent = "Loading preview…";
    try {
      const r = await fetch("/api/dataset/export/preview?n=10&" + this._query());
      const data = await r.json();
      out.textContent = (Array.isArray(data) ? data : [data])
        .map((row) => JSON.stringify(row))
        .join("\n");
      if (!out.textContent) out.textContent = "(no rows)";
    } catch (e) {
      out.textContent = "Preview failed.";
    }
  },

  download() {
    window.location = "/api/dataset/export?" + this._query();
  },
};
