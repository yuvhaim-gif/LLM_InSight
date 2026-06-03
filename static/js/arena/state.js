export const S = {
  source_kind: "live",
  source_ref: "live_ledger",
  pair_mode: "same_iter",
  blind: true,
  current: null,
};

export function esc(s) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(s == null ? "" : String(s)));
  return d.innerHTML;
}
