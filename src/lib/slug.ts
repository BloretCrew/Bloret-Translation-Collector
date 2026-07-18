/**
 * Produce a URL-safe slug. Non-Latin-only input falls back to a short unique id
 * so create-org/project never auto-fills an empty slug.
 */
export function slugify(input: string, fallbackPrefix = "item"): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  if (base.length >= 2) return base;

  // Empty or too short after stripping (e.g. Chinese-only names)
  const suffix = Date.now().toString(36).slice(-6);
  return `${fallbackPrefix}-${suffix}`.slice(0, 48);
}
