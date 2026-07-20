/**
 * SF Symbols via Bloret Image Host: https://img.bloret.net/api/doc
 * Upstream: GET /SF/{name}
 *
 * Icons used as CSS masks must be same-origin (mask-image is CORS-tainted
 * without Access-Control-Allow-Origin). We serve them under /sf/* via proxy.
 */

export const SF_ICON_HOST = "https://img.bloret.net";
/** Absolute upstream base (server-side fetch only). */
export const SF_ICON_UPSTREAM_BASE = `${SF_ICON_HOST}/SF`;
/** Public same-origin path used in HTML/CSS masks. */
export const SF_ICON_PUBLIC_BASE = "/sf";

/** @deprecated Use SF_ICON_PUBLIC_BASE or sfIconUrl(); kept for imports */
export const SF_ICON_BASE = SF_ICON_PUBLIC_BASE;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Normalize icon name (strip .svg, keep SF path segments). */
export function normalizeSfName(name: string): string {
  return String(name || "")
    .trim()
    .replace(/\.svg$/i, "");
}

function encodeSfPath(name: string): string {
  return name
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/**
 * Same-origin URL for an SF icon (CSS mask + currentColor).
 * Prefer this over the absolute img.bloret.net URL.
 */
export function sfIconUrl(name: string, color?: string | null): string {
  const clean = normalizeSfName(name);
  if (!clean) return "";
  const url = `${SF_ICON_PUBLIC_BASE}/${encodeSfPath(clean)}`;
  if (color != null && String(color).trim() !== "") {
    return `${url}?color=${encodeURIComponent(String(color).trim())}`;
  }
  return url;
}

/** Absolute upstream URL for server-side fetch / debugging. */
export function sfIconUpstreamUrl(name: string, color?: string | null): string {
  const clean = normalizeSfName(name);
  if (!clean) return "";
  const url = `${SF_ICON_UPSTREAM_BASE}/${encodeSfPath(clean)}`;
  if (color != null && String(color).trim() !== "") {
    return `${url}?color=${encodeURIComponent(String(color).trim())}`;
  }
  return url;
}

export type SfIconOptions = {
  /** Extra class names on the root span */
  className?: string;
  /** CSS size (e.g. "1.25em", "20px") — sets --sf-size */
  size?: string;
  /** Accessible label; omit for decorative icons (aria-hidden) */
  label?: string;
  /** Optional fixed fill color via API (breaks theme inheritance) */
  color?: string | null;
};

/**
 * Theme-aware icon HTML: CSS mask + currentColor.
 * Use with `<%- sfIcon('house') %>` (unescaped).
 */
export function sfIcon(name: string, opts: SfIconOptions = {}): string {
  const clean = normalizeSfName(name);
  if (!clean) return "";

  const url = sfIconUrl(clean, opts.color);
  const classes = ["sf-icon", opts.className].filter(Boolean).join(" ");
  const styles: string[] = [`--sf-url:url("${url}")`];
  if (opts.size) styles.push(`--sf-size:${opts.size}`);

  if (opts.label) {
    return `<span class="${escapeAttr(classes)}" style="${escapeAttr(styles.join(";"))}" role="img" aria-label="${escapeAttr(opts.label)}"></span>`;
  }
  return `<span class="${escapeAttr(classes)}" style="${escapeAttr(styles.join(";"))}" aria-hidden="true"></span>`;
}
