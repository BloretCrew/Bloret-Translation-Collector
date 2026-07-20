import {
  exportWithStructure,
  flattenJson,
  parseJsonFile,
} from "@/lib/json-i18n";
import type { FormatHandler, FormatMeta, ParseResult } from "./types";
import { defaultFormatMeta } from "./types";

/**
 * Detect JSON pretty-print style from original file text.
 */
export function detectJsonFormatMeta(content: string): FormatMeta {
  let text = content;
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }

  const newline: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\r?\n$/.test(text);
  const indent = detectIndent(text);

  return { indent, trailingNewline, newline, bom };
}

function detectIndent(text: string): number | string {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^(\t+)/);
    if (m) return "\t";
    const spaces = line.match(/^( +)\S/);
    if (spaces) {
      const n = spaces[1]!.length;
      if (n === 2 || n === 4 || n === 8) return n;
      if (n > 0) return n;
    }
  }
  if (!text.includes("\n") || /^\{[^\n]*\}$/.test(text.trim())) {
    return 0;
  }
  return 2;
}

/**
 * Coerce format_meta.indent from DB/jsonb into a value JSON.stringify accepts.
 * String "2" must become number 2 — otherwise stringify uses "2" as the indent
 * *character* and corrupts the file (inserts digits into the document).
 */
export function normalizeJsonIndent(indent: unknown): number | string {
  if (indent === "\t" || indent === "\\t") return "\t";
  if (indent === 0 || indent === "0" || indent === "" || indent === false) return 0;
  if (typeof indent === "number" && Number.isFinite(indent)) {
    const n = Math.floor(indent);
    if (n <= 0) return 0;
    return Math.min(10, n);
  }
  if (typeof indent === "string" && /^\d+$/.test(indent.trim())) {
    const n = parseInt(indent.trim(), 10);
    if (n <= 0) return 0;
    return Math.min(10, n);
  }
  return 2;
}

/**
 * Serialize JSON using detected style (indent, newline, trailing NL, BOM).
 * Fallback path when raw-preserving patch is unavailable.
 */
export function serializeJson(data: unknown, meta?: FormatMeta | null): string {
  const m = meta ?? defaultFormatMeta();
  const indent = normalizeJsonIndent(m.indent);
  let body =
    indent === 0 ? JSON.stringify(data) : JSON.stringify(data, null, indent);

  const nl = m.newline ?? "\n";
  if (nl === "\r\n") {
    body = body.replace(/\n/g, "\r\n");
  }

  const wantsTrail = m.trailingNewline !== false;
  const endsWithNl = body.endsWith("\n") || body.endsWith("\r\n");
  if (wantsTrail && !endsWithNl) {
    body += nl;
  } else if (!wantsTrail && endsWithNl) {
    body = body.replace(/(?:\r?\n)+$/, "");
  }

  if (m.bom) {
    body = "\uFEFF" + body;
  }
  return body;
}

/**
 * Read a JSON string token starting at `start` (must be `"`).
 * Returns end index (after closing quote), raw token (with quotes), and decoded value.
 */
export function readJsonStringToken(
  source: string,
  start: number,
): { end: number; raw: string; value: string } {
  if (source[start] !== '"') {
    throw new Error(`Expected string at ${start}`);
  }
  let i = start + 1;
  while (i < source.length) {
    const c = source[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === '"') {
      const raw = source.slice(start, i + 1);
      return { end: i + 1, raw, value: JSON.parse(raw) as string };
    }
    i++;
  }
  throw new Error("Unterminated JSON string");
}

function skipWs(source: string, i: number): number {
  while (i < source.length) {
    const c = source[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    break;
  }
  return i;
}

/**
 * Patch only string *values* inside the original JSON text.
 * Everything else (whitespace, key order, non-string leaves, trailing commas
 * are not present after parse so N/A) is copied byte-for-byte from `source`.
 *
 * Key paths match flattenJson / exportWithStructure (dot-joined object keys).
 * Array elements are left untouched (not extracted as units on import).
 *
 * @returns patched text, or null if the source could not be walked safely
 */
export function patchJsonStringValues(
  source: string,
  /**
   * Return the new decoded string for this key path, or `null` to keep original.
   */
  resolve: (keyPath: string, original: string) => string | null,
): string | null {
  try {
    const out: string[] = [];
    let last = 0;
    let i = skipWs(source, 0);

    function copyTo(end: number) {
      if (end > last) {
        out.push(source.slice(last, end));
        last = end;
      }
    }

    function emitReplacedString(start: number, end: number, newValue: string) {
      copyTo(start);
      out.push(JSON.stringify(newValue));
      last = end;
    }

    function parseValue(path: string): void {
      i = skipWs(source, i);
      const c = source[i];
      if (c === undefined) throw new Error("Unexpected end");

      if (c === "{") {
        parseObject(path);
        return;
      }
      if (c === "[") {
        parseArray(path);
        return;
      }
      if (c === '"') {
        const tok = readJsonStringToken(source, i);
        // Object-property string leaves only (path set from parent key)
        if (path) {
          const next = resolve(path, tok.value);
          if (next !== null) {
            emitReplacedString(i, tok.end, next);
          }
        }
        i = tok.end;
        return;
      }
      // number / true / false / null — leave as-is, advance
      if (c === "-" || (c >= "0" && c <= "9")) {
        i++;
        while (i < source.length && /[0-9eE+.\-]/.test(source[i]!)) i++;
        return;
      }
      if (source.startsWith("true", i)) {
        i += 4;
        return;
      }
      if (source.startsWith("false", i)) {
        i += 5;
        return;
      }
      if (source.startsWith("null", i)) {
        i += 4;
        return;
      }
      throw new Error(`Unexpected token at ${i}: ${c}`);
    }

    function parseObject(parentPath: string): void {
      // source[i] === '{'
      i++;
      i = skipWs(source, i);
      if (source[i] === "}") {
        i++;
        return;
      }
      while (i < source.length) {
        i = skipWs(source, i);
        if (source[i] !== '"') throw new Error(`Expected property name at ${i}`);
        const keyTok = readJsonStringToken(source, i);
        i = keyTok.end;
        i = skipWs(source, i);
        if (source[i] !== ":") throw new Error(`Expected ':' at ${i}`);
        i++;
        const childPath = parentPath ? `${parentPath}.${keyTok.value}` : keyTok.value;
        parseValue(childPath);
        i = skipWs(source, i);
        if (source[i] === ",") {
          i++;
          i = skipWs(source, i);
          if (source[i] === "}") {
            i++;
            return;
          }
          continue;
        }
        if (source[i] === "}") {
          i++;
          return;
        }
        throw new Error(`Expected ',' or '}' at ${i}`);
      }
    }

    function parseArray(parentPath: string): void {
      // source[i] === '['
      // Array string elements are not translation units (matches flattenJson).
      // Nested objects still get property paths under index segments.
      i++;
      i = skipWs(source, i);
      if (source[i] === "]") {
        i++;
        return;
      }
      let index = 0;
      while (i < source.length) {
        const childPath = parentPath ? `${parentPath}.${index}` : String(index);
        i = skipWs(source, i);
        const c = source[i];
        if (c === "{") {
          parseObject(childPath);
        } else if (c === "[") {
          parseArray(childPath);
        } else if (c === '"') {
          const tok = readJsonStringToken(source, i);
          i = tok.end;
        } else if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) {
          i++;
          while (i < source.length && /[0-9eE+.\-]/.test(source[i]!)) i++;
        } else if (source.startsWith("true", i)) {
          i += 4;
        } else if (source.startsWith("false", i)) {
          i += 5;
        } else if (source.startsWith("null", i)) {
          i += 4;
        } else {
          throw new Error(`Unexpected token in array at ${i}`);
        }
        index++;
        i = skipWs(source, i);
        if (source[i] === ",") {
          i++;
          continue;
        }
        if (source[i] === "]") {
          i++;
          return;
        }
        throw new Error(`Expected ',' or ']' at ${i}`);
      }
    }

    // Root must be object for i18n files
    if (source[i] !== "{") {
      return null;
    }
    parseObject("");
    i = skipWs(source, i);
    // Copy any trailing whitespace / newline after root
    copyTo(source.length);
    return out.join("");
  } catch {
    return null;
  }
}

/**
 * Decide the exported string for a key path given translation map + fallback policy.
 * Returns null when the original text should be kept unchanged.
 */
export function resolveExportString(
  keyPath: string,
  original: string,
  translations: Map<string, string>,
  fallbackToSource: boolean,
): string | null {
  if (translations.has(keyPath)) {
    const t = translations.get(keyPath)!;
    if (t.length > 0) {
      return t === original ? null : t;
    }
    // empty translation
    if (fallbackToSource) return null; // keep original
    return original === "" ? null : "";
  }
  if (fallbackToSource) return null;
  return original === "" ? null : "";
}

function parseJson(content: string): ParseResult {
  const formatMeta = detectJsonFormatMeta(content);
  const stripped =
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const parsed = parseJsonFile(stripped);
  if (parsed.error) {
    return {
      data: {},
      entries: [],
      formatMeta,
      warnings: [],
      error: parsed.error,
    };
  }
  const { entries, warnings } = flattenJson(parsed.data);
  return {
    data: parsed.data,
    entries,
    formatMeta,
    warnings,
  };
}

export const jsonHandler: FormatHandler = {
  id: "json",
  extensions: [".json"],
  contentType: "application/json; charset=utf-8",
  parse: parseJson,
  export(rawContent, data, translations, formatMeta, options) {
    const fallbackToSource = options?.fallbackToSource ?? true;
    const bom =
      rawContent && rawContent.charCodeAt(0) === 0xfeff
        ? "\uFEFF"
        : formatMeta?.bom
          ? "\uFEFF"
          : "";
    const raw =
      rawContent && rawContent.charCodeAt(0) === 0xfeff
        ? rawContent.slice(1)
        : rawContent;

    // Prefer surgical patch on original text — keeps spacing/key order/etc.
    if (raw && raw.trim()) {
      const patched = patchJsonStringValues(raw, (keyPath, original) =>
        resolveExportString(keyPath, original, translations, fallbackToSource),
      );
      if (patched !== null) {
        return bom + patched;
      }
    }

    // Fallback: structure walk + re-serialize (best-effort)
    let tree: unknown = data;
    if (raw && raw.trim()) {
      try {
        const reparsed = JSON.parse(raw) as unknown;
        if (reparsed && typeof reparsed === "object" && !Array.isArray(reparsed)) {
          tree = reparsed;
        }
      } catch {
        /* use data */
      }
    }
    const exported = exportWithStructure(tree, translations, { fallbackToSource });
    const meta =
      formatMeta ??
      (rawContent ? detectJsonFormatMeta(rawContent) : defaultFormatMeta());
    // Avoid double BOM when raw already had one stripped into `bom`
    return serializeJson(exported, { ...meta, bom: Boolean(meta.bom) && !bom });
  },
};
