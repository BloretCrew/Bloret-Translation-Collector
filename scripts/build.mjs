#!/usr/bin/env node
/**
 * Bundle the Express server to dist/server.mjs for fast cold starts.
 * Avoids runtime TypeScript transform via tsx.
 */
import { build } from "esbuild";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Logger } from "./lib-logger.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = join(root, "dist", "server.mjs");

mkdirSync(dirname(outfile), { recursive: true });

const t0 = Date.now();
// Bundle deps into one file: avoids slow multi-file node_modules walks
// on overloaded hosts (load avg 20+ / low free RAM). Keep only packages
// that break under bundling as external.
await build({
  entryPoints: [join(root, "src", "server.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // postgres uses dynamic import/worker-ish bits; leave external
  external: ["postgres"],
  alias: {
    "@": join(root, "src"),
  },
  logLevel: "warning",
  sourcemap: true,
  banner: {
    // Allow CJS deps that call require("tty") etc. inside an ESM bundle
    js: `import { createRequire as __btcCreateRequire } from "module";
const require = __btcCreateRequire(import.meta.url);`,
  },
});

Logger.success(`Built ${outfile} in ${Date.now() - t0}ms`);
