#!/usr/bin/env node
/**
 * Production starter: load config.json → inject env → tsx server
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

const tsxBin = join(root, "node_modules", ".bin", "tsx");
if (!existsSync(tsxBin)) {
  console.error("[ERROR] 未找到 tsx，请先在项目目录执行: npm install");
  process.exit(1);
}

const db = config.database || {};
console.log(`[INFO] 使用配置: ${configPath}`);
console.log(
  `[INFO] 数据库: ${db.user || "?"}@${db.host || "?"}:${db.port || "?"} / ${db.name || "?"}`,
);
console.log(`[INFO] 启动 Express 于端口 ${port} …`);

const child = spawn(tsxBin, ["src/server.ts"], {
  cwd: root,
  env: { ...env, PORT: String(port) },
  stdio: "inherit",
});

function forwardSignal(signal) {
  if (!child || child.killed) return;
  child.kill(signal);
  const timer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 10_000);
  timer.unref();
}
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal && process.listenerCount(signal) === 0) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
