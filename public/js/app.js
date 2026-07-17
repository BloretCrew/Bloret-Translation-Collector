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
  toSlug(name) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
  },
  showError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  },
};
