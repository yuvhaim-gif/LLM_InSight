import { S, esc } from "./state.js";
import { Api } from "./api.js";
import { Refine } from "./refine.js";

function el(id) {
  return document.getElementById(id);
}

function renderProgress(p) {
  if (!p) return;
  el("progress").textContent = `Annotated ${p.annotated} / ${p.total}`;
}

function gradesHtml(grades) {
  if (!grades) return "";
  return Object.entries(grades)
    .map(([k, v]) => `<span class="grade-chip">${esc(k)}: ${esc(v)}</span>`)
    .join(" ");
}

function revealBox(meta) {
  if (!meta) return "";
  return `<div><strong>${esc(meta.model || "?")}</strong> · overall ${esc(meta.overall)}</div>
    <div class="grades">${gradesHtml(meta.grades)}</div>
    <div class="muted">tag: ${esc(meta.tag || "")} · iter ${esc(meta.iteration)}</div>`;
}

export const Arena = {
  render(view) {
    if (!view || view.done) {
      S.current = null;
      el("prompt").textContent = "🎉 Queue complete — no more pairs. Scan again or pick another source.";
      el("left").textContent = "";
      el("right").textContent = "";
      el("reveal-left").style.display = "none";
      el("reveal-right").style.display = "none";
      if (view && view.progress) renderProgress(view.progress);
      return;
    }
    S.current = view;
    el("prompt").textContent = view.prompt;
    el("left").textContent = view.left_text;
    el("right").textContent = view.right_text;
    el("left_human").value = "";
    el("right_human").value = "";
    const showReveal = !S.blind;
    el("reveal-left").style.display = showReveal ? "block" : "none";
    el("reveal-right").style.display = showReveal ? "block" : "none";
    if (showReveal && view.reveal) {
      el("reveal-left").innerHTML = revealBox(view.reveal.left);
      el("reveal-right").innerHTML = revealBox(view.reveal.right);
    }
    renderProgress(view.progress);
  },

  showLastReveal(view) {
    if (!view || !view.reveal) {
      el("last-reveal").innerHTML = "";
      return;
    }
    el("last-reveal").innerHTML =
      `<div class="lr-title">Revealed:</div>
       <div class="lr-cols">
         <div><div class="lr-side">A</div>${revealBox(view.reveal.left)}</div>
         <div><div class="lr-side">B</div>${revealBox(view.reveal.right)}</div>
       </div>
       <div class="muted">disagreement: ${esc(view.reveal.disagreement)}</div>`;
  },

  scalar(side) {
    const v = parseFloat(el(side + "_human").value);
    return isNaN(v) ? null : v;
  },

  async vote(verdict) {
    if (!S.current) return;
    if (verdict === "both_bad") {
      Refine.open(S.current);
      return;
    }
    const voted = S.current;
    const res = await Api.vote({
      pair_id: voted.pair_id,
      verdict,
      display_swap: voted.display_swap,
      left_human: this.scalar("left"),
      right_human: this.scalar("right"),
    });
    this.showLastReveal(voted);
    this.render(res.next);
    refreshFitness();
  },

  async groundTruth() {
    if (!S.current) return;
    await Api.role(S.current.pair_id, "ground_truth");
    el("last-reveal").innerHTML = `<div class="lr-title">★ Pinned as ground truth.</div>`;
  },

  async advance() {
    const view = await Api.next();
    this.render(view);
  },
};

export async function refreshFitness() {
  try {
    const r = await Api.report();
    if (r.error) {
      el("fitness").textContent = "—";
      return;
    }
    const acc = r.pairwise_acc == null ? "—" : (Math.round(r.pairwise_acc * 1000) / 10).toFixed(1) + "%";
    const k = r.cohen_kappa == null ? "—" : (Math.round(r.cohen_kappa * 1000) / 1000).toFixed(3);
    el("fitness").innerHTML = `acc <strong>${acc}</strong> · κ <strong>${k}</strong> · n ${r.n_pairs ?? 0}`;
  } catch (e) {
    el("fitness").textContent = "—";
  }
}
