#!/usr/bin/env node
/**
 * Production starter: load config.json → inject env → run bundled server
 * (falls back to building dist/ if missing)
 */
import { spawn, spawnSync } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { configToEnv, loadConfigFile, root } from "./lib-config.mjs";
import { Logger } from "./lib-logger.mjs";

const { path: configPath, config } = loadConfigFile();

if (!config) {
  Logger.error(`找不到配置文件: ${configPath}`);
  Logger.error("请复制 config.example.json 为 config.json 并修改。");
  process.exit(1);
}

const port = Number(config.port) || 3000;
const env = configToEnv(config, { NODE_ENV: "production" });

const distServer = join(root, "dist", "server.mjs");
const entryTs = join(root, "src", "server.ts");
const buildScript = join(root, "scripts", "build.mjs");

function needsBuild() {
  if (!existsSync(distServer)) return true;
  try {
    const distM = statSync(distServer).mtimeMs;
    if (statSync(entryTs).mtimeMs > distM) return true;
    return false;
  } catch {
    return true;
  }
}

if (needsBuild()) {
  Logger.info("未找到最新 dist，正在构建…");
  const r = spawnSync(process.execPath, [buildScript], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    Logger.error("构建失败。也可手动执行: npm run build");
    process.exit(r.status ?? 1);
  }
  Logger.success("构建完成");
}

const db = config.database || {};
Logger.info(`使用配置: ${configPath}`);
Logger.info(
  `数据库: ${db.user || "?"}@${db.host || "?"}:${db.port || "?"} / ${db.name || "?"}`,
);
Logger.info(`启动 Express 于端口 ${port} …`);

const child = spawn(process.execPath, [distServer], {
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
