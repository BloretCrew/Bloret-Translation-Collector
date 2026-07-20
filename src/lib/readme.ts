import { marked } from "marked";

const MAX_BYTES = 512 * 1024;
/** Keep SSR unblocked when remote README is slow (was 8s). */
const FETCH_TIMEOUT_MS = 2_500;
const MAX_REDIRECTS = 3;
/** In-process cache so repeat visits / multi-tab don't re-fetch GitHub raw every time. */
const README_CACHE_TTL_MS = 5 * 60_000;
const README_CACHE_MAX = 64;

type CacheEntry = {
  expires: number;
  value: { ok: true; text: string } | { ok: false; error: string };
};

const readmeFetchCache = new Map<string, CacheEntry>();

export type ReadmeResolveInput = {
  readme?: string | null;
  readmeUrl?: string | null;
};

export type ReadmeView = {
  /** Sanitized HTML ready for EJS unescaped output */
  html: string | null;
  /** Which source was used */
  source: "url" | "inline" | "none";
  /** Remote URL when source is url or when fetch failed with fallback */
  url: string | null;
  /** Non-fatal message (e.g. fetch failed, fell back to inline) */
  warning: string | null;
};

/**
 * Resolve README for display: prefer remote URL when set, else inline Markdown.
 */
export async function resolveReadme(input: ReadmeResolveInput): Promise<ReadmeView> {
  const url = normalizeUrl(input.readmeUrl);
  const inline = (input.readme ?? "").trim();

  if (url) {
    const fetched = await fetchReadmeUrl(url);
    if (fetched.ok) {
      return {
        html: renderMarkdown(fetched.text),
        source: "url",
        url,
        warning: null,
      };
    }
    if (inline) {
      return {
        html: renderMarkdown(inline),
        source: "inline",
        url,
        warning: `无法加载 README URL：${fetched.error}，已显示本地内容。`,
      };
    }
    return {
      html: null,
      source: "none",
      url,
      warning: `无法加载 README URL：${fetched.error}`,
    };
  }

  if (inline) {
    return {
      html: renderMarkdown(inline),
      source: "inline",
      url: null,
      warning: null,
    };
  }

  return { html: null, source: "none", url: null, warning: null };
}

export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  // Block obvious private/local hosts for SSRF mitigation
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "metadata.google.internal"
  ) {
    return null;
  }
  return u.toString();
}

function getCachedReadme(url: string): CacheEntry["value"] | null {
  const hit = readmeFetchCache.get(url);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    readmeFetchCache.delete(url);
    return null;
  }
  return hit.value;
}

function setCachedReadme(url: string, value: CacheEntry["value"]) {
  if (readmeFetchCache.size >= README_CACHE_MAX) {
    const first = readmeFetchCache.keys().next().value;
    if (first) readmeFetchCache.delete(first);
  }
  readmeFetchCache.set(url, { expires: Date.now() + README_CACHE_TTL_MS, value });
}

export async function fetchReadmeUrl(
  url: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const cached = getCachedReadme(url);
  if (cached) return cached;

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/plain, text/markdown, text/*, */*",
          "User-Agent": "Bloret-Translation-Collector/1.0 (+readme)",
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "重定向缺少 Location" };
        const next = new URL(loc, current).toString();
        const safe = normalizeUrl(next);
        if (!safe) return { ok: false, error: "重定向目标不安全或非 HTTPS" };
        current = safe;
        continue;
      }

      if (!res.ok) {
        const fail = { ok: false as const, error: `HTTP ${res.status}` };
        // Cache short failures briefly to avoid stampede on bad URLs
        setCachedReadme(url, fail);
        return fail;
      }

      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (
        ctype &&
        !ctype.startsWith("text/") &&
        !ctype.includes("markdown") &&
        !ctype.includes("json") &&
        !ctype.includes("octet-stream")
      ) {
        return { ok: false, error: `不支持的 Content-Type: ${ctype.split(";")[0]}` };
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        return { ok: false, error: `文件超过 ${MAX_BYTES / 1024}KB` };
      }
      const ok = { ok: true as const, text: buf.toString("utf8") };
      setCachedReadme(url, ok);
      return ok;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        return { ok: false, error: "请求超时" };
      }
      return { ok: false, error: e instanceof Error ? e.message : "网络错误" };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: "重定向次数过多" };
}

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;
  return sanitizeHtml(raw);
}

/** Minimal allowlist sanitizer for Markdown HTML. */
export function sanitizeHtml(html: string): string {
  // Drop script/style/iframe/object/embed entirely
  let s = html
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select)[^>]*\/?\s*>/gi, "");

  // Strip event handlers and javascript: / data: urls in attributes
  s = s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(
    /(\s(?:href|src|xlink:href)\s*=\s*)(["'])\s*(javascript|vbscript|data)\s*:/gi,
    "$1$2#blocked:",
  );

  // Remove remaining tags not in allowlist (keep text)
  const allowed =
    /^(a|abbr|b|blockquote|br|code|del|em|h1|h2|h3|h4|h5|h6|hr|i|img|li|ol|p|pre|s|span|strong|sub|sup|table|tbody|td|th|thead|tr|ul|details|summary)$/i;

  s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, tag: string, attrs: string) => {
    if (!allowed.test(tag)) return "";
    const isClose = full.startsWith("</");
    if (isClose) return `</${tag.toLowerCase()}>`;

    const safeAttrs: string[] = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrs))) {
      const name = m[1]!.toLowerCase();
      const val = m[3] ?? m[4] ?? m[5] ?? "";
      if (tag.toLowerCase() === "a" && name === "href") {
        if (/^https?:\/\//i.test(val) || val.startsWith("/") || val.startsWith("#") || val.startsWith("mailto:")) {
          safeAttrs.push(`href="${escapeAttr(val)}"`, `rel="noopener noreferrer"`, `target="_blank"`);
        }
      } else if (tag.toLowerCase() === "img" && (name === "src" || name === "alt" || name === "title")) {
        if (name === "src" && !/^https?:\/\//i.test(val)) continue;
        safeAttrs.push(`${name}="${escapeAttr(val)}"`);
        if (name === "src") safeAttrs.push(`loading="lazy"`, `referrerpolicy="no-referrer"`);
      } else if (["title", "class", "id", "colspan", "rowspan", "align"].includes(name)) {
        safeAttrs.push(`${name}="${escapeAttr(val)}"`);
      }
    }
    const voidTags = new Set(["br", "hr", "img"]);
    const t = tag.toLowerCase();
    if (voidTags.has(t)) {
      return `<${t}${safeAttrs.length ? " " + safeAttrs.join(" ") : ""} />`;
    }
    return `<${t}${safeAttrs.length ? " " + safeAttrs.join(" ") : ""}>`;
  });

  return s;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Zod-friendly URL check for settings (empty allowed). */
export function isAllowedReadmeUrl(raw: string): boolean {
  return normalizeUrl(raw) !== null;
}
