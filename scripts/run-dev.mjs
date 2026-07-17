#!/usr/bin/env node
/**
 * Dev starter: load config.json → inject env → next dev
 */
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "config.json");

let config = {};
if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} else {
  console.warn("[WARN] config.json 不存在，使用默认配置");
}

const port = Number(config.port) || 3000;
const env = {
  ...process.env,
  DATABASE_URL:
    config.databaseUrl ??
    "postgresql://bloret:bloret@127.0.0.1:5432/translation_collector",
  SESSION_SECRET: config.sessionSecret ?? "dev-only-session-secret-change-me-32chars",
  COOKIE_SECURE: config.cookieSecure === true ? "true" : "false",
  PASSPORT_APP_ID: config.passport?.appId ?? "",
  PASSPORT_APP_SECRET: config.passport?.appSecret ?? "",
  PASSPORT_BASE_URL: config.passport?.baseUrl ?? "https://passport.bloret.net",
  OAUTH_REDIRECT_URI:
    config.passport?.redirectUri ?? `http://localhost:${port}/auth/callback`,
  NEXT_PUBLIC_APP_NAME: config.appName ?? "Bloret Translation",
  PORT: String(port),
};

const nextBin = join(root, "node_modules", ".bin", "next");
const child = spawn(nextBin, ["dev", "--turbopack", "-p", String(port)], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
