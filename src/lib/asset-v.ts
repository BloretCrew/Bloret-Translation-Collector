import { createHash } from "crypto";
import { existsSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Resolve project root whether this module is:
 * - source:  src/lib/asset-v.ts  → ../..
 * - bundled: dist/server.mjs     → ..
 * - cwd fallback when import.meta is wrong
 */
export function projectRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, ".."), // dist/server.mjs
    path.join(here, "../.."), // src/lib/*.ts
    process.cwd(),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, "public", "js", "app.js"))) return c;
    if (existsSync(path.join(c, "package.json")) && existsSync(path.join(c, "public"))) {
      return c;
    }
  }
  return process.cwd();
}

/**
 * Stable asset version for cache-busting query strings.
 * Prefer BTC_ASSET_V; otherwise hash mtimes of main public bundles so restarts
 * without file changes keep the same version (browser cache stays warm).
 *
 * IMPORTANT: must resolve public/ correctly after esbuild bundles into dist/,
 * otherwise every page ships ?v=da39a3ee5e6b (empty SHA1) and browsers never
 * pick up new JS/CSS.
 */
export function computeAssetV(
  files: string[] = [
    "public/blora/blora.css",
    "public/blora/blora.js",
    "public/css/app.css",
    "public/js/app.js",
    "public/js/forms.js",
    "public/js/editor.js",
    "public/js/sf-icon.js",
    "public/js/settings-tabs.js",
    "public/js/project-settings.js",
    "public/js/locale-picker.js",
    "public/js/user-settings.js",
    "public/js/export-page.js",
    "public/js/editor-shortcuts.js",
    "public/js/entity-icon.js",
  ],
  root = projectRoot(),
): string {
  if (process.env.BTC_ASSET_V) return process.env.BTC_ASSET_V;

  const h = createHash("sha1");
  let counted = 0;
  for (const rel of files) {
    const full = path.join(root, rel);
    if (!existsSync(full)) continue;
    try {
      const st = statSync(full);
      h.update(rel);
      h.update(String(st.mtimeMs));
      h.update(String(st.size));
      counted += 1;
    } catch {
      /* skip */
    }
  }
  // Never return empty-input digest — it freezes cache-bust forever
  if (counted === 0) {
    h.update(String(Date.now()));
    h.update(root);
  }
  return h.digest("hex").slice(0, 12);
}
