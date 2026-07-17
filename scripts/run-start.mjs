#!/usr/bin/env node
/**
 * Production starter: load config.json → inject env → next start
 * Usage: node scripts/run-start.mjs
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

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
