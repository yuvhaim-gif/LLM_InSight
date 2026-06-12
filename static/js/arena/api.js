async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("request failed: " + r.status);
  return r.json();
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error("request failed: " + r.status);
  return r.json();
}

export const Api = {
  sources: () => getJSON("/api/arena/sources"),
  meta: (file) => getJSON("/api/arena/source/meta?file=" + encodeURIComponent(file)),
  analyze: (file) => getJSON("/api/arena/source/analyze?file=" + encodeURIComponent(file)),
  forget: (file) => postJSON("/api/arena/source/forget", { file }),
  restore: (file) => postJSON("/api/arena/source/restore", { file }),
  scan: (s) => postJSON("/api/arena/scan", { source_kind: s.source_kind, source_ref: s.source_ref, pair_mode: s.pair_mode }),
  next: () => getJSON("/api/arena/next"),
  vote: (body) => postJSON("/api/arena/vote", body),
  refine: (body) => postJSON("/api/arena/refine", body),
  role: (pair_id, role) => postJSON("/api/arena/role", { pair_id, role }),
  report: () => getJSON("/api/calibrate/report"),
  conflicts: (source, version) =>
    getJSON("/api/arena/source/conflicts?source=" + encodeURIComponent(source) +
      (version ? "&version=" + encodeURIComponent(version) : "")),
  setGradingSelection: (source, version_id) =>
    postJSON("/api/arena/source/grading_selection", { source, version_id }),
  judgments: () => getJSON("/api/arena/judgments"),
};
