import type { FlatEntry } from "@/lib/json-i18n";
import type { FormatHandler, FormatMeta, ParseResult } from "./types";
import { defaultFormatMeta } from "./types";

type PropLine =
  | { kind: "blank"; raw: string }
  | { kind: "comment"; raw: string }
  | { kind: "entry"; raw: string; key: string; value: string; separator: string }
  | { kind: "other"; raw: string };

/**
 * Minimal Java .properties parser (ISO-8859-1 style keys as UTF-8 text).
 * Supports #/! comments, blank lines, key=value / key:value, basic \ continuation.
 */
export function parsePropertiesContent(content: string): {
  lines: PropLine[];
  entries: FlatEntry[];
  formatMeta: FormatMeta;
  warnings: string[];
} {
  let text = content;
  let bom = false;
  if (text.charCodeAt(0) === 0xfeff) {
    bom = true;
    text = text.slice(1);
  }
  const newline: "\n" | "\r\n" = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = /\r?\n$/.test(content);
  const formatMeta: FormatMeta = {
    ...defaultFormatMeta(),
    indent: 0,
    trailingNewline,
    newline,
    bom,
    extra: { separator: "=" },
  };

  const logicalLines = joinContinuations(text.split(/\r?\n/));
  const lines: PropLine[] = [];
  const entries: FlatEntry[] = [];
  const warnings: string[] = [];
  let order = 0;
  let sepStats = { eq: 0, colon: 0 };

  for (const raw of logicalLines) {
    const trimmedStart = raw.replace(/^\s+/, "");
    if (raw === "" || trimmedStart === "") {
      lines.push({ kind: "blank", raw });
      continue;
    }
    if (trimmedStart.startsWith("#") || trimmedStart.startsWith("!")) {
      lines.push({ kind: "comment", raw });
      continue;
    }

    const parsed = splitKeyValue(raw);
    if (!parsed) {
      lines.push({ kind: "other", raw });
      warnings.push(`Skipped unparseable properties line: ${raw.slice(0, 80)}`);
      continue;
    }

    if (parsed.separator === ":") sepStats.colon++;
    else sepStats.eq++;

    const key = unescapeProp(parsed.key.trim());
    const value = unescapeProp(parsed.value);
    lines.push({
      kind: "entry",
      raw,
      key,
      value,
      separator: parsed.separator,
    });
    entries.push({ keyPath: key, sourceText: value, sortOrder: order++ });
  }

  formatMeta.extra = {
    separator: sepStats.colon > sepStats.eq ? ":" : "=",
  };

  return { lines, entries, formatMeta, warnings };
}

/** True if line ends with an odd number of backslashes (continuation). */
function endsWithContinuation(line: string): boolean {
  let n = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === "\\"; i--) n++;
  return n % 2 === 1;
}

function joinContinuations(rawLines: string[]): string[] {
  // Preserve trailing empty segment from final newline as a blank logical line later via split
  const lines = [...rawLines];
  // If content ends with newline, split yields trailing ""; keep it for blank detection
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (buf) {
      // continued line: drop leading whitespace of continuation (Java properties style)
      buf += line.replace(/^\s+/, "");
    } else {
      buf = line;
    }
    if (endsWithContinuation(buf)) {
      buf = buf.slice(0, -1);
      continue;
    }
    out.push(buf);
    buf = "";
  }
  if (buf) out.push(buf);
  return out;
}

function splitKeyValue(
  line: string,
): { key: string; value: string; separator: string } | null {
  let i = 0;
  // skip leading whitespace
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  let key = "";
  let escaped = false;
  for (; i < line.length; i++) {
    const c = line[i]!;
    if (escaped) {
      key += c;
      escaped = false;
      continue;
    }
    if (c === "\\") {
      key += c;
      escaped = true;
      continue;
    }
    if (c === "=" || c === ":" || c === " " || c === "\t") {
      break;
    }
    key += c;
  }
  if (!key) return null;

  // skip whitespace before separator
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  let separator = "=";
  if (i < line.length && (line[i] === "=" || line[i] === ":")) {
    separator = line[i]!;
    i++;
  }
  // skip whitespace after separator
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  const value = line.slice(i);
  return { key, value, separator };
}

function unescapeProp(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const n = s[i + 1]!;
      if (n === "n") {
        out += "\n";
        i++;
      } else if (n === "t") {
        out += "\t";
        i++;
      } else if (n === "r") {
        out += "\r";
        i++;
      } else if (n === "u" && i + 5 < s.length) {
        const hex = s.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          out += n;
          i++;
        }
      } else {
        out += n;
        i++;
      }
    } else {
      out += s[i];
    }
  }
  return out;
}

function escapePropValue(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function exportPropertiesFromLines(
  lines: PropLine[],
  translations: Map<string, string>,
  formatMeta: FormatMeta,
  fallbackToSource: boolean,
): string {
  const nl = formatMeta.newline ?? "\n";
  const outLines: string[] = [];

  for (const line of lines) {
    if (line.kind !== "entry") {
      outLines.push(line.raw);
      continue;
    }
    let value = line.value;
    if (translations.has(line.key)) {
      const t = translations.get(line.key)!;
      if (t.length > 0) value = t;
      else if (!fallbackToSource) value = "";
    } else if (!fallbackToSource) {
      value = "";
    }
    // Rebuild: preserve original spacing style loosely as key + sep + value
    const sep = line.separator || "=";
    // Keep "key=value" without forcing spaces (common for Java props)
    outLines.push(`${line.key}${sep}${escapePropValue(value)}`);
  }

  let body = outLines.join(nl);
  const wantsTrail = formatMeta.trailingNewline !== false;
  if (wantsTrail && !body.endsWith(nl)) body += nl;
  if (!wantsTrail && body.endsWith(nl)) {
    body = body.replace(/(?:\r?\n)+$/, "");
  }
  if (formatMeta.bom) body = "\uFEFF" + body;
  return body;
}

function parseProperties(content: string): ParseResult {
  const { lines, entries, formatMeta, warnings } = parsePropertiesContent(content);
  if (entries.length === 0 && warnings.length && !lines.some((l) => l.kind === "entry")) {
    // empty file is ok; only error if completely invalid non-empty without keys
    if (content.trim() && !lines.some((l) => l.kind === "comment" || l.kind === "blank")) {
      return {
        data: {},
        entries: [],
        formatMeta,
        warnings,
        error: "未解析到任何 properties 键值对",
      };
    }
  }
  // data: flat object for raw_source compatibility
  const data: Record<string, unknown> = {};
  for (const e of entries) data[e.keyPath] = e.sourceText;
  // stash lines in formatMeta.extra for export without re-parse issues — actually
  // export re-parses raw_content; data is enough for fallback.
  void lines;
  return { data, entries, formatMeta, warnings };
}

export const propertiesHandler: FormatHandler = {
  id: "properties",
  extensions: [".properties"],
  contentType: "text/plain; charset=utf-8",
  parse: parseProperties,
  export(rawContent, data, translations, formatMeta, options) {
    const fallbackToSource = options?.fallbackToSource ?? true;
    if (rawContent && rawContent.trim()) {
      const { lines, formatMeta: detected } = parsePropertiesContent(rawContent);
      return exportPropertiesFromLines(
        lines,
        translations,
        formatMeta ?? detected,
        fallbackToSource,
      );
    }
    // Fallback: rebuild from flat data
    const sep =
      (formatMeta?.extra?.separator as string | undefined) === ":" ? ":" : "=";
    const nl = formatMeta?.newline ?? "\n";
    const lines: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (typeof val !== "string") continue;
      let value = val;
      if (translations.has(key)) {
        const t = translations.get(key)!;
        if (t.length > 0) value = t;
        else if (!fallbackToSource) value = "";
      } else if (!fallbackToSource) {
        value = "";
      }
      lines.push(`${key}${sep}${escapePropValue(value)}`);
    }
    let body = lines.join(nl);
    if (formatMeta?.trailingNewline !== false) body += nl;
    return body;
  },
};
