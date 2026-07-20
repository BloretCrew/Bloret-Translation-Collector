/**
 * Client helper for Bloret SF icon API (https://img.bloret.net/api/doc).
 * Prefer CSS-mask spans so icons follow currentColor / theme.
 */
(function () {
  const BASE = "https://img.bloret.net/SF";

  function normalize(name) {
    return String(name || "")
      .trim()
      .replace(/\.svg$/i, "");
  }

  function url(name, color) {
    const clean = normalize(name);
    if (!clean) return "";
    const path = clean
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    let u = BASE + "/" + path;
    if (color != null && String(color).trim() !== "") {
      u += "?color=" + encodeURIComponent(String(color).trim());
    }
    return u;
  }

  /**
   * @param {string} name
   * @param {{ className?: string, size?: string, label?: string, color?: string }} [opts]
   * @returns {string}
   */
  function html(name, opts) {
    opts = opts || {};
    const clean = normalize(name);
    if (!clean) return "";
    const u = url(clean, opts.color);
    const cls = ["sf-icon", opts.className].filter(Boolean).join(" ");
    const styles = ['--sf-url:url("' + u + '")'];
    if (opts.size) styles.push("--sf-size:" + opts.size);
    const style = styles.join(";");
    if (opts.label) {
      return (
        '<span class="' +
        cls +
        '" style="' +
        style +
        '" role="img" aria-label="' +
        String(opts.label).replace(/"/g, "&quot;") +
        '"></span>'
      );
    }
    return '<span class="' + cls + '" style="' + style + '" aria-hidden="true"></span>';
  }

  /**
   * @param {string} name
   * @param {{ className?: string, size?: string, label?: string, color?: string }} [opts]
   * @returns {HTMLElement|null}
   */
  function el(name, opts) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html(name, opts);
    return wrap.firstElementChild;
  }

  window.SfIcon = { BASE: BASE, url: url, html: html, el: el, normalize: normalize };
})();
