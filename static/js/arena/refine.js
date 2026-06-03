import { esc } from "./state.js";
import { Api } from "./api.js";

function el(id) {
  return document.getElementById(id);
}

export const Refine = {
  _pair: null,

  open(pair) {
    this._pair = pair;
    el("refine-prompt").textContent = pair.prompt;
    el("gold").value = "";
    el("blacklist_losers").checked = false;
    el("refineModal").classList.add("active");
    setTimeout(() => el("gold").focus(), 0);
  },

  close() {
    this._pair = null;
    el("refineModal").classList.remove("active");
  },

  async save() {
    if (!this._pair) return null;
    const res = await Api.refine({
      pair_id: this._pair.pair_id,
      gold_text: el("gold").value,
      blacklist_losers: el("blacklist_losers").checked,
    });
    this.close();
    return res;
  },

  bind(onSaved) {
    el("refine-save").addEventListener("click", async () => {
      const res = await this.save();
      if (res && onSaved) onSaved(res);
    });
    el("refine-cancel").addEventListener("click", () => this.close());
    el("refineModal").addEventListener("click", (e) => {
      if (e.target === el("refineModal")) this.close();
    });
  },
};

export function refinePromptText(pair) {
  return esc(pair ? pair.prompt : "");
}
