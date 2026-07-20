/* Shared client helpers for Bloret Translation Collector */
window.BTC = {
  async json(url, options = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { res, data };
  },
  toast(type, message) {
    if (window.Blora?.toast) {
      window.Blora.toast({ type, message });
    } else {
      console.log(`[${type}] ${message}`);
    }
  },
  /**
   * Ring spinner markup from LoadingAnimationDesign.
   * @param {{ size?: 'sm'|'md'|''|'lg', label?: string|false, layout?: 'page'|'inline'|'row' }} [opts]
   * @returns {string} HTML
   */
  loadingHtml(opts = {}) {
    const size = opts.size || "";
    const label = opts.label === false ? "" : opts.label != null ? opts.label : "加载中...";
    const layout = opts.layout || "inline";
    const sizeClass = size ? ` ${size}` : "";
    const spinner = `<span class="loading-spinner${sizeClass}" aria-hidden="true"></span>`;
    if (layout === "page") {
      return `<div class="page-loading" role="status" aria-live="polite">${spinner}${
        label ? `<div>${escapeLoadingLabel(label)}</div>` : ""
      }</div>`;
    }
    if (layout === "row") {
      return `<div class="inline-loading inline-loading--row" role="status" aria-live="polite">${spinner}${
        label ? `<span>${escapeLoadingLabel(label)}</span>` : ""
      }</div>`;
    }
    return `<div class="inline-loading" role="status" aria-live="polite">${spinner}${
      label ? `<div>${escapeLoadingLabel(label)}</div>` : ""
    }</div>`;
  },
  /**
   * Put a button into busy state with ring spinner (or restore idle label).
   * @param {HTMLElement|null} btn
   * @param {boolean} busy
   * @param {{ busyLabel?: string, idleLabel?: string }} [opts]
   */
  setButtonBusy(btn, busy, opts = {}) {
    if (!btn) return;
    if (busy) {
      if (btn.dataset.btcIdleLabel == null) {
        btn.dataset.btcIdleLabel = btn.textContent || "";
      }
      const busyLabel = opts.busyLabel != null ? opts.busyLabel : "处理中...";
      btn.disabled = true;
      btn.classList.add("is-btc-busy");
      btn.setAttribute("aria-busy", "true");
      btn.innerHTML = `<span class="loading-spinner sm" aria-hidden="true"></span><span>${escapeLoadingLabel(
        busyLabel,
      )}</span>`;
    } else {
      const idle =
        opts.idleLabel != null
          ? opts.idleLabel
          : btn.dataset.btcIdleLabel != null
            ? btn.dataset.btcIdleLabel
            : btn.textContent;
      btn.disabled = false;
      btn.classList.remove("is-btc-busy");
      btn.removeAttribute("aria-busy");
      btn.textContent = idle;
      delete btn.dataset.btcIdleLabel;
    }
  },
  /** Match server slugify: non-Latin-only names get a fallback slug */
  toSlug(name, fallbackPrefix) {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    if (base.length >= 2) return base;
    const prefix = fallbackPrefix || "item";
    const suffix = Date.now().toString(36).slice(-6);
    return (prefix + "-" + suffix).slice(0, 48);
  },
  showError(el, message) {
    if (!el) {
      if (message) this.toast("error", message);
      return;
    }
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      /* ignore */
    }
    // Toast so feedback is visible even when the alert is off-screen (long settings forms).
    this.toast("error", message);
  },
};

function escapeLoadingLabel(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
