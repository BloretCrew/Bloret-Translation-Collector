#!/usr/bin/env node
/**
 * Production starter: load config.json → inject env → next start
 * Usage: node scripts/run-start.mjs
 */
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "config.json");

if (!existsSync(configPath)) {
  console.error(`[ERROR] 找不到配置文件: ${configPath}`);
  console.error("请复制 config.example.json 为 config.json 并修改。");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (e) {
  console.error("[ERROR] config.json 解析失败:", e.message);
  process.exit(1);
}

const port = Number(config.port) || 3000;
const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: config.databaseUrl ?? "",
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
if (!existsSync(nextBin)) {
  console.error("[ERROR] 未找到 next，请先在项目目录执行: npm install && npm run build");
  process.exit(1);
}

console.log(`[INFO] 使用配置: ${configPath}`);
console.log(`[INFO] 启动 Next.js 于端口 ${port} …`);

const child = spawn(nextBin, ["start", "-p", String(port)], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
