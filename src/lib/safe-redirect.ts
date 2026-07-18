/**
 * Allow only same-origin relative paths for post-login redirects.
 * Blocks open redirects like //evil.com or https://evil.com
 */
export function safeInternalPath(raw: unknown, fallback = "/app"): string {
  if (typeof raw !== "string" || !raw) return fallback;
  const path = raw.trim();
  // Must be a relative path on this host
  if (!path.startsWith("/")) return fallback;
  // Protocol-relative //evil.com
  if (path.startsWith("//")) return fallback;
  // Backslash tricks
  if (path.includes("\\")) return fallback;
  // Reject embedded schemes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return fallback;
  // Cap length
  if (path.length > 512) return fallback;
  return path;
}
