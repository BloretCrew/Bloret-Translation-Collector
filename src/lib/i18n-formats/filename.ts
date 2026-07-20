/**
 * Derive export path from original source path and locale.
 */
export function localeSuffixPath(path: string, locale: string): string {
  const m = path.match(/^(.*?)(\.[^./]+)$/);
  if (!m) return `${path}.${locale}`;
  const base = m[1]!;
  const ext = m[2]!;
  // avoid double-suffix if already ends with .locale
  if (base.endsWith(`.${locale}`)) return path;
  return `${base}.${locale}${ext}`;
}

export function basenamePath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}
