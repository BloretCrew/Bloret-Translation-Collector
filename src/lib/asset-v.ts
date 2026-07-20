import { createHash } from "crypto";
import { existsSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Stable asset version for cache-busting query strings.
 * Prefer BTC_ASSET_V; otherwise hash mtimes of main public bundles so restarts
 * without file changes keep the same version (browser cache stays warm).
 */
export function computeAssetV(files: string[] = [
  "public/blora/blora.css",
  "public/blora/blora.js",
  "public/css/app.css",
  "public/js/app.js",
  // Page scripts are also versioned with ?v=assetV — include so deploys bust cache
  "public/js/forms.js",
  "public/js/editor.js",
  "public/js/sf-icon.js",
  "public/js/settings-tabs.js",
  "public/js/project-settings.js",
  "public/js/locale-picker.js",
  "public/js/user-settings.js",
  "public/js/export-page.js",
  "public/js/editor-shortcuts.js",
]): string {
  if (process.env.BTC_ASSET_V) return process.env.BTC_ASSET_V;

  const h = createHash("sha1");
  for (const rel of files) {
    const full = path.join(root, rel);
    if (!existsSync(full)) continue;
    try {
      const st = statSync(full);
      h.update(rel);
      h.update(String(st.mtimeMs));
      h.update(String(st.size));
    } catch {
      /* skip */
    }
  }
  return h.digest("hex").slice(0, 12);
}
