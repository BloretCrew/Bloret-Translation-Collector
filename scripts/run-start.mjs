#!/usr/bin/env node
/**
 * Production starter: load config.json → inject env → next start
 * Usage: node scripts/run-start.mjs
 * 
 * Signal handling note:
 * With stdio:"inherit", Ctrl+C (SIGINT) is sent to both this process and
 * the child (Next.js). We must intercept it here first, so we can wait
 * for the child to fully exit before we die — otherwise the child gets
 * orphaned and keeps running in the background.
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { configToEnv, loadConfigFile, root } from "./lib-config.mjs";

const { path: configPath, config } = loadConfigFile();

if (!config) {
  console.error(`[ERROR] 找不到配置文件: ${configPath}`);
  console.error("请复制 config.example.json 为 config.json 并修改。");
  process.exit(1);
}

const port = Number(config.port) || 3000;
const env = configToEnv(config, { NODE_ENV: "production" });

const nextBin = join(root, "node_modules", ".bin", "next");
if (!existsSync(nextBin)) {
  console.error("[ERROR] 未找到 next，请先在项目目录执行: npm install && npm run build");
  process.exit(1);
}

const db = config.database || {};
console.log(`[INFO] 使用配置: ${configPath}`);
console.log(
  `[INFO] 数据库: ${db.user || "?"}@${db.host || "?"}:${db.port || "?"} / ${db.name || "?"}`,
);
console.log(`[INFO] 启动 Next.js 于端口 ${port} …`);

const child = spawn(nextBin, ["start", "-p", String(port)], {
  cwd: root,
  env,
  stdio: "inherit",
});

/* —— Signal forwarding to prevent orphaned child —— */
function forwardSignal(signal) {
  if (!child || child.killed) return;
  child.kill(signal);
  // Force-kill if child ignores the signal
  const timer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 10_000);
  timer.unref();
}
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  // Re-raise signal to ourselves so the shell sees the right exit status
  if (signal && process.listenerCount(signal) === 0) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
