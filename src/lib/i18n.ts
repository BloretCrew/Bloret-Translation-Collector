/**
 * Bloret Translation Collector UI i18n
 * 语言文件：lang/zh.json、lang/en.json、lang/ru.json（source-as-key，中文原文为 key）
 *
 * 可选：config.uiI18n.enabled 时，通过公开 Manifest + Translated 接口拉取
 * 实时译文并覆盖磁盘目录（见 src/lib/ui-i18n-live.ts）。
 *
 * 用法：
 *   import { t, i18nMiddleware, htmlLang } from '@/lib/i18n';
 *   app.use(i18nMiddleware());
 *   // 路由 / EJS：res.locals.t('登录') 或 t('登录')
 *   // 指定语言：t('登录', 'en') / t('你好 {name}', { name: 'A' })
 */
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import {
  ensureLiveCatalog,
  getCachedLiveCatalog,
  mergeCatalogs,
} from "@/lib/ui-i18n-live";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** dev: src/lib → ../../lang；bundle: dist/server.mjs → ../lang；兜底 cwd/lang */
function resolveLangDir(): string {
  const candidates = [
    path.join(__dirname, "../../lang"),
    path.join(__dirname, "../lang"),
    path.join(process.cwd(), "lang"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "zh.json"))) return dir;
  }
  return candidates[0]!;
}

export const LANG_DIR = resolveLangDir();

export const SUPPORTED = ["zh", "en", "ru"] as const;
export type LangCode = (typeof SUPPORTED)[number];
export const DEFAULT_LANG: LangCode = "zh";
export const LANG_COOKIE = "btc_lang";

type Catalog = Record<string, string>;
type Vars = Record<string, string | number>;

const als = new AsyncLocalStorage<{ lang: LangCode }>();
/** Disk-only catalogs (boot / reload). Live overlays applied in getCatalog. */
const diskCatalogs: Record<string, Catalog> = {};

function isLang(code: string): code is LangCode {
  return (SUPPORTED as readonly string[]).includes(code);
}

function loadCatalog(lang: string): Catalog {
  const file = path.join(LANG_DIR, `${lang}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`[i18n] missing lang file: ${file}`);
    return {};
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Catalog = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch (e) {
    console.error(`[i18n] failed to load ${file}:`, e instanceof Error ? e.message : e);
    return {};
  }
}

export function reload(): void {
  for (const lang of SUPPORTED) {
    diskCatalogs[lang] = loadCatalog(lang);
  }
}

reload();

export function detectLang(req: {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): LangCode {
  const q = req.query?.lang ?? req.query?.locale;
  if (typeof q === "string" && q) {
    const code = q.toLowerCase().slice(0, 2);
    if (isLang(code)) return code;
  }

  const cookieHeader = req.headers?.cookie;
  if (typeof cookieHeader === "string") {
    const m = new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([a-zA-Z\\-]+)`).exec(cookieHeader);
    if (m) {
      const c = m[1].toLowerCase().slice(0, 2);
      if (isLang(c)) return c;
    }
  }

  const al = req.headers?.["accept-language"];
  if (typeof al === "string") {
    for (const part of al.split(",")) {
      const code = part.trim().split(";")[0]?.trim().toLowerCase().slice(0, 2);
      if (code && isLang(code)) return code;
    }
  }

  return DEFAULT_LANG;
}

function catalogFor(lang: LangCode): Catalog {
  const disk = diskCatalogs[lang] || diskCatalogs[DEFAULT_LANG] || {};
  if (lang === "zh") return disk;
  const live = getCachedLiveCatalog(lang);
  return mergeCatalogs(disk, live);
}

export function translate(key: string, lang?: string, vars?: Vars): string {
  if (key == null || key === "") return key;
  const L: LangCode = lang && isLang(lang) ? lang : DEFAULT_LANG;
  const catalog = catalogFor(L);
  let out = catalog[key];
  if (out == null) {
    out = (diskCatalogs[DEFAULT_LANG] && diskCatalogs[DEFAULT_LANG][key]) || key;
  }
  if (typeof out === "string" && out.startsWith("[EN] ")) {
    out = out.slice(5);
  }
  if (vars && typeof out === "string") {
    out = out.replace(/\{(\w+)\}/g, (_, k: string) =>
      vars[k] != null ? String(vars[k]) : `{${k}}`,
    );
  }
  return out;
}

export function currentLang(): LangCode {
  const store = als.getStore();
  if (store?.lang) return store.lang;
  return DEFAULT_LANG;
}

/** HTML <html lang="..."> 值 */
export function htmlLang(lang?: string): string {
  const L = (lang as LangCode) || currentLang();
  if (L === "zh") return "zh-CN";
  if (L === "en") return "en";
  if (L === "ru") return "ru";
  return L;
}

/**
 * t('登录')
 * t('登录', 'en')
 * t('你好 {name}', { name: 'A' })
 * t('你好 {name}', 'en', { name: 'A' })
 */
export function t(key: string, langOrVars?: string | Vars, vars?: Vars): string {
  if (typeof langOrVars === "string" && isLang(langOrVars)) {
    return translate(key, langOrVars, vars);
  }
  if (langOrVars && typeof langOrVars === "object") {
    return translate(key, currentLang(), langOrVars);
  }
  return translate(key, currentLang(), vars);
}

export function getCatalog(lang?: string): Catalog {
  const L = lang && isLang(lang) ? lang : currentLang();
  return catalogFor(L);
}

export function getCatalogs(): Record<string, Catalog> {
  const out: Record<string, Catalog> = {};
  for (const lang of SUPPORTED) {
    out[lang] = catalogFor(lang);
  }
  return out;
}

/** Disk catalogs only (no live merge) — useful for tests. */
export function getDiskCatalog(lang?: string): Catalog {
  const L = lang && isLang(lang) ? lang : currentLang();
  return diskCatalogs[L] || diskCatalogs[DEFAULT_LANG] || {};
}

declare global {
  namespace Express {
    interface Request {
      lang: LangCode;
      t: (key: string, vars?: Vars) => string;
      htmlLang: string;
    }
  }
}

export type I18nMiddlewareOptions = {
  cookieMaxAge?: number;
};

/**
 * Express 中间件：req.lang / req.t / res.locals.t，?lang= 写 cookie。
 * 若启用 uiI18n，在进入路由前异步刷新当前语言的 live catalog（带 TTL 缓存）。
 */
export function i18nMiddleware(options: I18nMiddlewareOptions = {}) {
  const cookieMaxAge = options.cookieMaxAge ?? 365 * 24 * 3600;
  return function middleware(req: Request, res: Response, next: NextFunction) {
    const q = req.query?.lang ?? req.query?.locale;
    let setCookie: string | null = null;
    if (typeof q === "string" && q) {
      const code = q.toLowerCase().slice(0, 2);
      if (isLang(code)) {
        setCookie = `${LANG_COOKIE}=${code}; Path=/; Max-Age=${cookieMaxAge}; SameSite=Lax`;
      }
    }

    const lang = detectLang(req);

    const finish = () => {
      req.lang = lang;
      req.t = (key: string, vars?: Vars) => translate(key, lang, vars);
      req.htmlLang = htmlLang(lang);

      res.locals.lang = lang;
      res.locals.htmlLang = req.htmlLang;
      res.locals.t = req.t;
      res.locals.SUPPORTED_LANGS = SUPPORTED;
      res.locals.i18nCatalog = getCatalog(lang);

      if (setCookie) {
        const prev = res.getHeader("Set-Cookie");
        if (!prev) res.setHeader("Set-Cookie", setCookie);
        else if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, setCookie]);
        else res.setHeader("Set-Cookie", [String(prev), setCookie]);
      }

      als.run({ lang }, () => next());
    };

    // Skip live refresh for pure static/health noise? Still cheap with cache.
    // Avoid recursive self-fetch storms on the live i18n endpoints themselves.
    const p = req.path || "";
    const skipLive =
      p.includes("/translated") ||
      p.endsWith("/manifest") ||
      p === "/api/health" ||
      p.startsWith("/api/health");

    if (skipLive || lang === "zh") {
      finish();
      return;
    }

    void ensureLiveCatalog(lang)
      .catch(() => null)
      .then(() => finish());
  };
}
