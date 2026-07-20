/**
 * SF Symbols via Bloret Image Host: https://img.bloret.net/api/doc
 * GET /SF/{name}  — SVG; optional ?color= for tinted raster/SVG fill.
 */

export const SF_ICON_HOST = "https://img.bloret.net";
export const SF_ICON_BASE = `${SF_ICON_HOST}/SF`;

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

/**
 * Absolute URL for an SF icon.
 * Prefer CSS-mask usage (no color) so icons follow `currentColor` / theme.
 */
export function sfIconUrl(name: string, color?: string | null): string {
  const clean = normalizeSfName(name);
  if (!clean) return "";
  // encodeURI keeps dots; encode each path segment safely for odd names
  const path = clean
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const url = `${SF_ICON_BASE}/${path}`;
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
