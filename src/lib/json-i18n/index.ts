export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type FlatEntry = {
  keyPath: string;
  sourceText: string;
  sortOrder: number;
};

export type FlattenResult = {
  entries: FlatEntry[];
  warnings: string[];
};

const MAX_DEPTH = 32;
const MAX_KEYS = 20_000;

/**
 * Flatten nested JSON objects into dot-path string leaves.
 * Arrays / numbers / booleans are skipped with warnings.
 */
export function flattenJson(
  input: unknown,
  options?: { maxKeys?: number; maxDepth?: number },
): FlattenResult {
  const maxKeys = options?.maxKeys ?? MAX_KEYS;
  const maxDepth = options?.maxDepth ?? MAX_DEPTH;
  const entries: FlatEntry[] = [];
  const warnings: string[] = [];
  let order = 0;

  function walk(node: unknown, prefix: string, depth: number) {
    if (entries.length >= maxKeys) {
      warnings.push(`Exceeded max key limit (${maxKeys}); remaining keys skipped`);
      return;
    }
    if (depth > maxDepth) {
      warnings.push(`Max depth ${maxDepth} exceeded at "${prefix || "(root)"}"`);
      return;
    }

    if (typeof node === "string") {
      entries.push({
        keyPath: prefix || "(root)",
        sourceText: node,
        sortOrder: order++,
      });
      return;
    }

    if (node === null || node === undefined) {
      warnings.push(`Skipped null/undefined at "${prefix || "(root)"}"`);
      return;
    }

    if (Array.isArray(node)) {
      warnings.push(`Skipped array at "${prefix || "(root)"}"`);
      return;
    }

    if (typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key.includes(".")) {
          warnings.push(`Key segment contains "." which may collide with paths: "${key}"`);
        }
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") {
          if (entries.length >= maxKeys) {
            warnings.push(`Exceeded max key limit (${maxKeys}); remaining keys skipped`);
            return;
          }
          entries.push({ keyPath: path, sourceText: value, sortOrder: order++ });
        } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
          walk(value, path, depth + 1);
        } else if (Array.isArray(value)) {
          warnings.push(`Skipped array at "${path}"`);
        } else if (typeof value === "number" || typeof value === "boolean") {
          warnings.push(`Skipped ${typeof value} at "${path}"`);
        } else if (value === null) {
          warnings.push(`Skipped null at "${path}"`);
        }
      }
      return;
    }

    warnings.push(`Skipped ${typeof node} at "${prefix || "(root)"}"`);
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      entries: [],
      warnings: ["Root must be a JSON object"],
    };
  }

  walk(input, "", 0);
  return { entries, warnings };
}

/**
 * Build nested object from flat key paths (last write wins on conflicts).
 */
export function unflattenEntries(
  entries: Iterable<{ keyPath: string; text: string }>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  for (const { keyPath, text } of entries) {
    if (!keyPath || keyPath === "(root)") {
      // root-level string files are rare; skip structural overwrite
      continue;
    }
    const parts = keyPath.split(".");
    let cursor: Record<string, unknown> = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const next = cursor[part];
      if (next === undefined || typeof next !== "object" || next === null || Array.isArray(next)) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]!] = text;
  }

  return root;
}

/**
 * Export by walking the original source tree and replacing string leaves
 * with translations when available.
 */
export function exportWithStructure(
  rawSource: unknown,
  translations: Map<string, string>,
  options?: { fallbackToSource?: boolean },
): unknown {
  const fallback = options?.fallbackToSource ?? true;

  function walk(node: unknown, prefix: string): unknown {
    if (typeof node === "string") {
      const key = prefix || "(root)";
      if (translations.has(key)) {
        const t = translations.get(key)!;
        if (t.length > 0) return t;
      }
      return fallback ? node : "";
    }
    if (Array.isArray(node)) {
      return node.map((item, i) => walk(item, prefix ? `${prefix}.${i}` : String(i)));
    }
    if (node !== null && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        out[key] = walk(value, path);
      }
      return out;
    }
    return node;
  }

  return walk(rawSource, "");
}

export function parseJsonFile(content: string): { data: Record<string, unknown>; error?: string } {
  try {
    const data = JSON.parse(content) as unknown;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { data: {}, error: "Root must be a JSON object" };
    }
    return { data: data as Record<string, unknown> };
  } catch (e) {
    return { data: {}, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

export function computeContentHash(content: string): string {
  // Simple non-crypto hash for change detection (FNV-1a 32-bit)
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
