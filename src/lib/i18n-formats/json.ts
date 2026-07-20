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

  // Minified: no newline after opening brace / between keys at top level
  const indent = detectIndent(text);

  return { indent, trailingNewline, newline, bom };
}

function detectIndent(text: string): number | string {
  // Prefer first indented object/array child line
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
  // Single-line / compact
  if (!text.includes("\n") || /^\{[^\n]*\}$/.test(text.trim())) {
    return 0;
  }
  return 2;
}

/**
 * Serialize JSON using detected style (indent, newline, trailing NL, BOM).
 */
export function serializeJson(data: unknown, meta?: FormatMeta | null): string {
  const m = meta ?? defaultFormatMeta();
  const indent = m.indent ?? 2;
  let body =
    indent === 0 || indent === ""
      ? JSON.stringify(data)
      : JSON.stringify(data, null, indent);

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
    // Prefer re-parse of original text so key order matches the file, not jsonb.
    let tree: unknown = data;
    if (rawContent && rawContent.trim()) {
      const stripped =
        rawContent.charCodeAt(0) === 0xfeff ? rawContent.slice(1) : rawContent;
      try {
        const reparsed = JSON.parse(stripped) as unknown;
        if (reparsed && typeof reparsed === "object" && !Array.isArray(reparsed)) {
          tree = reparsed;
        }
      } catch {
        // fall back to stored data
      }
    }
    const exported = exportWithStructure(tree, translations, {
      fallbackToSource: options?.fallbackToSource ?? true,
    });
    const meta =
      formatMeta ??
      (rawContent ? detectJsonFormatMeta(rawContent) : defaultFormatMeta());
    return serializeJson(exported, meta);
  },
};
