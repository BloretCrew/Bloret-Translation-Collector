/**
 * Live UI catalogs from the public Manifest + Translated-file APIs.
 *
 * When enabled (config.uiI18n), merges live translations over disk catalogs so
 * this site dogfoods the same endpoints third parties use.
 *
 * Flow:
 *   1. GET .../manifest  — confirm project is public / warm metadata
 *   2. GET .../files/{fileId}/translated?locale=… — raw catalog JSON body
 *   3. Cache in memory for cacheTtlMs; on failure keep last good / disk
 */
import { loadConfig, publicBaseUrl, type AppConfig } from "@/lib/config";
import { Logger } from "@/lib/logger";

/** UI lang codes that can be overlaid by live catalogs (mirrors i18n SUPPORTED). */
type LangCode = "zh" | "en" | "ru";

export type Catalog = Record<string, string>;

type CacheEntry = {
  catalog: Catalog;
  fetchedAt: number;
  source: "live" | "stale";
};

const cache = new Map<string, CacheEntry>();
/** In-flight fetches so concurrent requests share one HTTP round-trip. */
const inflight = new Map<string, Promise<Catalog | null>>();

let lastManifestOkAt = 0;
let lastManifestError: string | null = null;

function uiI18nConfig(): AppConfig["uiI18n"] {
  return loadConfig().uiI18n;
}

function cacheKey(uiLang: string, projectLocale: string): string {
  const c = uiI18nConfig();
  return `${c.orgSlug}/${c.projectSlug}/${c.fileId}/${uiLang}->${projectLocale}`;
}

function apiBase(): string {
  const c = uiI18nConfig();
  const raw = (c.baseUrl || publicBaseUrl() || "").replace(/\/$/, "");
  return raw || "http://127.0.0.1:3000";
}

function asCatalog(raw: unknown): Catalog | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Catalog = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Step 1 of the public API pair: project manifest.
 * Used to validate the live source is reachable; result is not required for
 * catalog merge (locale map comes from config).
 */
export async function fetchUiI18nManifest(): Promise<{
  ok: boolean;
  lang?: Record<string, unknown>;
  error?: string;
}> {
  const c = uiI18nConfig();
  if (!c.enabled) return { ok: false, error: "disabled" };
  const url = `${apiBase()}/api/v1/orgs/${encodeURIComponent(c.orgSlug)}/projects/${encodeURIComponent(c.projectSlug)}/manifest`;
  try {
    const data = (await fetchJson(url, c.timeoutMs)) as {
      lang?: Record<string, unknown>;
    };
    lastManifestOkAt = Date.now();
    lastManifestError = null;
    return { ok: true, lang: data.lang };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    lastManifestError = msg;
    Logger.warn(`[ui-i18n] manifest failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Step 2: real-time translated file body for one UI language.
 */
export async function fetchLiveCatalog(
  uiLang: LangCode,
): Promise<Catalog | null> {
  const c = uiI18nConfig();
  if (!c.enabled) return null;
  if (uiLang === "zh") return null; // source keys; disk zh.json is identity

  const projectLocale = c.localeMap[uiLang];
  if (!projectLocale) return null;

  const key = cacheKey(uiLang, projectLocale);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < c.cacheTtlMs) {
    return hit.catalog;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<Catalog | null> => {
    // Warm / validate via manifest occasionally (same API pair the docs recommend).
    if (!lastManifestOkAt || now - lastManifestOkAt > c.cacheTtlMs) {
      await fetchUiI18nManifest();
    }

    const q = new URLSearchParams({
      locale: projectLocale,
      mode: c.mode,
    });
    if (c.fallbackMt) q.set("fallbackMt", "1");

    const url =
      `${apiBase()}/api/v1/orgs/${encodeURIComponent(c.orgSlug)}` +
      `/projects/${encodeURIComponent(c.projectSlug)}` +
      `/files/${encodeURIComponent(c.fileId)}/translated?${q.toString()}`;

    try {
      const raw = await fetchJson(url, c.timeoutMs);
      const catalog = asCatalog(raw);
      if (!catalog || Object.keys(catalog).length === 0) {
        throw new Error("empty or invalid catalog body");
      }
      cache.set(key, { catalog, fetchedAt: Date.now(), source: "live" });
      Logger.info(
        `[ui-i18n] live catalog ${uiLang}←${projectLocale}: ${Object.keys(catalog).length} keys`,
      );
      return catalog;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.warn(`[ui-i18n] translated fetch failed (${uiLang}): ${msg}`);
      // Stale-while-error: keep serving last good live catalog if any.
      if (hit) {
        cache.set(key, { ...hit, source: "stale" });
        return hit.catalog;
      }
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Merge live over disk. Live wins for non-empty string values; disk fills gaps.
 */
export function mergeCatalogs(disk: Catalog, live: Catalog | null | undefined): Catalog {
  if (!live || Object.keys(live).length === 0) return disk;
  const out: Catalog = { ...disk };
  for (const [k, v] of Object.entries(live)) {
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

/** Ensure live catalog is warm for this UI lang (no-op if disabled / zh / fresh). */
export async function ensureLiveCatalog(uiLang: LangCode): Promise<Catalog | null> {
  const c = uiI18nConfig();
  if (!c.enabled || uiLang === "zh") return null;
  return fetchLiveCatalog(uiLang);
}

export function getCachedLiveCatalog(uiLang: LangCode): Catalog | null {
  const c = uiI18nConfig();
  if (!c.enabled || uiLang === "zh") return null;
  const projectLocale = c.localeMap[uiLang];
  if (!projectLocale) return null;
  return cache.get(cacheKey(uiLang, projectLocale))?.catalog ?? null;
}

export function liveI18nStatus(): {
  enabled: boolean;
  lastManifestOkAt: number;
  lastManifestError: string | null;
  cacheSize: number;
} {
  return {
    enabled: uiI18nConfig().enabled,
    lastManifestOkAt,
    lastManifestError,
    cacheSize: cache.size,
  };
}

/** Test helper */
export function _resetLiveI18nCacheForTests(): void {
  cache.clear();
  inflight.clear();
  lastManifestOkAt = 0;
  lastManifestError = null;
}
