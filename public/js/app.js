/* Shared client helpers for Bloret Translation Collector */
window.BTC = {
  /** UI language (zh|en); hydrated from foot.ejs */
  lang: "zh",
  /** source-as-key catalog for current language */
  catalog: Object.create(null),
  /**
   * Client i18n. Falls back to Chinese source key.
   * @param {string} key
   * @param {Record<string, string|number>} [vars]
   */
  t(key, vars) {
    if (key == null || key === "") return key;
    const cat = this.catalog || Object.create(null);
    let out = cat[key];
    if (out == null || out === "") out = key;
    if (typeof out === "string" && out.startsWith("[EN] ")) out = out.slice(5);
    if (vars && typeof out === "string") {
      out = out.replace(/\{(\w+)\}/g, (_, k) =>
        vars[k] != null ? String(vars[k]) : `{${k}}`,
      );
    }
    return out;
  },
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
  * In-app confirm dialog (native confirm() is silently suppressed by some
  * browsers after repeated dialogs — "prevent this page from creating more
  * dialogs" — which made buttons appear dead).
  * @param {string} message
  * @param {{ okLabel?: string, cancelLabel?: string, danger?: boolean }} [opts]
  * @returns {Promise<boolean>} resolves true only when user clicks OK
  */
  confirm(message, opts = {}) {
  return new Promise((resolve) => {
    const doc = document;
    let overlay = doc.getElementById("btc-confirm-modal");
    if (overlay) overlay.remove();
    overlay = doc.createElement("div");
    overlay.id = "btc-confirm-modal";
    overlay.className = "blora-modal is-open";
    const okLabel = opts.okLabel || this.t("确定");
    const cancelLabel = opts.cancelLabel || this.t("取消");
    const esc = (s) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    overlay.innerHTML = `
      <div class="blora-modal__mask" data-btc-confirm-cancel></div>
      <div class="blora-modal__dialog" role="dialog" aria-modal="true" style="max-width: 400px;">
        <div class="blora-modal__body" style="padding: var(--blora-space-5) var(--blora-space-6);">
          <p class="blora-text" style="white-space: pre-line;">${esc(message)}</p>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 0.6em; padding: 0 var(--blora-space-6) var(--blora-space-5);">
          <button type="button" class="blora-btn blora-btn--ghost" data-btc-confirm-cancel>${esc(cancelLabel)}</button>
          <button type="button" class="blora-btn ${opts.danger === false ? "blora-btn--primary" : "blora-btn--danger"}" data-btc-confirm-ok>${esc(okLabel)}</button>
        </div>
      </div>`;
    const done = (val) => {
      overlay.remove();
      resolve(val);
    };
    overlay.addEventListener("click", (e) => {
      if (e.target.closest("[data-btc-confirm-ok]")) done(true);
      else if (e.target.closest("[data-btc-confirm-cancel]")) done(false);
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") done(false);
    });
    doc.body.appendChild(overlay);
    overlay.querySelector("[data-btc-confirm-ok]")?.focus();
  });
  },
  /**
   * Ring spinner markup from LoadingAnimationDesign.
   * @param {{ size?: 'sm'|'md'|''|'lg', label?: string|false, layout?: 'page'|'inline'|'row' }} [opts]
   * @returns {string} HTML
   */
  loadingHtml(opts = {}) {
    const size = opts.size || "";
    const label = opts.label === false ? "" : opts.label != null ? opts.label : BTC.t("加载中...");
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
      const busyLabel = opts.busyLabel != null ? opts.busyLabel : BTC.t("处理中...");
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

/** Keep color-scheme in sync for native form controls (select/input) in dark mode. */
function syncColorScheme() {
  const dark = document.documentElement.classList.contains("blora-dark");
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
document.documentElement.addEventListener("blora:appearancechange", syncColorScheme);
syncColorScheme();

/**
 * Theme toggle with SF icons (https://img.bloret.net/SF/…).
 * Uses data-blora-theme-toggle so we don't fight blora's data-blora-color-mode SVGs.
 */
function syncThemeToggleButtons() {
  const dark = document.documentElement.classList.contains("blora-dark");
  const lightLabel = BTC.t("切换至浅色");
  const darkLabel = BTC.t("切换至暗色");
  const iconHtml =
    typeof window.SfIcon !== "undefined"
      ? window.SfIcon.html(dark ? "sun.max" : "moon", { label: dark ? lightLabel : darkLabel })
      : "";
  document.querySelectorAll("[data-blora-theme-toggle]").forEach((btn) => {
    if (iconHtml) btn.innerHTML = iconHtml;
    btn.setAttribute("aria-label", dark ? lightLabel : darkLabel);
    btn.setAttribute("title", dark ? lightLabel : darkLabel);
  });
}

document.querySelectorAll("[data-blora-theme-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const dark = document.documentElement.classList.toggle("blora-dark");
    try {
      localStorage.setItem(
        (window.BloraConfig && window.BloraConfig.colorModeStorageKey) || "btc-theme",
        dark ? "dark" : "light",
      );
    } catch {
      /* ignore */
    }
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document.documentElement.dispatchEvent(
      new CustomEvent("blora:appearancechange", {
        bubbles: true,
        detail: { dark },
      }),
    );
    syncThemeToggleButtons();
  });
});
document.documentElement.addEventListener("blora:appearancechange", syncThemeToggleButtons);

(function hydrateI18n() {
  const boot = window.__BTC_I18N__;
  if (!boot) return;
  if (boot.lang) BTC.lang = boot.lang;
  if (boot.catalog && typeof boot.catalog === "object") {
    BTC.catalog = boot.catalog;
  }
})();
syncThemeToggleButtons();
