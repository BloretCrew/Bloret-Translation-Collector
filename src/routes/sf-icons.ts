/**
 * Same-origin proxy for SF Symbols.
 * CSS mask-image cannot use cross-origin assets without CORS; img.bloret.net
 * does not send Access-Control-Allow-Origin, so we re-serve under /sf/*.
 */
import { Router, type Request, type Response } from "express";
import { SF_ICON_HOST, normalizeSfName } from "@/lib/sf-icon";
import { Logger } from "@/lib/logger";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 400;

type CacheEntry = {
  body: Buffer;
  contentType: string;
  etag?: string;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

/** Allow SF names like building.2, circle.lefthalf.filled, arrow.left */
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9._+-]*)*$/;

function cacheKey(name: string, color: string | null): string {
  return color ? `${name}?color=${color}` : name;
}

function touchCache(key: string, entry: CacheEntry) {
  if (cache.size >= CACHE_MAX && !cache.has(key)) {
    const first = cache.keys().next().value;
    if (first != null) cache.delete(first);
  }
  cache.set(key, entry);
}

function parseColor(raw: unknown): string | null {
  if (raw == null) return null;
  const c = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!c || c.length > 32) return null;
  // hex or simple css color tokens only
  if (!/^#?[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,20}$/.test(c)) return null;
  return c;
}

async function fetchUpstream(name: string, color: string | null): Promise<CacheEntry | null> {
  const path = name
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  let url = `${SF_ICON_HOST}/SF/${path}`;
  if (color) url += `?color=${encodeURIComponent(color)}`;

  const res = await fetch(url, {
    headers: { Accept: "image/svg+xml,image/*,*/*" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    Logger.warn(`SF proxy upstream ${res.status} for ${name}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > 512 * 1024) {
    Logger.warn(`SF proxy unexpected size ${buf.length} for ${name}`);
    return null;
  }
  const contentType = res.headers.get("content-type") || "image/svg+xml";
  const etag = res.headers.get("etag") || undefined;
  return {
    body: buf,
    contentType,
    etag,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

function sendIcon(res: Response, entry: CacheEntry, cacheHit: boolean) {
  res.setHeader("Content-Type", entry.contentType);
  res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  res.setHeader("X-SF-Cache", cacheHit ? "HIT" : "MISS");
  // Masks may still be treated as CORS-sensitive in some engines; same-origin + *
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (entry.etag) res.setHeader("ETag", entry.etag);
  res.status(200).send(entry.body);
}

export const sfIconsRouter = Router();

sfIconsRouter.get("/sf/*name", async (req: Request, res: Response) => {
  // Express 5 / path-to-regexp: splat may be string or string[]
  const rawParam = (req.params as { name?: string | string[] }).name;
  const raw = Array.isArray(rawParam) ? rawParam.join("/") : String(rawParam || "");
  const name = normalizeSfName(decodeURIComponent(raw));
  if (!name || !NAME_RE.test(name)) {
    return res.status(400).type("text").send("invalid icon name");
  }

  const color = parseColor(req.query.color);
  const key = cacheKey(name, color);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return sendIcon(res, hit, true);
  }

  try {
    const entry = await fetchUpstream(name, color);
    if (!entry) {
      return res.status(502).type("text").send("icon upstream failed");
    }
    touchCache(key, entry);
    return sendIcon(res, entry, false);
  } catch (err) {
    Logger.error(err instanceof Error ? err : String(err));
    if (hit) {
      // Stale fallback
      return sendIcon(res, hit, true);
    }
    return res.status(502).type("text").send("icon fetch error");
  }
});
