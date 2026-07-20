import { jsonHandler } from "./json";
import { propertiesHandler } from "./properties";
import type { FormatHandler } from "./types";

const handlers: FormatHandler[] = [jsonHandler, propertiesHandler];

const byId = new Map(handlers.map((h) => [h.id, h]));
const byExt = new Map<string, FormatHandler>();
for (const h of handlers) {
  for (const ext of h.extensions) {
    byExt.set(ext.toLowerCase(), h);
  }
}

export function listFormatHandlers(): FormatHandler[] {
  return [...handlers];
}

export function getFormatHandler(id: string): FormatHandler | undefined {
  return byId.get(id);
}

export function getFormatByExtension(extOrPath: string): FormatHandler | undefined {
  const lower = extOrPath.toLowerCase();
  if (byExt.has(lower)) return byExt.get(lower);
  const m = lower.match(/(\.[a-z0-9]+)$/);
  if (m) return byExt.get(m[1]!);
  return undefined;
}

export function supportedExtensions(): string[] {
  return handlers.flatMap((h) => h.extensions);
}

export function acceptAttribute(): string {
  // e.g. .json,.properties,application/json
  const parts = new Set<string>();
  for (const h of handlers) {
    for (const ext of h.extensions) parts.add(ext);
    if (h.contentType.startsWith("application/json")) parts.add("application/json");
  }
  return [...parts].join(",");
}

/** Infer format from path; default json if ends with .json or unknown with json-like. */
export function inferFormatFromPath(path: string): FormatHandler {
  const h = getFormatByExtension(path);
  if (h) return h;
  return jsonHandler;
}
